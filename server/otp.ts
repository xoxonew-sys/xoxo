import { createHash, timingSafeEqual } from "node:crypto";

/**
 * OTP kodlarinin saklanma bicimi.
 *
 * NEDEN SHA-256, NEDEN BCRYPT DEGIL:
 * Bu bir parola degil, alti haneli tek kullanimlik bir kod. Arama uzayi
 * 10^6 - yani bir milyon. Sutunu ele geciren saldirgan icin bcrypt'in
 * yavasligi pratikte hicbir sey satin almaz: bir milyon adayin tamami,
 * yavas bir hash ile bile, kodun 10 dakikalik omrunden once denenebilir.
 * Yavas hash'in maliyeti ise her dogrulama isteginde bize yansir.
 *
 * Buradaki savunma hash'in yavasligi degil, su ikisidir:
 *   1. Hiz siniri (bkz. server/rateLimit.ts) - tahmin denemelerini bogar
 *   2. Kisa omur (10 dakika) + tek kullanim - pencereyi daraltir
 *
 * SHA-256'nin isi, sutunu okuyan birinin ELINDEKI kodu dogrudan
 * kullanamamasini saglamaktir; kirilmaz bir sir saklamak degil.
 *
 * Bu satirlari parola hash'i sanip "duzeltmeye" kalkmayin - bcrypt'e
 * gecmek guvenligi artirmaz, sadece dogrulama maliyetini yukseltir.
 */
export function hashOtp(otp: string): string {
  // String'e zorlaniyor: /api/auth/password-reset-verify gelen otpCode'u
  // zod'dan gecirmeden dogrudan req.body'den okuyor. Sayi gonderilirse
  // .trim() patlar ve 500 doneriz - bu da gecerli/gecersiz kodu ayirt
  // eden bir yan kanal olur. String(...) bunu kapatir.
  return createHash("sha256").update(String(otp).trim(), "utf8").digest("hex");
}

/**
 * Saklanan hash ile gelen kodu karsilastirir.
 *
 * Karsilastirma timingSafeEqual ile yapilir. Alti haneli bir kodda zaman
 * sizintisi tek basina somurulebilir bir zafiyet degil, ama karsilastirma
 * zaten sabit uzunlukta iki hash uzerinde yapildigi icin maliyeti sifir.
 *
 * stored null ise (kod temizlenmis ya da hic uretilmemis) her zaman false.
 */
export function otpMatches(stored: string | null | undefined, submitted: string): boolean {
  if (!stored || !submitted) return false;

  const a = Buffer.from(stored, "utf8");
  const b = Buffer.from(hashOtp(submitted), "utf8");

  // Uzunluklar farkliysa timingSafeEqual firlatir. Eski (hash'lenmemis,
  // duz metin) kayitlar bu dala duser ve eslesmez - istenen davranis.
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}
