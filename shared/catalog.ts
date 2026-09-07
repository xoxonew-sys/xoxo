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
  { id: "credits_100", credits: 100, priceInCents: 299 },
  { id: "credits_500", credits: 500, priceInCents: 999, popular: true },
  { id: "credits_1500", credits: 1500, priceInCents: 2499 },
] as const;

export type PremiumPlanId = "weekly" | "monthly";

export interface PremiumPlan {
  id: PremiumPlanId;
  /** Stripe recurring.interval değeri. */
  interval: "week" | "month";
  priceInCents: number;
}

export const PREMIUM_PLANS: readonly PremiumPlan[] = [
  { id: "weekly", interval: "week", priceInCents: 499 },
  { id: "monthly", interval: "month", priceInCents: 1299 },
] as const;

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
