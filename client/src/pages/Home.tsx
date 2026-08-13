import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import { NeonButton } from "@/components/NeonButton";

export default function Home() {
  const [, setLocation] = useLocation();
  const { t, language, setLanguage } = useLanguage();

  return (
    <div className="h-full flex flex-col items-center justify-center gap-10 px-6 safe-top safe-bottom">
      <button
        type="button"
        onClick={() => setLanguage(language === "tr" ? "en" : "tr")}
        className="absolute top-5 right-5 text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground safe-top"
      >
        {language === "tr" ? "EN" : "TR"}
      </button>

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
        className="w-full max-w-xs"
      >
        <NeonButton size="lg" fullWidth onClick={() => setLocation("/judgment")}>
          {language === "tr" ? "Başla" : "Start"}
        </NeonButton>
      </motion.div>
    </div>
  );
}
