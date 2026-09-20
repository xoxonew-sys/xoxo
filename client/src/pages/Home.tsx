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
    <div className="relative h-full flex flex-col px-6 safe-bottom">
      {/* Orta blok */}
      {/* ---------- Karakter fonu ----------
          Solda Snake (erkek), sagda Angel (kadin).

          TAM YUKSEKLIK: onceki surumde alt %62'yi kapliyordu ve ust
          kisim bos kaliyordu. Artik ekranin tamamini kapliyorlar.

          Dosyalar home-angel.webp / home-snake.webp - avatar klasorundeki
          -character.webp'lerden AYRI. Sebep: oradaki angel-character
          baska bir kisi; bu ikisi dogrudan istenen gorsellerden uretildi
          (700x1045, ~43 KB).

          Yazilari kapatmamasi icin uc katman:
            1. %38 opaklik
            2. ice dogru solan maske - metnin durdugu orta serit temiz
            3. dikey karartma - logo ustte, dugmeler altta okunur kalsin
          pointer-events-none: tiklamalar dugmelere gider. */}
      <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none select-none">
        <img
          src="/avatars/home-snake.webp"
          alt=""
          loading="lazy"
          className="absolute left-0 top-0 h-full w-auto max-w-[52%] object-cover object-right opacity-[0.38]"
          style={{
            maskImage:
              "linear-gradient(to right, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.45) 60%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to right, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.45) 60%, transparent 100%)",
          }}
        />
        <img
          src="/avatars/home-angel.webp"
          alt=""
          loading="lazy"
          className="absolute right-0 top-0 h-full w-auto max-w-[52%] object-cover object-left opacity-[0.38]"
          style={{
            maskImage:
              "linear-gradient(to left, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.45) 60%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to left, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.45) 60%, transparent 100%)",
          }}
        />
        {/* Dikey karartma: ust ve alt uclarda metin okunur kalsin */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, hsl(var(--background)) 0%, transparent 22%, transparent 74%, hsl(var(--background)) 100%)",
          }}
        />
      </div>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-9">
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

      <footer className="relative z-10 py-4 text-center">
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
