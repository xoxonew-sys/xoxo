import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Check, Zap } from "lucide-react";
import { CREDIT_PACKS, PREMIUM_PLANS, formatPrice } from "@shared/catalog";
import { isAppChannel, channelHeaders, PURCHASE_DOMAIN } from "@/lib/channel";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits } from "@/contexts/CreditContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { NeonButton } from "@/components/NeonButton";
import {
  getPlayService, purchaseWithPlay, restorePendingPurchases, formatPlayPrice,
} from "@/lib/play-billing";

/**
 * Play Console'daki Premium urun kimlikleri - server/play-billing.ts ile ayni.
 * "premium_monthly" kimligi Play'de yanlislikla ABONELIK olarak acildi ve
 * kimlikler tekrar kullanilamiyor; tek seferlik 30 gunluk Premium bu adla.
 */
const PLAY_PREMIUM_IDS: Record<string, string> = { monthly: "premium_30days" };
const playItemIdForPlan = (planId: string) => PLAY_PREMIUM_IDS[planId] ?? "premium_" + planId;

/**
 * Paket listesi ve fiyatlar shared/catalog.ts'ten gelir; burada sadece
 * Türkçe arayüz metni tutulur. Sunucu tutarı gövdeden okumaz, kimlikten
 * çözer — buradaki fiyat gösterim amaçlıdır, yetki değil.
 */
/** Paket kimligi -> ceviri anahtari. Metin LanguageContext'te. */
const PACK_HINT_KEYS: Record<string, string> = {
  credits_100: "pricing.pack.hint.100",
  credits_500: "pricing.pack.hint.500",
  credits_1500: "pricing.pack.hint.1500",
};

const PLAN_LABEL_KEYS: Record<string, string> = {
  monthly: "pricing.plan.monthly",
};

/** En kucuk pakete gore kredi basina yuzde kac ucuz. */
function savingVsBase(pack: { id: string; credits: number; priceInCents: number }): number {
  const base = CREDIT_PACKS[0];
  if (pack.id === base.id) return 0;
  const basePer = base.priceInCents / base.credits;
  const per = pack.priceInCents / pack.credits;
  return Math.round((1 - per / basePer) * 100);
}

export default function Pricing() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const { credits, isPremium, refreshCredits } = useCredits() as ReturnType<typeof useCredits> & {
    refreshCredits?: () => void;
  };
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const [pending, setPending] = useState<string | null>(null);

  /*
   * Uygulama kanalinda (Play'den yuklenen TWA) satis GOOGLE PLAY
   * FATURALANDIRMA ile yapilir - Play politikasi dijital urunler icin
   * bunu sart kosuyor, Stripe burada acilmaz (sunucu da reddeder).
   *
   * Play servisi acilamazsa (eski uygulama surumu, billing modulu
   * olmayan paket) eski davranisa donulur: bakiye + "web sitesinde" notu.
   */
  const appChannel = isAppChannel();
  const [playMode, setPlayMode] = useState<"loading" | "play" | "unavailable">(
    appChannel ? "loading" : "unavailable",
  );
  const [playPrices, setPlayPrices] = useState<Record<string, string>>({});
  /**
   * Play servisi neden acilamadi - yedek kartta kucuk gri satir olarak
   * gorunur. Kullaniciya anlam ifade etmez, destek/hata ayiklama icin:
   *   no-api      : window.getDigitalGoodsService yok (eski uygulama/Chrome)
   *   no-service  : API var ama Play servisi acilmadi
   *   no-items    : servis acildi, urunler bos dondu (urunler yayilmadi / kimlik hatali)
   *   details:<x> : urun bilgisi istegi hata verdi
   */
  const [playReason, setPlayReason] = useState<string>("");
  const locale = language === "tr" ? "tr-TR" : "en-US";

  useEffect(() => {
    if (!appChannel) return;
    let cancelled = false;
    (async () => {
      const service = await getPlayService();
      if (!service) {
        if (!cancelled) {
          setPlayReason("getDigitalGoodsService" in window ? "no-service" : "no-api");
          setPlayMode("unavailable");
        }
        return;
      }
      try {
        const ids = [
          ...CREDIT_PACKS.map((pack) => pack.id),
          ...PREMIUM_PLANS.map((plan) => playItemIdForPlan(plan.id)),
        ];
        const details = await service.getDetails(ids);
        if (cancelled) return;
        if (!details || details.length === 0) {
          setPlayReason("no-items");
          setPlayMode("unavailable");
          return;
        }
        const prices: Record<string, string> = {};
        for (const item of details) prices[item.itemId] = formatPlayPrice(item.price, locale);
        setPlayPrices(prices);
        setPlayMode("play");
      } catch (err) {
        console.warn("[PLAY] Ürün bilgileri alınamadı:", err);
        if (!cancelled) {
          setPlayReason("details:" + (err instanceof Error ? err.name || err.message : "error"));
          setPlayMode("unavailable");
        }
        return;
      }
      // Yarim kalmis satin almalar (odeme alindi, dogrulama yapilamadi)
      if (isAuthenticated) {
        const restored = await restorePendingPurchases();
        if (restored > 0 && !cancelled) {
          refreshCredits?.();
          toast({
            title: language === "tr" ? "Bekleyen satın alman tamamlandı" : "Your pending purchase is complete",
            variant: "success",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appChannel, isAuthenticated, locale]);

  const buyWithPlay = async (itemId: string) => {
    if (!isAuthenticated) {
      setLocation("/login");
      return;
    }
    setPending(itemId);
    try {
      const result = await purchaseWithPlay(itemId);
      if (result?.success) {
        refreshCredits?.();
        toast({
          title:
            result.type === "credits"
              ? (language === "tr" ? "Kredilerin yüklendi" : "Credits added") + (result.amount ? " +" + result.amount : "")
              : language === "tr" ? "Premium aktif" : "Premium is active",
          variant: "success",
        });
      }
    } catch (err) {
      toast({
        title: t("chat.error"),
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      });
    } finally {
      setPending(null);
    }
  };

  const playActive = appChannel && playMode === "play";

  const checkout = async (endpoint: string, body: Record<string, unknown>, key: string) => {
    if (!isAuthenticated) {
      setLocation("/login");
      return;
    }
    setPending(key);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...channelHeaders() },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.message || t("pricing.checkout_failed"));
      window.location.href = data.url;
    } catch (err) {
      toast({
        title: t("chat.error"),
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      });
      setPending(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-5 py-6 safe-bottom">
      <header className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => setLocation("/")}
          className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/5"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-display font-bold">{t("pricing.title")}</h1>
        {isAuthenticated && (
          <span className="ml-auto flex items-center gap-1 text-sm text-primary font-display font-bold">
            <Zap className="w-4 h-4" />
            {credits}
          </span>
        )}
      </header>

      {appChannel && playMode === "loading" ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : appChannel && playMode === "unavailable" ? (
        <div className="glass-panel-strong rounded-2xl p-5" data-testid="web-only-notice">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
            {t("channel.web_only.balance")}
          </p>
          <p className="flex items-center gap-2 text-3xl font-display font-bold text-primary mb-5">
            <Zap className="w-6 h-6" />
            {credits}
            {isPremium && (
              <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-secondary/20 text-secondary align-middle">
                premium
              </span>
            )}
          </p>

          <h2 className="font-display font-bold mb-2">{t("channel.web_only.title")}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t("channel.web_only.body")}
          </p>
          {/*
            Düz metin, <a> değil. iOS'ta harici satın almaya yönlendiren
            bağlantı ihlaldir; Play'de gri alandır. Seçilebilir bırakıyoruz
            ki kullanıcı kopyalayabilsin, ama dokunulabilir hedef değil.
          */}
          <p className="mt-3 select-all font-display font-bold tracking-wide text-foreground">
            {PURCHASE_DOMAIN}
          </p>
          {appChannel && playReason && (
            <p className="mt-4 text-[10px] font-mono text-muted-foreground/50" data-testid="play-reason">
              play: {playReason}
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-2.5 mb-6">
            {CREDIT_PACKS.map((pack) => (
              <button
                key={pack.id}
                type="button"
                disabled={pending !== null}
                onClick={() =>
                  playActive
                    ? buyWithPlay(pack.id)
                    : checkout("/api/stripe/checkout/credits", { packId: pack.id }, pack.id)
                }
                className="w-full glass-panel rounded-2xl p-4 flex items-center justify-between text-left active:scale-[0.99] transition-transform disabled:opacity-50"
                data-testid={`credit-pack-${pack.credits}`}
              >
                <div>
                  <p className="flex items-center gap-2 font-display font-bold">
                    {pack.credits} {t("pricing.pack.credits")}
                    {pack.popular && (
                      <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                        {language === "tr" ? "popüler" : "popular"}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t(PACK_HINT_KEYS[pack.id])}</p>
                  {/* Birim fiyat basamakli indirimi gorunur kilar: toplam
                      fiyata bakan kullanici 500'un 100'den pahali oldugunu
                      gorup kucugu seciyor. Kredi basina fark ancak boyle
                      anlasiliyor. */}
                  {playActive ? (
                    savingVsBase(pack) > 0 && (
                      <p className="text-[11px] text-muted-foreground/70 mt-1">
                        %{savingVsBase(pack)} {t("pricing.pack.saving")}
                      </p>
                    )
                  ) : (
                    <p className="text-[11px] text-muted-foreground/70 mt-1">
                      {t("pricing.pack.unit")} {formatPrice(pack.priceInCents / pack.credits)}
                      {savingVsBase(pack) > 0 ? ` · %${savingVsBase(pack)} ${t("pricing.pack.saving")}` : ""}
                    </p>
                  )}
                </div>
                <span className="text-right flex-shrink-0 ml-3">
                  <span className="block font-display font-bold text-primary text-lg">
                    {playActive ? playPrices[pack.id] ?? "…" : formatPrice(pack.priceInCents)}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {pending === pack.id ? "..." : t("pricing.pack.buy")}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <div className="glass-panel-strong rounded-2xl p-5">
            <h2 className="font-display font-bold text-secondary mb-1">Premium</h2>

            {/*
              BU UYARI SATIN ALMADAN ÖNCE GÖRÜNMEK ZORUNDA, SSS'de değil.
              Premium kredi içermez; kredisi biten premium kullanıcı mesaj
              gönderemez. Bunu önceden söylemeyen her sürüm destek yükü
              üretir ve haklı olarak "iki kez ödedim" tepkisi alır.
              Ayrıcalık listesinden ÖNCE duruyor, sonra değil.
            */}
            <p className="text-sm font-display font-bold text-foreground mb-1">
              {t("premium.headline")}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">
              {t("premium.detail")}
            </p>

            <ul className="space-y-2 mb-2">
              {[
                "premium.feature.unlimited_text",
                "premium.feature.voice_included",
                "premium.feature.snake",
                "premium.feature.avatars",
                "premium.feature.priority",
                "premium.feature.badge",
              ].map((key) => (
                <li key={key} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="w-4 h-4 text-secondary flex-shrink-0 mt-0.5" />
                  {t(key)}
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-muted-foreground mb-4">{t("premium.window")}</p>

            {PREMIUM_PLANS.map((plan) => (
              <NeonButton
                key={plan.id}
                variant="secondary"
                fullWidth
                size="lg"
                isLoading={pending === plan.id || pending === playItemIdForPlan(plan.id)}
                disabled={pending !== null}
                onClick={() =>
                  playActive
                    ? buyWithPlay(playItemIdForPlan(plan.id))
                    : checkout("/api/stripe/checkout/subscription", { planId: plan.id }, plan.id)
                }
                data-testid={`premium-plan-${plan.id}`}
              >
                {/* Aktifken de alınabilir: satın alma pencereyi uzatır. */}
                {isPremium ? t("premium.cta.extend") : t("premium.cta.upgrade")}
                {" — "}
                {playActive
                  ? playPrices[playItemIdForPlan(plan.id)] ?? "…"
                  : formatPrice(plan.priceInCents)}{" "}
                / {t(PLAN_LABEL_KEYS[plan.id]).toLowerCase()}
              </NeonButton>
            ))}
          </div>

          <p className="text-center text-[11px] text-muted-foreground mt-4 pb-6">
            {t("pricing.footer")}
          </p>
        </>
      )}
    </div>
  );
}
