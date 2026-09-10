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
    "channel.web_only.title": "Satın alma web sitesinde",
    "channel.web_only.body": "X-Kredi ve Premium yalnızca web sitemizden alınır. Tarayıcından şu adrese git:",
    "channel.web_only.balance": "Mevcut bakiyen",
    "premium.not_credits": "Premium kilit açar, mesaj vermez.",
    "premium.not_credits.detail": "Mesajlar X-Kredi ile ödenir ve Premium kredi içermez. Kredin biterse Premium'la da mesaj gönderemezsin — X-Kredi al.",
    "premium.window": "30 günlük erişim. Kendiliğinden biter, otomatik yenilenmez.",

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
    /* ödeme sayfası */
    "pricing.title": "X-Kredi",
    "pricing.pack.hint.100": "Denemek için",
    "pricing.pack.hint.500": "En çok tercih edilen",
    "pricing.pack.hint.1500": "En avantajlı",
    "pricing.pack.unit": "kredi başına",
    "pricing.pack.saving": "avantaj",
    "pricing.pack.buy": "Satın al",
    "pricing.plan.monthly": "Aylık",
    "pricing.checkout_failed": "Ödeme başlatılamadı",
    "premium.headline": "Sınırsız yazışma, 300 sesli yanıt.",
    "premium.detail": "Yazılı mesajların 30 gün boyunca kredi harcamaz. Sesli yanıtlar pakete dahil 300 krediden düşer.",
    "premium.feature.unlimited_text": "Sınırsız yazılı mesaj",
    "premium.feature.voice_included": "300 sesli yanıt dahil",
    "premium.feature.snake": "Snake karakterinin kilidi açılır",
    "premium.feature.avatars": "Tüm avatarlara erişim",
    "premium.feature.priority": "Sesli modda sıra önceliği",
    "premium.feature.badge": "Premium rozeti",
    "premium.cta.upgrade": "Premium'a geç",
    "premium.cta.extend": "Premium'u uzat",
    "pricing.footer": "Ödemeler Stripe üzerinden alınır. Premium tek seferlik bir ödemedir, otomatik yenilenmez — iptal edilecek bir abonelik yok.",

    /* profil / ayarlar */
    "profile.title": "Profil",
    "profile.display_name": "Görünen ad",
    "profile.save": "Kaydet",
    "profile.saved": "Kaydedildi",
    "profile.save_failed": "Kaydedilemedi",
    "profile.sync_failed": "Sunucuya yazılamadı",
    "profile.character_gender": "Karakter cinsiyeti",
    "profile.gender.female": "Kadın",
    "profile.gender.male": "Erkek",
    "profile.avatars": "Avatarlar",
    "profile.logout": "Çıkış yap",
    "profile.delete_account": "Hesabımı sil",
    "profile.delete_confirm": "Hesabın ve tüm sohbetlerin kalıcı olarak silinecek. Emin misin?",
    "profile.delete_failed": "Silinemedi",
    "profile.premium_badge": "premium",
    "pricing.pack.credits": "X-Kredi",

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
    "channel.web_only.title": "Purchases are made on the website",
    "channel.web_only.body": "X-Credits and Premium are available on our website only. Open this address in your browser:",
    "channel.web_only.balance": "Your balance",
    "premium.not_credits": "Premium unlocks. It does not feed.",
    "premium.not_credits.detail": "Messages are paid for with X-Credits, and Premium includes none. If you run out, Premium will not let you send — buy X-Credits.",
    "premium.window": "30 days of access. It ends on its own and never auto-renews.",

    /* pricing page */
    "pricing.title": "X-Credits",
    "pricing.pack.hint.100": "To try it out",
    "pricing.pack.hint.500": "Most popular",
    "pricing.pack.hint.1500": "Best value",
    "pricing.pack.unit": "per credit",
    "pricing.pack.saving": "cheaper",
    "pricing.pack.buy": "Buy",
    "pricing.plan.monthly": "Monthly",
    "pricing.checkout_failed": "Could not start checkout",
    "premium.headline": "Unlimited texting, 300 voice replies.",
    "premium.detail": "Your text messages cost no credits for 30 days. Voice replies come out of the 300 credits included.",
    "premium.feature.unlimited_text": "Unlimited text messages",
    "premium.feature.voice_included": "300 voice replies included",
    "premium.feature.snake": "Unlocks the Snake character",
    "premium.feature.avatars": "Access to every avatar",
    "premium.feature.priority": "Priority in voice mode",
    "premium.feature.badge": "Premium badge",
    "premium.cta.upgrade": "Go Premium",
    "premium.cta.extend": "Extend Premium",
    "pricing.footer": "Payments are handled by Stripe. Premium is a one-time payment and never auto-renews — there is no subscription to cancel.",

    /* profile / settings */
    "profile.title": "Profile",
    "profile.display_name": "Display name",
    "profile.save": "Save",
    "profile.saved": "Saved",
    "profile.save_failed": "Could not save",
    "profile.sync_failed": "Could not reach the server",
    "profile.character_gender": "Character gender",
    "profile.gender.female": "Woman",
    "profile.gender.male": "Man",
    "profile.avatars": "Avatars",
    "profile.logout": "Log out",
    "profile.delete_account": "Delete my account",
    "profile.delete_confirm": "Your account and all your chats will be permanently deleted. Are you sure?",
    "profile.delete_failed": "Could not delete",
    "profile.premium_badge": "premium",
    "pricing.pack.credits": "X-Credits",

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
