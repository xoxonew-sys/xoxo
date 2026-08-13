import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Zap } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { NeonButton } from "./NeonButton";

export type PaywallType = "voice_limit" | "message_limit" | "room_credits" | "premium";

/** Kredi paketleri — miktarlar sunucudaki /api/stripe/checkout/credits ile eşleşmeli */
const CREDIT_PACKS = [
  { amount: 100, label: "100 X-Kredi", hint: "Başlangıç" },
  { amount: 500, label: "500 X-Kredi", hint: "En çok tercih edilen", popular: true },
  { amount: 1500, label: "1500 X-Kredi", hint: "En avantajlı" },
];

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
  const [pendingAmount, setPendingAmount] = useState<number | null>(null);

  const startCheckout = async (endpoint: string, body: Record<string, unknown>, key: number) => {
    setPendingAmount(key);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
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
      setPendingAmount(null);
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

            <div className="space-y-2 mb-5">
              {CREDIT_PACKS.map((pack) => (
                <button
                  key={pack.amount}
                  type="button"
                  disabled={pendingAmount !== null}
                  onClick={() =>
                    startCheckout("/api/stripe/checkout/credits", { amount: pack.amount }, pack.amount)
                  }
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-white/10 hover:border-primary/50 hover:bg-primary/10 transition-colors disabled:opacity-50"
                  data-testid={`credit-pack-${pack.amount}`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {pack.label}
                    {pack.popular && (
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                        popüler
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {pendingAmount === pack.amount ? "..." : pack.hint}
                  </span>
                </button>
              ))}
            </div>

            <NeonButton
              variant="secondary"
              fullWidth
              isLoading={pendingAmount === -1}
              onClick={() => startCheckout("/api/stripe/checkout/subscription", {}, -1)}
              data-testid="go-premium"
            >
              <Sparkles className="w-4 h-4" />
              {t("credits.premium")}
            </NeonButton>

            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Ödeme Stripe üzerinden alınır. İstediğin zaman iptal edebilirsin.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default PaywallPopup;
