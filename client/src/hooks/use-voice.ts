import { useState, useRef, useCallback, useEffect } from "react";

/* ============================================================
   Ses tanıma + akışlı TTS
   Kayıp sürümde çözülmüş 4 hata burada korunuyor:
   1. language tipi "tr" | "en"  (eskiden yanlışlıkla "en" | "en" idi)
   2. continuous mobilde false   ("Salem Angel Salem Angel" tekrarı)
   3. dedupeRepeats              (ardışık kelime/öbek tekrarını temizler)
   4. network hatasında 2 kez otomatik yeniden deneme (400 ms arayla)
   ============================================================ */

type Language = "tr" | "en";

const isMobile = () =>
  typeof navigator !== "undefined" &&
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

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
   Konuşma tanıma
   ------------------------------------------------------------ */
export function useSpeechRecognition(language: Language = "tr") {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const retryCountRef = useRef(0);
  const shouldBeListeningRef = useRef(false);

  const SpeechRecognition =
    typeof window !== "undefined"
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : undefined;

  const isSupported = !!SpeechRecognition;

  const createRecognition = useCallback(() => {
    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();
    recognition.lang = language === "tr" ? "tr-TR" : "en-US";
    recognition.interimResults = true;
    // FIX: mobil Chrome'da continuous=true kelimeleri tekrarlıyor
    recognition.continuous = !isMobile();
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript + " ";
      }
      setTranscript(dedupeRepeats(text));
      retryCountRef.current = 0;
    };

    recognition.onerror = (event: any) => {
      // FIX: network hatası bağlantı dalgalanmasından kaynaklanır, 2 kez dene
      if (event.error === "network" && retryCountRef.current < 2) {
        retryCountRef.current += 1;
        setTimeout(() => {
          if (shouldBeListeningRef.current) {
            try {
              recognition.start();
            } catch {
              /* zaten çalışıyor */
            }
          }
        }, 400);
        return;
      }

      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("permission");
      } else if (event.error !== "aborted" && event.error !== "no-speech") {
        setError(event.error);
      }
      setIsListening(false);
      shouldBeListeningRef.current = false;
    };

    recognition.onend = () => {
      // Mobilde continuous kapalı olduğu için tanıyıcı kendiliğinden durur;
      // kullanıcı hâlâ basılı tutuyorsa yeniden başlat.
      if (shouldBeListeningRef.current && isMobile()) {
        try {
          recognition.start();
          return;
        } catch {
          /* yeniden başlatılamadı */
        }
      }
      setIsListening(false);
    };

    return recognition;
  }, [SpeechRecognition, language]);

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError("unsupported");
      return;
    }
    setError(null);
    setTranscript("");
    retryCountRef.current = 0;
    shouldBeListeningRef.current = true;

    const recognition = createRecognition();
    if (!recognition) return;
    recognitionRef.current = recognition;

    try {
      recognition.start();
      setIsListening(true);
    } catch (err) {
      console.error("[VOICE] Başlatılamadı:", err);
      setIsListening(false);
      shouldBeListeningRef.current = false;
    }
  }, [createRecognition, isSupported]);

  const stopListening = useCallback(() => {
    shouldBeListeningRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      /* zaten durmuş */
    }
    setIsListening(false);
  }, []);

  const resetTranscript = useCallback(() => setTranscript(""), []);

  useEffect(() => {
    return () => {
      shouldBeListeningRef.current = false;
      try {
        recognitionRef.current?.abort();
      } catch {
        /* yoksay */
      }
    };
  }, []);

  return {
    isListening,
    transcript,
    error,
    isSupported,
    startListening,
    stopListening,
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
            character: personality,
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
