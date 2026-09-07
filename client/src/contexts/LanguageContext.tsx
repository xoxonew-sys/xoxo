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

    /* giris / kayit */
    "auth.title.login": "Giriş yap",
    "auth.title.register": "Hesap oluştur",
    "auth.title.otp": "E-postanı doğrula",
    "auth.title.reset-request": "Şifreni sıfırla",
    "auth.title.reset-verify": "Yeni şifre belirle",
    "auth.identifier": "Kullanıcı adı veya e-posta",
    "auth.username": "Kullanıcı adı",
    "auth.email": "E-posta",
    "auth.email_registered": "Kayıtlı e-postan",
    "auth.password": "Şifre",
    "auth.password_min": "Şifre (en az 6 karakter)",
    "auth.password_new": "Yeni şifre",
    "auth.otp_code": "Doğrulama kodu",
    "auth.remember": "Beni hatırla",
    "auth.forgot": "Şifremi unuttum",
    "auth.no_account": "Hesabın yok mu? Oluştur",
    "auth.have_account": "Zaten hesabın var mı?",
    "auth.gender.female": "Kadın",
    "auth.gender.male": "Erkek",
    "auth.submit.login": "Giriş yap",
    "auth.submit.register": "Hesap oluştur",
    "auth.submit.verify": "Doğrula",
    "auth.submit.send_code": "Kod gönder",
    "auth.submit.save": "Kaydet",
    "auth.resend": "Kodu tekrar gönder",
    "auth.toast.generic_error": "Bir şeyler ters gitti",
    "auth.toast.verify_email": "E-postanı doğrula",
    "auth.toast.verify_email_body": "Kodu gir ve devam et.",
    "auth.toast.code_sent": "Kod gönderildi",
    "auth.toast.code_resent": "Kod tekrar gönderildi",
    "auth.toast.account_ready": "Hesabın hazır",
    "auth.toast.reset_sent": "Sıfırlama kodu gönderildi",
    "auth.toast.password_changed": "Şifren değişti",
    "auth.submit.continue": "Devam et",
    "auth.submit.send_reset": "Sıfırlama kodu gönder",
    "auth.submit.update_password": "Şifreyi güncelle",
    "auth.otp_sent": "{email} adresine gönderilen 6 haneli kodu gir.",
    "auth.your_email": "E-postan",
    "auth.resend_prompt": "Kod gelmedi mi? Tekrar gönder",

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

    "auth.title.login": "Log in",
    "auth.title.register": "Create account",
    "auth.title.otp": "Verify your email",
    "auth.title.reset-request": "Reset your password",
    "auth.title.reset-verify": "Set a new password",
    "auth.identifier": "Username or email",
    "auth.username": "Username",
    "auth.email": "Email",
    "auth.email_registered": "Your registered email",
    "auth.password": "Password",
    "auth.password_min": "Password (at least 6 characters)",
    "auth.password_new": "New password",
    "auth.otp_code": "Verification code",
    "auth.remember": "Remember me",
    "auth.forgot": "Forgot password",
    "auth.no_account": "No account? Create one",
    "auth.have_account": "Already have an account?",
    "auth.gender.female": "Female",
    "auth.gender.male": "Male",
    "auth.submit.login": "Log in",
    "auth.submit.register": "Create account",
    "auth.submit.verify": "Verify",
    "auth.submit.send_code": "Send code",
    "auth.submit.save": "Save",
    "auth.resend": "Resend code",
    "auth.toast.generic_error": "Something went wrong",
    "auth.toast.verify_email": "Verify your email",
    "auth.toast.verify_email_body": "Enter the code to continue.",
    "auth.toast.code_sent": "Code sent",
    "auth.toast.code_resent": "Code sent again",
    "auth.toast.account_ready": "Your account is ready",
    "auth.toast.reset_sent": "Reset code sent",
    "auth.toast.password_changed": "Password updated",
    "auth.submit.continue": "Continue",
    "auth.submit.send_reset": "Send reset code",
    "auth.submit.update_password": "Update password",
    "auth.otp_sent": "Enter the 6-digit code sent to {email}.",
    "auth.your_email": "your email",
    "auth.resend_prompt": "Didn't get the code? Resend",
  },
};

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "xoxo_language";

/**
 * Ilk acilis dili: Turkiye'den gelen ziyaretciye Turkce, diger herkese
 * Ingilizce.
 *
 * NEDEN IP DEGIL, TARAYICI DILI:
 * IP'den ulke bakmak (a) VPN arkasinda yanlis sonuc verir, (b) IP
 * KVKK kapsaminda kisisel veridir ve ucuncu bir servise sorulmasi
 * aydinlatma metnine yurt disi aktarim beyani eklemeyi gerektirirdi -
 * hepsi yalnizca bir dil varsayilani icin. Tarayici dili bu isi
 * veri islemeden ve ek bir saglayici olmadan yapar.
 *
 * Sinyal olarak tarayici dili ustelik daha DOGRU: kisiyle birlikte
 * seyahat eder. Yurt disindaki bir Turk yine Turkce gorur, Istanbul'daki
 * bir yabanci yine Ingilizce.
 *
 * navigator.languages (cogul) kullaniliyor: kullanici birden fazla dil
 * tanimlamis olabilir ve sadece navigator.language'a bakmak ikinci
 * tercihleri gormezden gelir. Accept-Language basligi da tam olarak bu
 * listeden uretilir - sunucuda okumak icin SSR gerekirdi, bu uygulama
 * ise statik servis ediliyor (bkz. server/vite.ts serveStatic).
 *
 * Sira: kaydedilmis secim -> tarayici dili -> en
 */
function detectInitialLanguage(): Language {
  if (typeof window === "undefined") return "en";

  // Kullanicinin acik secimi her seyi ezer.
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "tr" || saved === "en") return saved;

  const preferred = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];

  for (const tag of preferred) {
    if (typeof tag !== "string") continue;
    // "tr", "tr-TR", "tr-CY" hepsi Turkce sayilir; "tr" ile baslayan
    // baska bir dil kodu yok, bu yuzden prefix kontrolu guvenli.
    if (tag.toLowerCase().startsWith("tr")) return "tr";
    if (tag.toLowerCase().startsWith("en")) return "en";
  }

  return "en";
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
