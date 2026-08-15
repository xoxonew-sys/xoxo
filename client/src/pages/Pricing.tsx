import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Check, Zap } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits } from "@/contexts/CreditContext";
import { useToast } from "@/hooks/use-toast";
import { NeonButton } from "@/components/NeonButton";

const PACKS = [
  { amount: 100, hint: "Denemek için" },
  { amount: 500, hint: "En çok tercih edilen", popular: true },
  { amount: 1500, hint: "En avantajlı" },
];

export default function Pricing() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const { credits, isPremium } = useCredits();
  const { toast } = useToast();
  const [pending, setPending] = useState<number | null>(null);

  const checkout = async (endpoint: string, body: Record<string, unknown>, key: number) => {
    if (!isAuthenticated) {
      setLocation("/login");
      return;
    }
    setPending(key);
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

      <div className="space-y-2.5 mb-6">
        {PACKS.map((pack) => (
          <button
            key={pack.amount}
            type="button"
            disabled={pending !== null}
            onClick={() => checkout("/api/stripe/checkout/credits", { amount: pack.amount }, pack.amount)}
            className="w-full glass-panel rounded-2xl p-4 flex items-center justify-between text-left active:scale-[0.99] transition-transform disabled:opacity-50"
          >
            <div>
              <p className="flex items-center gap-2 font-display font-bold">
                {pack.amount} X-Kredi
                {pack.popular && (
                  <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                    popüler
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{pack.hint}</p>
            </div>
            <span className="text-xs text-muted-foreground">
              {pending === pack.amount ? "..." : "Satın al"}
            </span>
          </button>
        ))}
      </div>

      <div className="glass-panel-strong rounded-2xl p-5">
        <h2 className="font-display font-bold text-secondary mb-3">Premium</h2>
        <ul className="space-y-2 mb-4">
          {[
            "Sınırsız yazılı sohbet",
            "Sesli modda öncelikli işlem",
            "Tüm avatarlara erişim",
            "X-Room oluşturmada indirim",
          ].map((line) => (
            <li key={line} className="flex items-start gap-2 text-sm text-muted-foreground">
              <Check className="w-4 h-4 text-secondary flex-shrink-0 mt-0.5" />
              {line}
            </li>
          ))}
        </ul>
        <NeonButton
          variant="secondary"
          fullWidth
          size="lg"
          disabled={isPremium}
          isLoading={pending === -1}
          onClick={() => checkout("/api/stripe/checkout/subscription", {}, -1)}
        >
          {isPremium ? "Zaten Premium'sun" : "Premium'a geç"}
        </NeonButton>
      </div>

      <p className="text-center text-[11px] text-muted-foreground mt-4 pb-6">
        Ödemeler Stripe üzerinden alınır. Aboneliği istediğin zaman iptal edebilirsin.
      </p>
    </div>
  );
}
