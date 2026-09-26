import { useState, useRef, useCallback, useEffect } from "react";

/* ============================================================
   Ses kaydi + sunucuda yaziya cevirme + akisli TTS

   26 Eylul 2026 - SES TANIMA DEGISTI:
   Eskiden tarayicinin webkitSpeechRecognition'i kullaniliyordu. Android'de
   her basista Google'in tanima servisine baglaniyor, 1-2 sn geciyordu ve
   o arada soylenen ilk kelimeler kayboluyordu. API'de bunu kisaltmanin
   yolu yok.

   Simdi: MediaRecorder basar basmaz kayda baslar, birakinca kayit
   /api/stt'ye gider, sunucu yaziya cevirir (OpenAI, olmazsa ElevenLabs).
   Mikrofon son kullanimdan sonra 45 sn acik tutulur; art arda basislarda
   izin/acilis beklemesi olmaz, sonra kapatilir (mikrofon gostergesi soner).

   Disari acilan arayuz eskisiyle ayni + iki ek:
     stopAndTranscribe(): Promise<string>  - kaydi bitir, metni dondur
     isTranscribing                          - metin bekleniyor
   stopListening() artik kaydi COPE atar (sifirlama/iptal icin).
   ============================================================ */

type Language = "tr" | "en";

/** Ardışık tekrar eden kelime ve 2-4 kelimelik öbekleri temizler. */
export function dedupeRepeats(text: string): string {
  if (!text) return text;

  const words = text.trim().split(/\s+/);

  /* Tek kelime tekrarı: "Angel Angel Angel" -> "Angel" */
  const singles: string[] = [];
  for (const word of words) {
    const prev = singles[singles.length - 1];
    if (!prev || prev.toLowerCase() !== word.toLowerCase()) singles.push(word);
  }

  /* Öbek tekrarı: "Selam Angel Selam Angel" -> "Selam Angel" */
  for (let size = 4; size >= 2; size--) {
    let i = 0;
    while (i + size * 2 <= singles.length) {
      const a = singles.slice(i, i + size).join(" ").toLowerCase();
      const b = singles.slice(i + size, i + size * 2).join(" ").toLowerCase();
      if (a === b) {
        singles.splice(i + size, size);
      } else {
        i++;
      }
    }
  }

  return singles.join(" ");
}

/* ------------------------------------------------------------
   Ses kaydi (bas-konus-birak)
   ------------------------------------------------------------ */
const MIC_KEEP_WARM_MS = 45_000;
const MIN_RECORDING_MS = 400;

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function useSpeechRecognition(language: Language = "tr") {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const wantRecordingRef = useRef(false);
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSupported =
    typeof window !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const scheduleRelease = useCallback(() => {
    if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
    releaseTimerRef.current = setTimeout(releaseStream, MIC_KEEP_WARM_MS);
  }, [releaseStream]);

  const getStream = useCallback(async () => {
    if (releaseTimerRef.current) {
      clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
    const current = streamRef.current;
    if (current && current.getAudioTracks().some((track) => track.readyState === "live")) {
      return current;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    streamRef.current = stream;
    return stream;
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError("unsupported");
      return;
    }
    setError(null);
    setTranscript("");
    chunksRef.current = [];
    wantRecordingRef.current = true;
    // Gorsel geri bildirim ANINDA - mikrofon hazirlanirken bile.
    setIsListening(true);

    startPromiseRef.current = (async () => {
      try {
        const stream = await getStream();
        if (!wantRecordingRef.current) {
          // Kullanici mikrofon hazir olmadan birakti
          scheduleRelease();
          return;
        }
        const mimeType = pickMimeType();
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        };
        recorderRef.current = recorder;
        startedAtRef.current = Date.now();
        recorder.start(250);
      } catch (err: any) {
        console.error("[VOICE] Mikrofon açılamadı:", err);
        wantRecordingRef.current = false;
        setIsListening(false);
        setError(err?.name === "NotAllowedError" ? "not-allowed" : "audio-capture");
      }
    })();
  }, [isSupported, getStream, scheduleRelease]);

  /** Kaydi bitirir, cope atmaz; metni dondurur. Bos donerse gonderilecek bir sey yok. */
  const stopAndTranscribe = useCallback(async (): Promise<string> => {
    wantRecordingRef.current = false;
    await startPromiseRef.current?.catch(() => undefined);
    setIsListening(false);

    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (!recorder || recorder.state === "inactive") {
      scheduleRelease();
      return "";
    }

    const duration = Date.now() - startedAtRef.current;
    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () =>
        resolve(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
      recorder.stop();
    });
    chunksRef.current = [];
    scheduleRelease();

    // Yanlislikla dokunma - gonderme
    if (duration < MIN_RECORDING_MS || blob.size < 1000) return "";

    setIsTranscribing(true);
    try {
      const audio = await blobToBase64(blob);
      const res = await fetch("/api/stt", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio, mimeType: blob.type, language }),
      });
      if (!res.ok) throw new Error("STT " + res.status);
      const data = await res.json();
      const text = dedupeRepeats(String(data.text ?? "").trim());
      setTranscript(text);
      return text;
    } catch (err) {
      console.error("[VOICE] Yazıya çevrilemedi:", err);
      setError("network");
      return "";
    } finally {
      setIsTranscribing(false);
    }
  }, [language, scheduleRelease]);

  /** Kaydi iptal eder, metin uretmez. */
  const stopListening = useCallback(() => {
    wantRecordingRef.current = false;
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      try {
        recorder.stop();
      } catch {
        /* zaten durmus */
      }
    }
    chunksRef.current = [];
    setIsListening(false);
    scheduleRelease();
  }, [scheduleRelease]);

  const resetTranscript = useCallback(() => setTranscript(""), []);

  useEffect(() => {
    return () => {
      wantRecordingRef.current = false;
      if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
      try {
        if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
      } catch {
        /* yoksay */
      }
      releaseStream();
    };
  }, [releaseStream]);

  return {
    isListening,
    isTranscribing,
    transcript,
    error,
    isSupported,
    startListening,
    stopListening,
    stopAndTranscribe,
    resetTranscript,
  };
}

/* ------------------------------------------------------------
   Akışlı TTS — sunucudaki /api/tts/stream (ElevenLabs)
   ------------------------------------------------------------ */
export function useStreamingTTS(
  personality: 1 | 2 | 3,
  gender: "male" | "female" = "female",
  language: Language = "tr",
) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastAudioUrl, setLastAudioUrl] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlsRef = useRef<string[]>([]);

  const isSupported = typeof window !== "undefined" && typeof Audio !== "undefined";

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
  }, []);

  const playUrl = useCallback(
    (url: string) =>
      new Promise<void>((resolve, reject) => {
        cleanup();
        const audio = new Audio(url);
        audioRef.current = audio;

        audio.onplay = () => setIsSpeaking(true);
        audio.onended = () => {
          setIsSpeaking(false);
          resolve();
        };
        audio.onerror = () => {
          setIsSpeaking(false);
          reject(new Error("ses çalınamadı"));
        };

        audio.play().catch(reject);
      }),
    [cleanup],
  );

  const speak = useCallback(
    async (text: string, subLevel: 1 | 2 = 1) => {
      if (!text?.trim() || !isSupported) return null;

      setIsLoading(true);
      try {
        const res = await fetch("/api/tts/stream", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            // Sunucu bu alani "personality" adiyla okuyor (/api/tts/stream).
            // "character" adiyla gonderilirse alan eslesmez ve sunucu
            // varsayilan personality=2 (Bestie) sesine duser.
            personality,
            subLevel,
            gender,
            language, // FIX: dil parametresi eksikti, yanlış aksan çıkıyordu
          }),
        });

        if (!res.ok) throw new Error(`TTS ${res.status}`);

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        objectUrlsRef.current.push(url);
        setLastAudioUrl(url);

        setIsLoading(false);
        await playUrl(url);
        return url;
      } catch (err) {
        console.error("[TTS] Hata:", err);
        setIsLoading(false);
        setIsSpeaking(false);
        return null;
      }
    },
    [personality, gender, language, isSupported, playUrl],
  );

  const replayFromUrl = useCallback(
    async (url: string) => {
      if (!url) return;
      try {
        await playUrl(url);
      } catch (err) {
        console.error("[TTS] Tekrar oynatma hatası:", err);
      }
    },
    [playUrl],
  );

  const stop = useCallback(() => {
    cleanup();
    setIsSpeaking(false);
    setIsLoading(false);
  }, [cleanup]);

  /* Bileşen kalkarken blob URL'lerini serbest bırak — bellek sızıntısı olmasın */
  useEffect(() => {
    return () => {
      cleanup();
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
    };
  }, [cleanup]);

  return {
    isSpeaking,
    isLoading,
    isSupported,
    speak,
    stop,
    replayFromUrl,
    lastAudioUrl,
  };
}
