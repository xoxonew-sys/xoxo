import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { User, Zap, Users } from "lucide-react";
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
      {/* Ust cubuk: oturum durumu. Dil dugmesi App.tsx'te global. */}
      <header className="flex items-center justify-end py-4">

        {!isLoading &&
          (isAuthenticated ? (
            <div className="flex items-center gap-2">
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
          ) : null)}
      </header>

      {/* Orta blok */}
      <div className="flex-1 flex flex-col items-center justify-center gap-9">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center space-y-3"
        >
          {/* Kaynak logo-3d.png 1024x1024 / ~1.1 MB. Burada kullanilan
              logo.webp ondan uretildi (bkz. scripts/generate-logo-assets.mjs):
              256px, ~6 KB. Kaynagi dogrudan baglamayin - acilis ekranina
              1.1 MB'lik bir gorsel koymak tum JS paketinin on katidir. */}
          <img
            src="/logo.webp"
            alt=""
            width={128}
            height={128}
            className="w-32 h-32 mx-auto mb-1 select-none pointer-events-none"
          />
          <h1 className="text-6xl font-display font-extrabold tracking-tight text-primary">
            XOXO
          </h1>
          <p className="text-base font-mono uppercase tracking-[0.35em] text-muted-foreground">
            Gossip AI
          </p>
        </motion.div>

        {/* Uzun aciklama yerine slogan: ilk ekranda okunacak degil,
            hissedilecek bir sey olmali. */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.5 }}
          className="text-center"
        >
          <h2
            className="text-3xl sm:text-4xl font-display font-black tracking-tight text-white"
            style={{ textShadow: "0 0 34px rgba(255,63,164,0.75)" }}
          >
            {language === "tr" ? "YARGI YOK." : "NO JUDGMENT."}
          </h2>
          <p className="mt-1.5 text-sm italic text-muted-foreground">
            {language === "tr" ? "Ya da azıcık." : "Or maybe a little."}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="w-full max-w-xs space-y-2"
        >
          {/* Misafir kullanim kaldirildi: herkes uye olur.
              Giris yapmamis kullanici once /login'e gider, oradan da
              kayit ekranina gecebilir. */}
          <NeonButton
            size="lg"
            fullWidth
            className="text-lg tracking-widest font-display font-bold py-4"
            onClick={() => setLocation(isAuthenticated ? "/judgment" : "/login")}
          >
            {language === "tr" ? "BAŞLA" : "START"}
          </NeonButton>

          {/* Sureli, kendini imha eden grup sohbeti */}
          <NeonButton
            variant="outline"
            size="lg"
            fullWidth
            className="text-lg tracking-widest font-display font-bold py-4"
            onClick={() => setLocation(isAuthenticated ? "/xroom" : "/login")}
            data-testid="home-xroom"
          >
            <Users className="w-5 h-5" />
            X-Room
          </NeonButton>
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
        <span className="mx-2 text-[11px] text-muted-foreground">&middot;</span>
        <button
          type="button"
          onClick={() => setLocation("/privacy")}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          {language === "tr" ? "Gizlilik ve KVKK" : "Privacy"}
        </button>
      </footer>
    </div>
  );
}
