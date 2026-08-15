import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Mail, Lock, User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { NeonButton } from "@/components/NeonButton";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type Mode = "login" | "register" | "otp" | "reset-request" | "reset-verify";

function Field({
  icon: Icon,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { icon: typeof Mail }) {
  return (
    <div className="relative">
      <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <input
        {...props}
        className={cn(
          "w-full pl-11 pr-4 py-3 rounded-xl bg-input/60 border border-border",
          "text-sm placeholder:text-muted-foreground",
          "focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/40",
          "transition-colors",
        )}
      />
    </div>
  );
}

export default function Login() {
  const [, setLocation] = useLocation();
  const { login, register, verifyOtp, resendOtp } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();

  const [mode, setMode] = useState<Mode>("login");
  const [busy, setBusy] = useState(false);

  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [gender, setGender] = useState<"male" | "female">("female");

  const fail = (err: unknown) =>
    toast({
      title: t("chat.error"),
      description: err instanceof Error ? err.message : "Bir şeyler ters gitti",
      variant: "destructive",
    });

  const handleLogin = async () => {
    setBusy(true);
    try {
      await login(identifier, password, true);
      setLocation("/");
    } catch (err) {
      // Doğrulanmamış hesap: sunucu 403 döner, kullanıcıyı OTP adımına al
      const message = err instanceof Error ? err.message : "";
      if (message.toLowerCase().includes("doğrula")) {
        setEmail(identifier.includes("@") ? identifier : "");
        setMode("otp");
        toast({ title: "E-postanı doğrula", description: "Kodu gir ve devam et." });
      } else {
        fail(err);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async () => {
    setBusy(true);
    try {
      await register({ username, email, password, gender });
      setMode("otp");
      toast({
        title: "Kod gönderildi",
        description: `${email} adresine 6 haneli doğrulama kodu yolladık.`,
        variant: "success",
      });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    setBusy(true);
    try {
      await verifyOtp(email, otpCode);
      toast({ title: "Hesabın hazır", variant: "success" });
      setLocation("/");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const handleResetRequest = async () => {
    setBusy(true);
    try {
      await apiRequest("POST", "/api/auth/password-reset-request", { email });
      setMode("reset-verify");
      toast({ title: "Sıfırlama kodu gönderildi", variant: "success" });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    setBusy(true);
    try {
      await apiRequest("POST", "/api/auth/password-reset", {
        email,
        otpCode,
        newPassword: password,
      });
      toast({ title: "Şifren değişti", variant: "success" });
      setMode("login");
      setIdentifier(email);
      setPassword("");
      setOtpCode("");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const titles: Record<Mode, string> = {
    login: "Giriş yap",
    register: "Hesap oluştur",
    otp: "E-postanı doğrula",
    "reset-request": "Şifreni sıfırla",
    "reset-verify": "Yeni şifre belirle",
  };

  return (
    <div className="h-full flex flex-col px-5 py-6 safe-top safe-bottom">
      <header className="flex items-center gap-3 mb-8">
        <button
          type="button"
          onClick={() => (mode === "login" ? setLocation("/") : setMode("login"))}
          className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/5"
          aria-label={t("common.back")}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-display font-bold">{titles[mode]}</h1>
      </header>

      <div className="flex-1 flex flex-col justify-center max-w-sm w-full mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-3"
          >
            {mode === "login" && (
              <>
                <Field
                  icon={User}
                  placeholder="Kullanıcı adı veya e-posta"
                  value={identifier}
                  autoComplete="username"
                  onChange={(e) => setIdentifier(e.target.value)}
                />
                <Field
                  icon={Lock}
                  type="password"
                  placeholder="Şifre"
                  value={password}
                  autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />
                <NeonButton fullWidth size="lg" isLoading={busy} onClick={handleLogin}>
                  Giriş yap
                </NeonButton>
                <div className="flex justify-between pt-1 text-xs text-muted-foreground">
                  <button type="button" onClick={() => setMode("reset-request")}>
                    Şifremi unuttum
                  </button>
                  <button
                    type="button"
                    className="text-primary"
                    onClick={() => setMode("register")}
                  >
                    Hesap oluştur
                  </button>
                </div>
              </>
            )}

            {mode === "register" && (
              <>
                <Field
                  icon={User}
                  placeholder="Kullanıcı adı"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
                <Field
                  icon={Mail}
                  type="email"
                  placeholder="E-posta"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Field
                  icon={Lock}
                  type="password"
                  placeholder="Şifre (en az 6 karakter)"
                  value={password}
                  autoComplete="new-password"
                  onChange={(e) => setPassword(e.target.value)}
                />

                <div className="flex gap-2 pt-1">
                  {(["female", "male"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGender(g)}
                      className={cn(
                        "flex-1 py-2.5 rounded-xl border text-sm transition-colors",
                        gender === g
                          ? "border-primary/60 bg-primary/15 text-primary"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {g === "female" ? "Kadın" : "Erkek"}
                    </button>
                  ))}
                </div>

                <NeonButton fullWidth size="lg" isLoading={busy} onClick={handleRegister}>
                  Devam et
                </NeonButton>
                <p className="text-center text-xs text-muted-foreground pt-1">
                  Hesabın var mı?{" "}
                  <button type="button" className="text-primary" onClick={() => setMode("login")}>
                    Giriş yap
                  </button>
                </p>
              </>
            )}

            {mode === "otp" && (
              <>
                <p className="text-sm text-muted-foreground text-center leading-relaxed mb-2">
                  {email || "E-posta adresine"} gönderilen 6 haneli kodu gir.
                </p>
                <input
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  placeholder="000000"
                  className="w-full text-center text-3xl tracking-[0.5em] font-mono py-4 rounded-xl bg-input/60 border border-border focus:outline-none focus:border-primary/60"
                />
                <NeonButton
                  fullWidth
                  size="lg"
                  isLoading={busy}
                  disabled={otpCode.length !== 6}
                  onClick={handleVerify}
                >
                  Doğrula
                </NeonButton>
                <button
                  type="button"
                  onClick={() => resendOtp(email).then(() => toast({ title: "Kod tekrar gönderildi" }))}
                  className="w-full text-xs text-muted-foreground pt-1"
                >
                  Kod gelmedi mi? Tekrar gönder
                </button>
              </>
            )}

            {mode === "reset-request" && (
              <>
                <Field
                  icon={Mail}
                  type="email"
                  placeholder="Kayıtlı e-postan"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <NeonButton fullWidth size="lg" isLoading={busy} onClick={handleResetRequest}>
                  Sıfırlama kodu gönder
                </NeonButton>
              </>
            )}

            {mode === "reset-verify" && (
              <>
                <input
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  placeholder="000000"
                  className="w-full text-center text-3xl tracking-[0.5em] font-mono py-4 rounded-xl bg-input/60 border border-border focus:outline-none focus:border-primary/60"
                />
                <Field
                  icon={Lock}
                  type="password"
                  placeholder="Yeni şifre"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <NeonButton fullWidth size="lg" isLoading={busy} onClick={handleReset}>
                  Şifreyi güncelle
                </NeonButton>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
