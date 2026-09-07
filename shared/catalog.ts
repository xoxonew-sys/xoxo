/**
 * Ödeme kataloğu — kredi paketleri ve premium planlar.
 *
 * NEDEN BURADA:
 * Fiyat, istemcinin sunucuya SÖYLEDİĞİ bir şey olamaz. Eski sözleşmede
 * /api/stripe/checkout/credits gövdeden `priceInCents` okuyup Stripe
 * oturumunu o tutarla açıyordu; isteğe elle 1 yazan biri 1500 krediyi
 * bir cent'e alırdı. İstemci artık yalnızca bir kimlik (`packId` /
 * `planId`) gönderir, tutarı sunucu buradan okur.
 *
 * Dosya paylaşımlı çünkü istemcinin fiyatı GÖSTERMESİ gerekiyor; ama
 * gösterim ile yetki aynı şey değil. Sunucu gövdeden gelen hiçbir
 * tutara bakmaz, kimliği bu listede arar. İstemci kendi kopyasını
 * değiştirse bile ücretlendirilen tutar değişmez.
 *
 * DOĞRULANMADI: Bu tutarlar canlı bir Stripe hesabına karşı hiç
 * çalıştırılmadı; Stripe panelinde karşılık gelen ürün/fiyat kaydı
 * yok. Tutarlar burada kod içinde tutuluyor (price_data ile anlık
 * oluşturuluyor), Stripe'taki price ID'lerine bağlı değil.
 */

/** Stripe'a gönderilen para birimi. Tüm tutarlar bunun alt biriminde. */
export const CURRENCY = "usd" as const;

export interface CreditPack {
  /** İstemcinin gönderdiği tek değer. */
  id: string;
  credits: number;
  /** Alt birim (cent). Stripe unit_amount tam sayı ister. */
  priceInCents: number;
  popular?: boolean;
}

export const CREDIT_PACKS: readonly CreditPack[] = [
  { id: "credits_100", credits: 100, priceInCents: 499 },
  { id: "credits_500", credits: 500, priceInCents: 1499, popular: true },
  { id: "credits_1500", credits: 1500, priceInCents: 2999 },
] as const;

/**
 * PREMIUM HACİM SATMAZ, ERİŞİM SATAR — ve bu kasıtlı bir karar.
 *
 * Premium hiç kredi vermez. Mesaj yalnızca paketlerden gelir.
 *
 * NEDEN: hacim satan bir abonelik, paketlerle aynı eksende yarışır ve
 * o yarışta biri her zaman diğerini gereksiz kılar. Aynı paraya daha
 * çok mesaj veren abonelik paketleri süse çevirir; daha az veren
 * abonelik ise zaten paketten kötüdür (üstelik süresi dolar) ve kimse
 * almaz. Ekseni kaldırmadan bu çözülmüyor.
 *
 * Ve daha önemlisi: hacim satan bir abonelik, tavanı vidalanmış
 * sınırsız premium'dur — maliyeti kullanımla büyür, geliri sabit kalır.
 * Aynı şekil, küçüğü. Erişim ayrıcalıkları tanım gereği ölçülmez:
 * kullanım ne olursa olsun maliyeti sabittir. Webhook'suz ve kullanım
 * tavanı olmadan bir aboneliğin güvenle satabileceği tek şey budur.
 *
 * Paketler "bunu ne kadar kullanıyorum" sorusuna cevap verir, premium
 * "bu benim için ne" sorusuna. Karşılaştırılacak bir şey kalmıyor.
 *
 * Haftalık tier YOK: erişim ürünü haftalık ritimde tuhaf durur ve
 * Stripe'ın sabit 0,30 $ ücreti küçük tutarın %15-20'sini yer.
 *
 * TEKRARLAYAN DEĞİL: tek seferlik ödeme 30 gün açar. Yenilenmediği için
 * uzlaştırılacak bir abonelik durumu yok — webhook olmadan doğru kalan
 * tek biçim bu. Krediler ön ödemelidir ve süresi dolmaz; biten şey
 * yalnızca kilitlerdir, dolayısıyla geri alma da yok.
 */
export type PremiumPlanId = "monthly";

export interface PremiumPlan {
  id: PremiumPlanId;
  priceInCents: number;
  /** Erişim penceresinin uzunluğu. */
  days: number;
  /** Bilerek 0. Premium kilit açar, mesaj beslemez. */
  credits: 0;
}

export const PREMIUM_PLANS: readonly PremiumPlan[] = [
  { id: "monthly", priceInCents: 499, days: 30, credits: 0 },
] as const;

/** routes.ts'in premium verirken kullandığı süre. */
export const PREMIUM_GRANT_DAYS = 30;

/** Bilinmeyen/eksik kimlikte undefined döner; çağıran 400 üretir. */
export function findCreditPack(id: unknown): CreditPack | undefined {
  if (typeof id !== "string") return undefined;
  return CREDIT_PACKS.find((p) => p.id === id);
}

export function findPremiumPlan(id: unknown): PremiumPlan | undefined {
  if (typeof id !== "string") return undefined;
  return PREMIUM_PLANS.find((p) => p.id === id);
}

/** Gösterim için: 299 -> "$2.99". Sadece arayüzde kullanılır. */
export function formatPrice(priceInCents: number, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: CURRENCY,
  }).format(priceInCents / 100);
}
