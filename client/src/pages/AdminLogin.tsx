import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ShieldCheck, Mail, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { NeonButton } from "@/components/NeonButton";
import { apiRequest } from "@/lib/queryClient";

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  /* Zaten admin oturumu varsa panele geç */
  useEffect(() => {
    fetch("/api/admin/me", { credentials: "include" })
      .then((res) => res.ok && setLocation("/admin"))
      .catch(() => undefined);
  }, [setLocation]);

  const submit = async () => {
    setBusy(true);
    try {
      await apiRequest("POST", "/api/admin/login", { email, password });
      setLocation("/admin");
    } catch (err) {
      toast({
        title: "Giriş başarısız",
        description: err instanceof Error ? err.message : "Bilinmeyen hata",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full flex items-center justify-center px-5 safe-top safe-bottom">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm glass-panel rounded-3xl p-6 space-y-4"
      >
        <div className="flex items-center gap-2.5 mb-2">
          <ShieldCheck className="w-5 h-5 text-accent" />
          <h1 className="text-lg font-display font-bold">Yönetici girişi</h1>
        </div>

        <div className="relative">
          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Yönetici e-postası"
            autoComplete="email"
            className="w-full pl-11 pr-4 py-3 rounded-xl bg-input/60 border border-border text-sm focus:outline-none focus:border-accent/60"
          />
        </div>

        <div className="relative">
          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Yönetici şifresi"
            autoComplete="current-password"
            className="w-full pl-11 pr-4 py-3 rounded-xl bg-input/60 border border-border text-sm focus:outline-none focus:border-accent/60"
          />
        </div>

        <NeonButton variant="accent" fullWidth size="lg" isLoading={busy} onClick={submit}>
          Giriş yap
        </NeonButton>

        <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">
          Erişim yalnızca sunucudaki yetkili e-posta listesine açıktır. Şifre,
          Railway ortam değişkeni <span className="font-mono">ADMIN_PASSWORD</span> ile
          belirlenir.
        </p>
      </motion.div>
    </div>
  );
}
