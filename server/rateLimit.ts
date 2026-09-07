import type { Request, Response, NextFunction } from "express";

/**
 * Kucuk, bagimliliksiz hiz siniri.
 *
 * NEDEN PAKET DEGIL:
 * express-rate-limit calisan bir kutuphane, ama canli bir Railway
 * dagitimina yeni bir paket eklemek kendi basina bir risk. Ihtiyacimiz
 * olan sey otuz satir; bagimlilik yuzeyini buyutmeye degmez.
 *
 * IN-MEMORY OLMANIN BEDELI - BILEREK KABUL EDILDI:
 * Sayaclar surecin belleginde tutulur. Bunun iki sonucu var:
 *
 *   1. Railway her yeniden baslatmada (dagitim, cokme, olceklendirme)
 *      sayaclar sifirlanir. Kararli bir saldirgan her dagitimda taze bir
 *      deneme butcesi kazanir.
 *   2. Birden fazla surec/instance calisirsa her biri kendi sayacini
 *      tutar; gercek sinir instance sayisiyla carpilir.
 *
 * Bu olcekte kabul edilebilir: OTP'nin omru 10 dakika, dagitimlar seyrek
 * ve tek instance calisiyoruz. Kabul edilemez hale gelirse dogru cozum
 * sayaclari Postgres'e ya da Redis'e tasimaktir - kutuphane degistirmek
 * degil, cunku sorun kutuphanede degil bellekte olmasinda.
 *
 * Bu davranis kesfedilerek degil, okunarak ogrenilsin diye buraya yazildi.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Sizinti olmamasi icin suresi dolmus kovalar periyodik temizlenir.
// unref() ile bu zamanlayici surecin kapanmasini engellemez.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, SWEEP_INTERVAL_MS).unref();

function clientIp(req: Request): string {
  // Railway proxy arkasinda: X-Forwarded-For'un ilk degeri gercek istemci.
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

interface Options {
  /**
   * Bu sinirlayicinin adi. Anahtarin bir parcasidir ve ZORUNLUDUR:
   * ad olmadan ayni IP+e-posta ikilisi icin farkli sinirlayicilar ayni
   * kovayi paylasir, yani kod ISTEME denemeleri kod DOGRULAMA butcesini
   * tuketir. Ilk surumde tam olarak bu hata vardi ve testte yakalandi.
   */
  name: string;
  /** Pencere basina izin verilen istek sayisi. */
  max: number;
  /** Pencere uzunlugu (ms). */
  windowMs: number;
  /** Sayacin anahtari: IP'ye ek olarak orn. hedef e-posta. */
  keyBy?: (req: Request) => string;
  /** Sinir asildiginda donen mesaj. */
  message?: string;
}

export function rateLimit({ name, max, windowMs, keyBy, message }: Options) {
  return (req: Request, res: Response, next: NextFunction) => {
    const scope = keyBy ? keyBy(req) : "";
    const key = `${name}|${clientIp(req)}|${scope}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        message: message ?? "Cok fazla deneme yaptiniz. Lutfen biraz sonra tekrar deneyin.",
      });
    }

    next();
  };
}

/**
 * Kod DOGRULAYAN uc noktalar icin. Sikidir: alti haneli bir kodu kaba
 * kuvvetle denemeyi anlamsiz kilmak bu sinirin tek isi.
 */
export const otpVerifyLimiter = rateLimit({
  name: "otp-verify",
  max: 5,
  windowMs: 10 * 60 * 1000,
  keyBy: (req) => String(req.body?.email ?? "").trim().toLowerCase(),
  message: "Cok fazla hatali kod denemesi. 10 dakika sonra tekrar deneyin.",
});

/**
 * Kod GONDEREN uc noktalar icin. Hem e-posta bombardimanini hem de
 * sinirsiz kod uretimini engeller.
 */
export const otpRequestLimiter = rateLimit({
  name: "otp-request",
  max: 3,
  windowMs: 10 * 60 * 1000,
  keyBy: (req) => String(req.body?.email ?? "").trim().toLowerCase(),
  message: "Cok fazla kod istegi. 10 dakika sonra tekrar deneyin.",
});

/**
 * Parola ile giris icin. Kod dogrulamadan daha gevsek, cunku mesru
 * kullanici da sifresini birkac kez yanlis girebilir.
 */
export const loginLimiter = rateLimit({
  name: "login",
  max: 10,
  windowMs: 15 * 60 * 1000,
  message: "Cok fazla giris denemesi. 15 dakika sonra tekrar deneyin.",
});
