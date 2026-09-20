import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Check, AlertCircle, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCredits } from "@/contexts/CreditContext";
import { apiRequest } from "@/lib/queryClient";
import { NeonButton } from "@/components/NeonButton";

/* ============================================================
   Ödeme sonrası dönüş sayfası

   Stripe ödeme bitince buraya yönlendiriyor:
     /payment-success?type=credits&amount=100&session_id=cs_...

   BU SAYFA ZORUNLU. Krediyi yükleyen şey /api/stripe/verify-session
   ve onu çağıran tek yer burası — webhook yok. Rota eksikken ödeme
   alınıyor ama kullanıcı 404 görüyor ve kredi hiç yüklenmiyordu.

   Sunucu aynı session_id'yi iki kez işlemiyor (getPaymentBySessionId),
   bu yüzden sayfa yenilense de kredi tekrar eklenmez.
   ============================================================ */

type State = "verifying" | "done" | "error";

export default function PaymentSuccess() {
  const [, setLocation] = useLocation();
  const { language } = useLanguage();
  const { refreshCredits } = useCredits();
  const isTr = language === "tr";

  const [state, setState] = useState<State>("verifying");
  const [amount, setAmount] = useState<number | null>(null);
  const [kind, setKind] = useState<string>("credits");
  const [message, setMessage] = useState<string>("");

  // Effect iki kez calisabilir (React StrictMode); tek dogrulama yeter.
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    setKind(params.get("type") || "credits");

    if (!sessionId) {
      setState("error");
      setMessage(isTr ? "Ödeme bilgisi bulunamadı." : "No payment information found.");
      return;
    }

    (async () => {
      try {
        const res = await apiRequest("POST", "/api/stripe/verify-session", { sessionId });
        const data = await res.json();
        setAmount(typeof data.amount === "number" ? data.amount : null);
        setKind(data.type || "credits");
        setState("done");
        refreshCredits?.();
      } catch (err: any) {
        setState("error");
        setMessage(
          err?.message ||
            (isTr
              ? "Ödeme doğrulanamadı. Krediler birkaç dakika içinde yüklenmezse bize yazın."
              : "Could not verify the payment. If credits don't arrive shortly, contact us."),
        );
      }
    })();
  }, [isTr, refreshCredits]);

  return (
    <div className="h-full flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center max-w-xs w-full"
      >
        {state === "verifying" && (
          <>
            <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-5" />
            <p className="text-sm text-muted-foreground">
              {isTr ? "Ödemen doğrulanıyor…" : "Verifying your payment…"}
            </p>
          </>
        )}

        {state === "done" && (
          <>
            <motion.div
              initial={{ scale: 0.6 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 220, damping: 14 }}
              className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center"
              style={{
                background: "rgba(255,63,164,0.15)",
                border: "2px solid #ff3fa4",
                boxShadow: "0 0 30px rgba(255,63,164,0.6)",
              }}
            >
              <Check className="w-10 h-10 text-primary" />
            </motion.div>

            <h1 className="text-2xl font-display font-bold mb-2">
              {isTr ? "Ödeme tamam" : "Payment complete"}
            </h1>

            <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
              {kind === "subscription"
                ? isTr
                  ? "Premium 30 gün boyunca açık. Sınırsız yazışma ve 300 sesli yanıt hesabına tanımlandı."
                  : "Premium is active for 30 days. Unlimited texting and 300 voice replies are on your account."
                : amount
                  ? isTr
                    ? `${amount} X-Kredi hesabına eklendi.`
                    : `${amount} X-Credits were added to your account.`
                  : isTr
                    ? "Kredilerin hesabına eklendi."
                    : "Your credits were added."}
            </p>

            <NeonButton size="lg" fullWidth onClick={() => setLocation("/judgment")}>
              {isTr ? "Sohbete dön" : "Back to chat"}
            </NeonButton>
          </>
        )}

        {state === "error" && (
          <>
            <div className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center bg-destructive/15 ring-2 ring-destructive">
              <AlertCircle className="w-10 h-10 text-destructive" />
            </div>

            <h1 className="text-xl font-display font-bold mb-2">
              {isTr ? "Bir şey ters gitti" : "Something went wrong"}
            </h1>

            <p className="text-sm text-muted-foreground mb-8 leading-relaxed">{message}</p>

            {/* Odeme alinmis olabilir - kullaniciyi tekrar odemeye
                yonlendirmiyoruz, once destek yolu. */}
            <NeonButton variant="outline" size="lg" fullWidth onClick={() => setLocation("/")}>
              {isTr ? "Ana sayfaya dön" : "Back to home"}
            </NeonButton>

            <p className="text-[11px] text-muted-foreground/70 mt-4">
              hello@xoxo-apps.com
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
}
