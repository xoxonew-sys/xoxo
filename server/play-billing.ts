/**
 * Google Play Faturalandirma - satin alma dogrulama.
 *
 * AKIS:
 *   1. Uygulama (TWA) icinde kullanici paketi secer; Play odeme penceresi
 *      acilir (Digital Goods API + Payment Request, bkz. client/src/lib/play-billing.ts).
 *   2. Istemci purchaseToken'i buraya yollar: POST /api/play/verify
 *   3. Sunucu jetonu Google Play Developer API'ye sorar. Odenmis ise
 *      kredi/Premium yuklenir, odeme kaydedilir, urun TUKETILIR (consume)
 *      ki ayni paket tekrar alinabilsin.
 *
 * NEDEN SUNUCUDA DOGRULAMA:
 * Istemcinin "odedim" demesine guvenilmez. Jeton Google'a sorulmadan
 * kredi yuklenirse sahte jetonla sinirsiz kredi alinir.
 *
 * TEKRAR KORUMASI:
 * payments.stripe_session_id kolonu "gp:<jeton-hash>" ile kullaniliyor.
 * Yeni kolon/tablo ACILMADI - db:push riski (user_sessions) yuzunden sema
 * degisikligi istemiyoruz. Ayni jeton ikinci kez gelirse kredi yuklenmez,
 * sadece tuketim tekrar denenir.
 *
 * GEREKEN ORTAM DEGISKENI (Railway):
 *   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON  - hizmet hesabi JSON'u (duz ya da base64)
 *
 * URUN KIMLIKLERI (Play Console'da birebir bu adlarla):
 *   credits_100, credits_500, credits_1500   -> shared/catalog.ts paket kimlikleri
 *   premium_monthly                          -> "premium_" + plan kimligi
 *
 * TUTAR: Play jeton cevabi fiyat icermez. payments.amount'a katalogdaki
 * USD fiyat (sent) yazilir; gercek tahsilat Play Console raporundadir.
 */

import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { storage } from "./storage";
import { findCreditPack, findPremiumPlan, PREMIUM_GRANT_DAYS } from "@shared/catalog";

const PACKAGE_NAME = "com.xoxo.gossipai";
const API_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/" + PACKAGE_NAME;

type ServiceAccount = { client_email: string; private_key: string };

function loadServiceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const json = JSON.parse(text);
    if (!json.client_email || !json.private_key) return null;
    return { client_email: json.client_email, private_key: json.private_key };
  } catch {
    return null;
  }
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").split("=").join("").split("+").join("-").split("/").join("_");
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(account: ServiceAccount): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.value;

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/androidpublisher",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = base64url(
    crypto.createSign("RSA-SHA256").update(header + "." + claims).sign(account.private_key),
  );

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: header + "." + claims + "." + signature,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error("Google token " + res.status + ": " + (await res.text()).slice(0, 200));
  const data: any = await res.json();
  cachedToken = { value: data.access_token, expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000 };
  return cachedToken.value;
}

type ResolvedProduct =
  | { kind: "credits"; credits: number; priceInCents: number }
  | { kind: "premium"; priceInCents: number };

function resolveProduct(productId: string): ResolvedProduct | null {
  const pack = findCreditPack(productId);
  if (pack) return { kind: "credits", credits: pack.credits, priceInCents: pack.priceInCents };
  if (productId.startsWith("premium_")) {
    const plan = findPremiumPlan(productId.slice("premium_".length));
    if (plan) return { kind: "premium", priceInCents: plan.priceInCents };
  }
  return null;
}

async function consumePurchase(token: string, productId: string, purchaseToken: string): Promise<void> {
  const url =
    API_BASE + "/purchases/products/" + encodeURIComponent(productId) +
    "/tokens/" + encodeURIComponent(purchaseToken) + ":consume";
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error("consume " + res.status + ": " + (await res.text()).slice(0, 200));
}

export function registerPlayBillingRoutes(app: Express): void {
  app.post("/api/play/verify", async (req: Request, res: Response) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Oturum bulunamadı" });

    const productId = String(req.body?.productId ?? "");
    const purchaseToken = String(req.body?.purchaseToken ?? "");
    if (!productId || purchaseToken.length < 20) {
      return res.status(400).json({ message: "Geçersiz kayıt" });
    }

    const product = resolveProduct(productId);
    if (!product) return res.status(400).json({ message: "Bilinmeyen ürün tipi" });

    const account = loadServiceAccount();
    if (!account) {
      console.error("[PLAY] GOOGLE_PLAY_SERVICE_ACCOUNT_JSON tanımlı değil ya da bozuk");
      return res.status(503).json({ message: "Ödeme sistemi şu anda kullanılamıyor" });
    }

    const tokenKey = "gp:" + crypto.createHash("sha256").update(purchaseToken).digest("hex").slice(0, 48);

    try {
      const accessToken = await getAccessToken(account);

      // Daha once islendiyse: kredi YUKLEME, sadece tuketimi garantiye al.
      const existing = await storage.getPaymentBySessionId(tokenKey);
      if (existing) {
        await consumePurchase(accessToken, productId, purchaseToken).catch(() => undefined);
        return res.json({ success: true, alreadyProcessed: true, type: existing.productType });
      }

      const url =
        API_BASE + "/purchases/products/" + encodeURIComponent(productId) +
        "/tokens/" + encodeURIComponent(purchaseToken);
      const check = await fetch(url, {
        headers: { Authorization: "Bearer " + accessToken },
        signal: AbortSignal.timeout(15_000),
      });
      if (!check.ok) {
        console.error("[PLAY] Jeton doğrulanamadı:", check.status, (await check.text()).slice(0, 300));
        return res.status(400).json({ message: "Ödeme henüz onaylanmadı" });
      }
      const purchase: any = await check.json();

      // purchaseState: 0 = odendi, 1 = iptal, 2 = beklemede
      if (purchase.purchaseState !== 0) {
        return res.status(400).json({ message: "Ödeme henüz onaylanmadı", state: purchase.purchaseState });
      }
      // Daha once tuketilmis jeton (baska sunucu/eski surum) - tekrar yukleme yapma
      if (purchase.consumptionState === 1) {
        return res.status(409).json({ message: "Ödeme henüz onaylanmadı" });
      }

      const orderId = String(purchase.orderId ?? tokenKey);

      if (product.kind === "credits") {
        const result = await storage.addXCredits(userId, product.credits);
        await storage.recordPayment({
          userId,
          userRef: Number(userId),
          stripeSessionId: tokenKey,
          stripePaymentIntentId: orderId,
          amount: product.priceInCents,
          currency: "usd",
          productType: "credits",
          creditsAmount: product.credits,
          status: "completed",
        } as any);
        await consumePurchase(accessToken, productId, purchaseToken).catch((err) =>
          console.error("[PLAY] Tüketim başarısız (kredi yüklendi, tekrar denenecek):", err),
        );
        console.log("[PLAY] " + product.credits + " kredi yüklendi, kullanıcı " + userId + ", sipariş " + orderId);
        return res.json({ success: true, type: "credits", amount: product.credits, newBalance: result.newBalance });
      }

      const until = await storage.grantPremium(userId, PREMIUM_GRANT_DAYS, orderId);
      await storage.recordPayment({
        userId,
        userRef: Number(userId),
        stripeSessionId: tokenKey,
        stripePaymentIntentId: orderId,
        amount: product.priceInCents,
        currency: "usd",
        productType: "subscription",
        status: "completed",
      } as any);
      await consumePurchase(accessToken, productId, purchaseToken).catch((err) =>
        console.error("[PLAY] Tüketim başarısız (premium verildi, tekrar denenecek):", err),
      );
      console.log("[PLAY] Premium verildi, kullanıcı " + userId + ", bitiş " + until.toISOString());
      return res.json({ success: true, type: "subscription" });
    } catch (err) {
      console.error("[PLAY] Doğrulama hatası:", err);
      return res.status(502).json({ message: "Oturum doğrulanamadı" });
    }
  });
}
