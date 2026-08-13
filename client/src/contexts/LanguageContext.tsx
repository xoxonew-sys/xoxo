import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type Language = "tr" | "en";

const translations: Record<Language, Record<string, string>> = {
  tr: {
    /* karakterler */
    "personality.angel.name": "Angel",
    "personality.bestie.name": "Bestie",
    "personality.snake.name": "Snake",
    "personality.angel.tagline": "Yumuşak, koruyucu, yargılamaz",
    "personality.bestie.tagline": "Samimi, dobra, hep yanında",
    "personality.snake.tagline": "Keskin dilli, acı gerçekçi",

    /* sohbet */
    "chat.speaking_to": "Konuştuğun kişi",
    "chat.empty_title": "Anlat bakalım",
    "chat.empty_subtitle": "Aklındakini yaz ya da mikrofona bas — burada kalır.",
    "chat.listening": "Dinliyorum...",
    "chat.continue_speaking": "Konuşmaya devam et",
    "chat.error": "Hata",
    "chat.speech_error": "Ses tanıma hatası",
    "chat.mic_permission": "Mikrofon izni gerekli. Tarayıcı ayarlarından izin ver.",
    "chat.image_only": "Sadece resim dosyası yükleyebilirsin",
    "chat.image_too_large": "Resim çok büyük (en fazla 5 MB)",
    "chat.image_upload_failed": "Resim yüklenemedi",
    "chat.placeholder": "Mesajını yaz...",
    "chat.send": "Gönder",
    "chat.reset": "Sohbeti sıfırla",

    /* krediler / ödeme */
    "credits.title": "X-Kredi",
    "credits.insufficient": "Yeterli kredin yok",
    "credits.buy": "Kredi al",
    "credits.premium": "Premium",
    "paywall.voice_limit.title": "Sesli mod için kredi gerekli",
    "paywall.voice_limit.body": "Sesli sohbet her mesajda kredi harcar. Kredi al ya da Premium'a geç.",
    "paywall.message_limit.title": "Mesaj krediniz bitti",
    "paywall.message_limit.body": "Sohbete devam etmek için kredi yükle.",

    /* genel */
    "common.back": "Geri",
    "common.close": "Kapat",
    "common.cancel": "Vazgeç",
    "common.loading": "Yükleniyor...",
  },
  en: {
    "personality.angel.name": "Angel",
    "personality.bestie.name": "Bestie",
    "personality.snake.name": "Snake",
    "personality.angel.tagline": "Gentle, protective, never judging",
    "personality.bestie.tagline": "Warm, blunt, always on your side",
    "personality.snake.tagline": "Sharp-tongued, brutally honest",

    "chat.speaking_to": "Talking to",
    "chat.empty_title": "Spill it",
    "chat.empty_subtitle": "Type what's on your mind or hold the mic — it stays here.",
    "chat.listening": "Listening...",
    "chat.continue_speaking": "Keep talking",
    "chat.error": "Error",
    "chat.speech_error": "Speech recognition error",
    "chat.mic_permission": "Microphone access needed. Allow it in your browser settings.",
    "chat.image_only": "Image files only",
    "chat.image_too_large": "Image too large (max 5 MB)",
    "chat.image_upload_failed": "Couldn't upload the image",
    "chat.placeholder": "Type your message...",
    "chat.send": "Send",
    "chat.reset": "Reset chat",

    "credits.title": "X-Credits",
    "credits.insufficient": "Not enough credits",
    "credits.buy": "Buy credits",
    "credits.premium": "Premium",
    "paywall.voice_limit.title": "Voice mode needs credits",
    "paywall.voice_limit.body": "Voice chat spends credits per message. Buy credits or go Premium.",
    "paywall.message_limit.title": "You're out of message credits",
    "paywall.message_limit.body": "Top up to keep the conversation going.",

    "common.back": "Back",
    "common.close": "Close",
    "common.cancel": "Cancel",
    "common.loading": "Loading...",
  },
};

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "xoxo_language";

function detectInitialLanguage(): Language {
  if (typeof window === "undefined") return "tr";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "tr" || saved === "en") return saved;
  return navigator.language?.toLowerCase().startsWith("tr") ? "tr" : "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(detectInitialLanguage);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = (lang: Language) => setLanguageState(lang);

  /** Anahtar bulunamazsa anahtarın kendisini döndürür — ekran hiçbir zaman boş kalmaz. */
  const t = (key: string) => translations[language][key] ?? key;

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage, LanguageProvider içinde kullanılmalı");
  return ctx;
}
