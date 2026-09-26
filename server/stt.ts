/**
 * /api/stt - bas-konus-birak kaydini yaziya cevirir.
 *
 * NEDEN SUNUCUDA:
 * Tarayicinin ses tanimasi Android'de her basista 1-2 sn gec basliyordu.
 * Istemci artik MediaRecorder ile aninda kaydediyor, cevirme burada.
 *
 * SAGLAYICI SIRASI:
 *   1. OpenAI gpt-4o-mini-transcribe (ucuz, Turkcede iyi)
 *   2. ElevenLabs Scribe (TTS icin zaten kullanilan anahtar; yedek)
 * Biri calismazsa digeri denenir; ikisi de duserse 502.
 *
 * ONIZLEME (partial: true): kayit surerken istemci her 1,5 sn'de o ana
 * kadarki sesi gonderir. Onizlemeler loglanmaz; tam ceviri loglanir.
 *
 * OpenAI anahtari reddedilirse (401/403) 10 dk boyunca hic denenmez,
 * dogrudan ElevenLabs'e gidilir - her istekte bosuna bekleme olmasin.
 *
 * Kredi burada DUSMEZ: sesli mesaj gonderildiginde mevcut
 * /api/message-credits/use akisi zaten ucretlendiriyor.
 */

import type { Express, Request, Response } from "express";

const MAX_AUDIO_BYTES = 8 * 1024 * 1024; // ~ 30 dk opus; pratikte sinir degil, kotu niyet siniri

function extensionFor(mimeType: string): string {
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

let openAiDisabledUntil = 0;

async function transcribeWithOpenAI(audio: Buffer, mimeType: string, lang: "tr" | "en"): Promise<string> {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI anahtari yok");
  if (Date.now() < openAiDisabledUntil) throw new Error("OpenAI gecici olarak devre disi");
  const baseUrl = (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: mimeType }), "voice." + extensionFor(mimeType));
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("language", lang);

  const res = await fetch(baseUrl + "/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey },
    body: form,
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 401 || res.status === 403) openAiDisabledUntil = Date.now() + 10 * 60 * 1000;
  if (!res.ok) throw new Error("OpenAI " + res.status + ": " + (await res.text()).slice(0, 200));
  const data: any = await res.json();
  return String(data.text ?? "");
}

async function transcribeWithElevenLabs(audio: Buffer, mimeType: string, lang: "tr" | "en"): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ElevenLabs anahtari yok");

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: mimeType }), "voice." + extensionFor(mimeType));
  form.append("model_id", "scribe_v1");
  form.append("language_code", lang === "en" ? "eng" : "tur");

  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error("ElevenLabs " + res.status + ": " + (await res.text()).slice(0, 200));
  const data: any = await res.json();
  return String(data.text ?? "");
}

export function registerSttRoute(app: Express): void {
  app.post("/api/stt", async (req: Request, res: Response) => {
    if (!(req.session as any)?.userId) {
      return res.status(401).json({ message: "Bu islem icin giris yapmalisiniz" });
    }

    const { audio, mimeType, language } = req.body ?? {};
    if (typeof audio !== "string" || audio.length < 100) {
      return res.status(400).json({ message: "Geçersiz kayıt" });
    }

    const buffer = Buffer.from(audio, "base64");
    if (buffer.length > MAX_AUDIO_BYTES) {
      return res.status(413).json({ message: "Ses kaydı çok uzun" });
    }

    const lang: "tr" | "en" = language === "en" ? "en" : "tr";
    const partial = req.body?.partial === true;
    const type =
      typeof mimeType === "string" && mimeType ? mimeType.split(";")[0] : "audio/webm";

    const started = Date.now();
    try {
      const text = await transcribeWithOpenAI(buffer, type, lang);
      if (!partial) console.log("[STT] openai " + (Date.now() - started) + "ms, " + buffer.length + " bayt");
      return res.json({ text: text.trim() });
    } catch (err) {
      if (!partial) console.error("[STT] OpenAI başarısız, ElevenLabs deneniyor:", err);
    }

    try {
      const text = await transcribeWithElevenLabs(buffer, type, lang);
      if (!partial) console.log("[STT] elevenlabs " + (Date.now() - started) + "ms, " + buffer.length + " bayt");
      return res.json({ text: text.trim() });
    } catch (err) {
      if (!partial) console.error("[STT] ElevenLabs de başarısız:", err);
    }

    if (partial) return res.json({ text: "" });
    return res.status(502).json({ message: "Ses yazıya çevrilemedi" });
  });
}
