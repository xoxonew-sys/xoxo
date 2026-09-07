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
      description: err instanceof Error ? err.message : t("auth.toast.generic_error"),
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
        toast({ title: t("auth.toast.verify_email"), description: t("auth.toast.verify_email_body") });
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
        title: t("auth.toast.code_sent"),
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
      toast({ title: t("auth.toast.account_ready"), variant: "success" });
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
      toast({ title: t("auth.toast.reset_sent"), variant: "success" });
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
      toast({ title: t("auth.toast.password_changed"), variant: "success" });
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
    login: t("auth.title.login"),
    register: t("auth.title.register"),
    otp: t("auth.title.otp"),
    "reset-request": t("auth.title.reset-request"),
    "reset-verify": t("auth.title.reset-verify"),
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
                  placeholder={t("auth.identifier")}
                  value={identifier}
                  autoComplete="username"
                  onChange={(e) => setIdentifier(e.target.value)}
                />
                <Field
                  icon={Lock}
                  type="password"
                  placeholder={t("auth.password")}
                  value={password}
                  autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />
                <NeonButton fullWidth size="lg" isLoading={busy} onClick={handleLogin}>
                  {t("auth.submit.login")}
                </NeonButton>
                <div className="flex justify-between pt-1 text-xs text-muted-foreground">
                  <button type="button" onClick={() => setMode("reset-request")}>
                    {t("auth.forgot")}
                  </button>
                  <button
                    type="button"
                    className="text-primary"
                    onClick={() => setMode("register")}
                  >
                    {t("auth.title.register")}
                  </button>
                </div>
              </>
            )}

            {mode === "register" && (
              <>
                <Field
                  icon={User}
                  placeholder={t("auth.username")}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
                <Field
                  icon={Mail}
                  type="email"
                  placeholder={t("auth.email")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Field
                  icon={Lock}
                  type="password"
                  placeholder={t("auth.password_min")}
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
                      {g === "female" ? t("auth.gender.female") : t("auth.gender.male")}
                    </button>
                  ))}
                </div>

                <NeonButton fullWidth size="lg" isLoading={busy} onClick={handleRegister}>
                  {t("auth.submit.continue")}
                </NeonButton>
                <p className="text-center text-xs text-muted-foreground pt-1">
                  {t("auth.have_account")}{" "}
                  <button type="button" className="text-primary" onClick={() => setMode("login")}>
                    {t("auth.submit.login")}
                  </button>
                </p>
              </>
            )}

            {mode === "otp" && (
              <>
                <p className="text-sm text-muted-foreground text-center leading-relaxed mb-2">
                  {t("auth.otp_sent").replace("{email}", email || t("auth.your_email"))}
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
                  {t("auth.submit.verify")}
                </NeonButton>
                <button
                  type="button"
                  onClick={() => resendOtp(email).then(() => toast({ title: t("auth.toast.code_resent") }))}
                  className="w-full text-xs text-muted-foreground pt-1"
                >
                  {t("auth.resend_prompt")}
                </button>
              </>
            )}

            {mode === "reset-request" && (
              <>
                <Field
                  icon={Mail}
                  type="email"
                  placeholder={t("auth.email_registered")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <NeonButton fullWidth size="lg" isLoading={busy} onClick={handleResetRequest}>
                  {t("auth.submit.send_reset")}
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
                  placeholder={t("auth.password_new")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <NeonButton fullWidth size="lg" isLoading={busy} onClick={handleReset}>
                  {t("auth.submit.update_password")}
                </NeonButton>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
