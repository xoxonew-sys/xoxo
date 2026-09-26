/**
 * Google Play Faturalandirma - istemci tarafi (yalnizca TWA icinde).
 *
 * Chrome, uygulama Play'den yuklenmis TWA icinde calisirken
 * window.getDigitalGoodsService'i acar. Normal tarayicida yoktur;
 * orada Stripe akisi aynen devam eder.
 *
 * Urun kimlikleri sunucudaki server/play-billing.ts ile ayni:
 *   credits_100, credits_500, credits_1500, premium_monthly
 */

export const PLAY_BILLING_METHOD = "https://play.google.com/billing";

export type PlayItem = { itemId: string; title?: string; price: { currency: string; value: string } };
export type PlayVerifyResult = { success: boolean; type?: string; amount?: number; alreadyProcessed?: boolean };

type DigitalGoodsService = {
  getDetails(itemIds: string[]): Promise<PlayItem[]>;
  listPurchases(): Promise<Array<{ itemId: string; purchaseToken: string }>>;
};

let servicePromise: Promise<DigitalGoodsService | null> | null = null;

export function getPlayService(): Promise<DigitalGoodsService | null> {
  if (servicePromise) return servicePromise;
  servicePromise = (async () => {
    if (typeof window === "undefined" || !("getDigitalGoodsService" in window)) return null;
    try {
      return await (window as any).getDigitalGoodsService(PLAY_BILLING_METHOD);
    } catch (err) {
      console.warn("[PLAY] Digital Goods servisi açılamadı:", err);
      return null;
    }
  })();
  return servicePromise;
}

export function formatPlayPrice(price: { currency: string; value: string }, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: price.currency }).format(Number(price.value));
  } catch {
    return price.value + " " + price.currency;
  }
}

async function verifyOnServer(itemId: string, purchaseToken: string): Promise<PlayVerifyResult> {
  const res = await fetch("/api/play/verify", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId: itemId, purchaseToken }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Play " + res.status);
  return data;
}

/**
 * Play odeme penceresini acar, odeme onaylanirsa sunucuda dogrular.
 * Kullanici pencereyi kapatirsa null doner (hata degil).
 */
export async function purchaseWithPlay(itemId: string): Promise<PlayVerifyResult | null> {
  const request = new PaymentRequest(
    [{ supportedMethods: PLAY_BILLING_METHOD, data: { sku: itemId } }],
    // Tutar Play tarafinda belirlenir; buradaki deger yok sayilir ama alan zorunlu.
    { total: { label: "Total", amount: { currency: "USD", value: "0" } } },
  );

  let response: PaymentResponse;
  try {
    response = await request.show();
  } catch (err: any) {
    if (err?.name === "AbortError") return null; // kullanici vazgecti
    throw err;
  }

  const purchaseToken = (response.details as any)?.purchaseToken ?? (response.details as any)?.token;
  try {
    const result = await verifyOnServer(itemId, purchaseToken);
    await response.complete("success");
    return result;
  } catch (err) {
    await response.complete("fail").catch(() => undefined);
    throw err;
  }
}

/**
 * Yarim kalmis satin almalari tamamlar: odeme alindi ama uygulama
 * dogrulamadan kapandi, ag koptu vb. Sunucu ayni jetonu iki kez
 * islemez, bu yuzden her acilista guvenle cagrilabilir.
 */
export async function restorePendingPurchases(): Promise<number> {
  const service = await getPlayService();
  if (!service) return 0;
  let restored = 0;
  try {
    const purchases = await service.listPurchases();
    for (const p of purchases) {
      try {
        const result = await verifyOnServer(p.itemId, p.purchaseToken);
        if (result.success && !result.alreadyProcessed) restored += 1;
      } catch (err) {
        console.warn("[PLAY] Bekleyen satın alma doğrulanamadı:", p.itemId, err);
      }
    }
  } catch (err) {
    console.warn("[PLAY] Satın almalar listelenemedi:", err);
  }
  return restored;
}
