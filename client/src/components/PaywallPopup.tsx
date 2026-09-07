import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Zap } from "lucide-react";
import { CREDIT_PACKS, formatPrice } from "@shared/catalog";
import { isAppChannel, channelHeaders, PURCHASE_DOMAIN } from "@/lib/channel";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { NeonButton } from "./NeonButton";

export type PaywallType = "voice_limit" | "message_limit" | "room_credits" | "premium";

/**
 * Paketler ve fiyatlar shared/catalog.ts'te; burada sadece Türkçe metin.
 * Eskiden bu dosyada ayrı bir liste vardı ve "sunucuyla eşleşmeli"
 * yorumu taşıyordu — eşleşmiyordu: istemci {amount} gönderiyor, sunucu
 * {creditsAmount, priceInCents} bekliyordu, her istek 400 dönüyordu.
 * Tek liste kaldı, eşleşme sorunu da kalmadı.
 */
const PACK_HINTS: Record<string, string> = {
  credits_100: "Başlangıç",
  credits_500: "En çok tercih edilen",
  credits_1500: "En avantajlı",
};

export function PaywallPopup({
  isOpen,
  onClose,
  type = "message_limit",
}: {
  isOpen: boolean;
  onClose: () => void;
  type?: PaywallType;
}) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [pendingPack, setPendingPack] = useState<string | null>(null);

  // Uygulama kanalında hiçbir satın alma yüzeyi gösterilmez; bunun yerine
  // bakiyenin web sitesinden yüklendiğini söyleyen not çıkar. Bkz. lib/channel.ts.
  const appChannel = isAppChannel();

  const startCheckout = async (endpoint: string, body: Record<string, unknown>, key: string) => {
    setPendingPack(key);
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
        title: t("chat.error"),
        description: err instanceof Error ? err.message : "Ödeme başlatılamadı",
        variant: "destructive",
      });
      setPendingPack(null);
    }
  };

  const title =
    type === "voice_limit"
      ? t("paywall.voice_limit.title")
      : t("paywall.message_limit.title");
  const body =
    type === "voice_limit"
      ? t("paywall.voice_limit.body")
      : t("paywall.message_limit.body");

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          data-testid="paywall-overlay"
        >
          <motion.div
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-white/10 bg-[#160a20] p-6 shadow-2xl"
            initial={{ y: 60, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", damping: 26, stiffness: 280 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-display font-bold">{title}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/5"
                aria-label={t("common.close")}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed mb-5">{body}</p>

            {appChannel ? (
              <div className="rounded-xl border border-white/10 px-4 py-4">
                <h3 className="font-display font-bold text-sm mb-1">
                  {t("channel.web_only.title")}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t("channel.web_only.body")}
                </p>
                {/* Düz metin, bağlantı değil — iOS'ta ihlal, Play'de gri alan. */}
                <p className="mt-2 select-all font-display font-bold tracking-wide">
                  {PURCHASE_DOMAIN}
                </p>
              </div>
            ) : (
            <div className="space-y-2 mb-5">
              {CREDIT_PACKS.map((pack) => (
                <button
                  key={pack.id}
                  type="button"
                  disabled={pendingPack !== null}
                  onClick={() =>
                    startCheckout("/api/stripe/checkout/credits", { packId: pack.id }, pack.id)
                  }
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-white/10 hover:border-primary/50 hover:bg-primary/10 transition-colors disabled:opacity-50"
                  data-testid={`credit-pack-${pack.credits}`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {pack.credits} X-Kredi
                    {pack.popular && (
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                        popüler
                      </span>
                    )}
                  </span>
                  <span className="text-right">
                    <span className="block text-sm font-medium text-primary">
                      {formatPrice(pack.priceInCents)}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {pendingPack === pack.id ? "..." : PACK_HINTS[pack.id]}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            )}

            {/*
              Eskiden buradan doğrudan {} gövdesiyle abonelik checkout'u
              açılıyordu; sunucu planType beklediği için her tıklama 400
              dönüyordu. Bu açılır pencerede plan seçecek yer yok ve
              kullanıcı adına haftalık/aylık seçmek sessiz bir karar
              olurdu — seçimin yapıldığı yere, /pricing'e gönderiyoruz.
              Uygulama kanalında bu düğme hiç çıkmaz: /pricing orada da
              satmıyor, ama Premium'u burada anmak satın almaya çağrı olur.
            */}
            {!appChannel && (
              <>
                <NeonButton
                  variant="secondary"
                  fullWidth
                  disabled={pendingPack !== null}
                  onClick={() => {
                    onClose();
                    setLocation("/pricing");
                  }}
                  data-testid="go-premium"
                >
                  <Sparkles className="w-4 h-4" />
                  {t("credits.premium")}
                </NeonButton>

                <p className="mt-3 text-center text-[11px] text-muted-foreground">
                  Ödeme Stripe üzerinden alınır. İstediğin zaman iptal edebilirsin.
                </p>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default PaywallPopup;
