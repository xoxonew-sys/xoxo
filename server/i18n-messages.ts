/**
 * API mesaj cevirisi.
 *
 * NEDEN BURADA:
 * routes.ts icindeki kullaniciya donen mesajlar tek dilde (cogu Turkce)
 * sabit yazilmis. Arayuz Ingilizceyken "Giris islemi basarisiz oldu"
 * gibi Turkce hatalar gorunuyordu. Her route'u tek tek degistirmek yerine
 * res.json'u sariyoruz: cevapta `message` alani varsa, istemcinin diline
 * gore sozlukten cevriliyor.
 *
 * DIL NEREDEN GELIYOR:
 * LanguageContext her dil degisiminde `xoxo_lang` cerezini yaziyor. Cerez
 * fetch ve apiRequest isteklerinde otomatik gider, istemcide baska
 * degisiklik gerekmez. Cerez yoksa varsayilan Ingilizce.
 *
 * KAPSAM DISI:
 * /api/admin/* ceviriye girmez; yonetim paneli Turkce kalir.
 *
 * YENI MESAJ EKLERKEN:
 * routes.ts'e yeni bir `message` yazdiysan buraya da [tr, en] cifti ekle.
 * Sozlukte olmayan mesaj oldugu gibi gecer, hicbir sey bozulmaz.
 */

import type { Request, Response, NextFunction } from "express";

type Lang = "tr" | "en";

const PAIRS: Array<[string, string]> = [
  /* kayit / giris / dogrulama */
  ["Kayıt işlemi başarısız oldu", "Sign up failed. Please try again."],
  ["Kayıt başarılı! E-posta doğrulama kodu gönderildi.", "Account created! We sent a verification code to your email."],
  ["Doğrulama başarısız oldu", "Verification failed. Please try again."],
  ["İşlem başarısız oldu", "Something went wrong. Please try again."],
  ["İşlem tamamlandı", "Done."],
  ["Giriş işlemi başarısız oldu", "Log in failed. Please try again."],
  ["Giriş başarısız", "Log in failed."],
  ["Çıkış işlemi başarısız oldu", "Log out failed. Please try again."],
  ["Kullanıcı adı veya şifre hatalı", "Wrong email or password."],
  ["Geçersiz şifre", "Invalid password."],
  ["Bu kullanıcı adı zaten kullanılıyor", "This username is already taken."],
  ["Bu e-posta adresi zaten kullanılıyor", "This email is already registered."],
  ["Bu islem icin giris yapmalisiniz", "Please log in to continue."],
  ["Yetkisiz erişim", "You don't have access to this."],
  ["Oturum bulunamadı", "Session not found. Please log in again."],
  ["Oturum doğrulanamadı", "We couldn't verify your session. Please log in again."],
  ["Oturum bilgisi alınamadı", "We couldn't load your session."],
  ["Kullanıcı bulunamadı", "User not found."],
  ["Geçersiz kullanıcı ID", "Invalid user."],
  ["Geçersiz kayıt", "Invalid request."],
  ["Email gerekli", "Email is required."],
  ["E-posta ve doğrulama kodu gerekli", "Email and verification code are required."],
  ["Geçersiz doğrulama kodu", "Invalid verification code."],
  ["Doğrulama kodunun süresi dolmuş", "This code has expired. Request a new one."],
  ["Doğrulama kodu tekrar gönderildi", "We sent you a new verification code."],
  ["Doğrulama kodu onaylandı", "Code confirmed."],
  ["E-posta doğrulandı!", "Email verified!"],
  ["E-posta zaten doğrulanmış", "Your email is already verified."],
  ["E-posta doğrulanmamış. Yeni doğrulama kodu gönderildi.", "Your email isn't verified yet. We sent you a new code."],
  ["E-posta gönderilemedi. Lütfen daha sonra tekrar deneyin.", "We couldn't send the email. Please try again later."],
  ["Kod gönderilemedi", "We couldn't send the code."],
  ["Şifre sıfırlama kodu gönderildi", "Password reset code sent."],
  ["Eğer bu e-posta kayıtlıysa, şifre sıfırlama kodu gönderildi", "If this email is registered, we've sent a reset code."],
  ["Şifre güncellendi", "Password updated."],
  ["Şifre güncellenemedi", "We couldn't update your password."],
  ["Şifre başarıyla güncellendi! Giriş yapabilirsiniz.", "Password updated! You can log in now."],

  /* profil / ayarlar */
  ["Güncellenemedi", "Couldn't save changes."],
  ["Ayarlar alınamadı", "Couldn't load settings."],
  ["Ayarlar güncellendi", "Settings saved."],
  ["Ayarlar güncellenemedi", "Couldn't save settings."],
  ["Avatar güncellenemedi", "Couldn't update your avatar."],
  ["Görünen ad güncellenemedi", "Couldn't update your display name."],
  ["Geçersiz görünen ad", "Invalid display name."],
  ["Cinsiyet güncellenemedi", "Couldn't update gender."],
  ["Geçersiz cinsiyet değeri", "Invalid gender value."],
  ["Görsel çok büyük", "Image is too large."],
  ["Geçersiz görsel biçimi", "Unsupported image format."],
  ["Hesap silinemedi", "Couldn't delete your account."],
  ["Davet kodu alınamadı", "Couldn't load your invite code."],

  /* bildirimler */
  ["Bildirimler alınamadı", "Couldn't load notifications."],
  ["Geçersiz bildirim ID", "Invalid notification."],
  ["Bildirim güncellendi", "Notification updated."],
  ["Bildirim güncellenemedi", "Couldn't update notification."],
  ["Bildirim silindi", "Notification deleted."],
  ["Bildirim silinemedi", "Couldn't delete notification."],

  /* kredi / odeme */
  ["Kredi bilgisi alınamadı", "Couldn't load your credits."],
  ["Kredi kullanılamadı", "Couldn't use credits."],
  ["Yetersiz kredi", "Not enough credits."],
  ["Yeterli X-Krediniz yok.", "You don't have enough X-Credits."],
  ["Yeterli X-Krediniz yok. Kredi satın alın veya Premium'a geçin.", "You don't have enough X-Credits. Buy credits or go Premium."],
  ["VIP seans için en az 10 krediniz olmalı.", "You need at least 10 credits for a VIP session."],
  ["Ödeme oturumu oluşturulamadı", "Couldn't start checkout. Please try again."],
  ["Ödeme sistemi şu anda kullanılamıyor", "Payments are unavailable right now."],
  ["Ödeme henüz onaylanmadı", "Payment isn't confirmed yet."],
  ["Ödeme geçmişi alınamadı", "Couldn't load payment history."],
  ["Geçersiz kredi paketi", "Invalid credit package."],
  ["Geçersiz premium plan", "Invalid Premium plan."],
  ["Bilinmeyen ürün tipi", "Unknown product."],
  ["Satın alma web sitesinden yapılır", "Purchases are made on our website."],
  ["Session ID gerekli", "Session ID is required."],

  /* X-Room */
  ["Bildirimin alındı. 24 saat içinde incelenecek.", "Report received. We'll review it within 24 hours."],
  ["Bildirim kaydedilemedi", "Couldn't submit your report."],
  ["Krediniz 10 ve altında olduğunda 5 dakikadan uzun oda oluşturamazsınız.", "With 10 credits or fewer you can only create rooms up to 5 minutes."],
  ["Süre gerekli", "Duration is required."],
  ["Geçersiz süre", "Invalid duration."],

  /* Ingilizce yazilmis olanlar - Turkce kullaniciya cevrilir */
  ["Oda bulunamadı", "Room not found"],
  ["Odanın süresi doldu", "Room expired"],
  ["Odanın süresi dolmuş", "Room has expired"],
  ["Bu odada değilsin", "Not in a room"],
  ["Bu odanın üyesi değilsin", "Not a room member"],
  ["Üye değilsin", "Not a member"],
  ["Odaya katılınamadı", "Failed to join room"],
  ["Oda oluşturulamadı", "Failed to create room"],
  ["Oda yüklenemedi", "Failed to fetch room"],
  ["Mesajlar yüklenemedi", "Failed to get messages"],
  ["Mesaj gönderilemedi", "Failed to send message"],
  ["Geçersiz mesaj", "Invalid message"],
  ["Geçersiz mesaj içeriği", "Invalid message content"],
  ["Sohbet bulunamadı", "Session not found"],
  ["Sohbet başlatılamadı", "Failed to create session"],
  ["Sohbet yüklenemedi", "Failed to fetch session"],
  ["Metin gerekli", "Text is required"],
  ["Ses oluşturulamadı", "Failed to generate speech"],
  ["Ses oluşturulamadı.", "Failed to generate audio"],
];

const TR_TO_EN = new Map<string, string>(PAIRS);
const EN_TO_TR = new Map<string, string>(PAIRS.map(([tr, en]) => [en, tr]));

/** Ban mesaji dinamik: "Hesabınız <kalıcı olarak | TARİH tarihine kadar> askıya alınmıştır. Sebep: X" */
function translateBanMessage(message: string): string | null {
  const head = "Hesabınız ";
  const sep = " askıya alınmıştır. Sebep: ";
  if (!message.startsWith(head) || !message.includes(sep)) return null;

  const [left, reason] = message.split(sep);
  const middle = left.slice(head.length);

  if (middle === "kalıcı olarak") {
    return "Your account has been permanently suspended. Reason: " + reason;
  }
  const untilSuffix = " tarihine kadar";
  if (middle.endsWith(untilSuffix)) {
    const date = middle.slice(0, -untilSuffix.length);
    return "Your account is suspended until " + date + ". Reason: " + reason;
  }
  return null;
}

function readLang(req: Request): Lang {
  const raw = req.headers.cookie ?? "";
  for (const part of raw.split(";")) {
    const [key, value] = part.trim().split("=");
    if (key === "xoxo_lang" && (value === "tr" || value === "en")) return value;
  }
  return "en";
}

export function translateApiMessages(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api/") || req.path.startsWith("/api/admin")) return next();

  const lang = readLang(req);
  const originalJson = res.json.bind(res);

  res.json = (body: any) => {
    if (body && typeof body === "object" && !Array.isArray(body) && typeof body.message === "string") {
      const translated =
        lang === "en"
          ? TR_TO_EN.get(body.message) ?? translateBanMessage(body.message)
          : EN_TO_TR.get(body.message);
      if (translated) body = { ...body, message: translated };
    }
    return originalJson(body);
  };

  next();
}
