import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Check, Zap } from "lucide-react";
import { CREDIT_PACKS, PREMIUM_PLANS, formatPrice } from "@shared/catalog";
import { isAppChannel, channelHeaders, PURCHASE_DOMAIN } from "@/lib/channel";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits } from "@/contexts/CreditContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { NeonButton } from "@/components/NeonButton";

/**
 * Paket listesi ve fiyatlar shared/catalog.ts'ten gelir; burada sadece
 * Türkçe arayüz metni tutulur. Sunucu tutarı gövdeden okumaz, kimlikten
 * çözer — buradaki fiyat gösterim amaçlıdır, yetki değil.
 */
const PACK_HINTS: Record<string, string> = {
  credits_100: "Denemek için",
  credits_500: "En çok tercih edilen",
  credits_1500: "En avantajlı",
};

const PLAN_LABELS: Record<string, string> = {
  monthly: "Aylık",
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
  const { credits, isPremium } = useCredits();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [pending, setPending] = useState<string | null>(null);

  // Uygulama kanalında bu sayfa satış yapmaz; bakiye gösterir ve satın
  // almanın web sitesinde olduğunu söyler. Bağlantı yok — bkz. lib/channel.ts.
  const appChannel = isAppChannel();

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
      if (!res.ok || !data.url) throw new Error(data.message || "Ödeme başlatılamadı");
      window.location.href = data.url;
    } catch (err) {
      toast({
        title: "Hata",
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      });
      setPending(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-5 py-6 safe-top safe-bottom">
      <header className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => setLocation("/")}
          className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/5"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-display font-bold">X-Kredi</h1>
        {isAuthenticated && (
          <span className="ml-auto flex items-center gap-1 text-sm text-primary font-display font-bold">
            <Zap className="w-4 h-4" />
            {credits}
          </span>
        )}
      </header>

      {appChannel ? (
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
        </div>
      ) : (
        <>
          <div className="space-y-2.5 mb-6">
            {CREDIT_PACKS.map((pack) => (
              <button
                key={pack.id}
                type="button"
                disabled={pending !== null}
                onClick={() => checkout("/api/stripe/checkout/credits", { packId: pack.id }, pack.id)}
                className="w-full glass-panel rounded-2xl p-4 flex items-center justify-between text-left active:scale-[0.99] transition-transform disabled:opacity-50"
                data-testid={`credit-pack-${pack.credits}`}
              >
                <div>
                  <p className="flex items-center gap-2 font-display font-bold">
                    {pack.credits} X-Kredi
                    {pack.popular && (
                      <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                        popüler
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{PACK_HINTS[pack.id]}</p>
                  {/* Birim fiyat basamakli indirimi gorunur kilar: toplam
                      fiyata bakan kullanici 500'un 100'den pahali oldugunu
                      gorup kucugu seciyor. Kredi basina fark ancak boyle
                      anlasiliyor. */}
                  <p className="text-[11px] text-muted-foreground/70 mt-1">
                    kredi başına {formatPrice(pack.priceInCents / pack.credits)}
                    {savingVsBase(pack) > 0 ? ` · %${savingVsBase(pack)} avantaj` : ""}
                  </p>
                </div>
                <span className="text-right flex-shrink-0 ml-3">
                  <span className="block font-display font-bold text-primary text-lg">
                    {formatPrice(pack.priceInCents)}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {pending === pack.id ? "..." : "Satın al"}
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
              Sınırsız yazışma, 300 sesli yanıt.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">
              Yazılı mesajların 30 gün boyunca kredi harcamaz. Sesli yanıtlar
              pakete dahil 300 krediden düşer.
            </p>

            <ul className="space-y-2 mb-2">
              {[
                "Sınırsız yazılı mesaj",
                "300 sesli yanıt dahil",
                "Snake karakterinin kilidi açılır",
                "Tüm avatarlara erişim",
                "Sesli modda sıra önceliği",
                "Premium rozeti",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="w-4 h-4 text-secondary flex-shrink-0 mt-0.5" />
                  {line}
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
                isLoading={pending === plan.id}
                disabled={pending !== null}
                onClick={() =>
                  checkout("/api/stripe/checkout/subscription", { planId: plan.id }, plan.id)
                }
                data-testid={`premium-plan-${plan.id}`}
              >
                {/* Aktifken de alınabilir: satın alma pencereyi uzatır. */}
                {isPremium ? "Premium'u uzat" : "Premium'a geç"}
                {" — "}
                {formatPrice(plan.priceInCents)} / {PLAN_LABELS[plan.id].toLowerCase()}
              </NeonButton>
            ))}
          </div>

          <p className="text-center text-[11px] text-muted-foreground mt-4 pb-6">
            Ödemeler Stripe üzerinden alınır. Premium tek seferlik bir ödemedir,
            otomatik yenilenmez — iptal edilecek bir abonelik yok.
          </p>
        </>
      )}
    </div>
  );
}
