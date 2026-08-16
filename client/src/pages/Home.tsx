import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { User, LogIn, Zap } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits } from "@/contexts/CreditContext";
import { NeonButton } from "@/components/NeonButton";

export default function Home() {
  const [, setLocation] = useLocation();
  const { t, language, setLanguage } = useLanguage();
  const { isAuthenticated, isLoading, user } = useAuth();
  const { credits } = useCredits();

  return (
    <div className="h-full flex flex-col px-6 safe-top safe-bottom">
      {/* Üst çubuk: dil + oturum durumu */}
      <header className="flex items-center justify-between py-4">
        <button
          type="button"
          onClick={() => setLanguage(language === "tr" ? "en" : "tr")}
          className="text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground px-2 py-1"
        >
          {language === "tr" ? "EN" : "TR"}
        </button>

        {!isLoading &&
          (isAuthenticated ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLocation("/pricing")}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full glass-panel text-xs font-medium text-primary"
                data-testid="credits-badge"
              >
                <Zap className="w-3.5 h-3.5" />
                {credits}
              </button>
              <button
                type="button"
                onClick={() => setLocation("/profile")}
                className="p-2 rounded-full glass-panel text-muted-foreground hover:text-foreground"
                aria-label="Profil"
                data-testid="profile-button"
              >
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
                ) : (
                  <User className="w-4 h-4" />
                )}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setLocation("/login")}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full glass-panel text-xs font-medium hover:text-primary transition-colors"
              data-testid="login-button"
            >
              <LogIn className="w-3.5 h-3.5" />
              {language === "tr" ? "Giriş yap" : "Log in"}
            </button>
          ))}
      </header>

      {/* Orta blok */}
      <div className="flex-1 flex flex-col items-center justify-center gap-9">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center space-y-3"
        >
          <h1 className="text-6xl font-display font-extrabold tracking-tight text-primary">
            XOXO
          </h1>
          <p className="text-xs font-mono uppercase tracking-[0.35em] text-muted-foreground">
            Gossip AI
          </p>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.5 }}
          className="max-w-xs text-center text-sm leading-relaxed text-muted-foreground"
        >
          {language === "tr"
            ? "İçini dök. Kimse yargılamıyor, hiçbir şey dışarı çıkmıyor."
            : "Say it out loud. No judgment, nothing leaves this room."}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="w-full max-w-xs space-y-2"
        >
          <NeonButton size="lg" fullWidth onClick={() => setLocation("/judgment")}>
            {language === "tr" ? "Başla" : "Start"}
          </NeonButton>

          {!isLoading && !isAuthenticated && (
            <button
              type="button"
              onClick={() => setLocation("/login")}
              className="w-full text-center text-xs text-muted-foreground py-2"
            >
              {language === "tr"
                ? "Sohbetlerin kaydolsun mu? Hesap oluştur"
                : "Want your chats saved? Create an account"}
            </button>
          )}
        </motion.div>
      </div>

      <footer className="py-4 text-center">
        <button
          type="button"
          onClick={() => setLocation("/pricing")}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          {language === "tr" ? "X-Kredi ve Premium" : "Credits & Premium"}
        </button>
      </footer>
    </div>
  );
}
