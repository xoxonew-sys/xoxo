import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAvatar, getAvatarsByGender, type Personality } from "@/contexts/AvatarContext";
import { cn } from "@/lib/utils";

const characters: { level: Personality; nameKey: string; taglineKey: string; ring: string; text: string }[] = [
  { level: 1, nameKey: "personality.angel.name", taglineKey: "personality.angel.tagline", ring: "ring-secondary/50", text: "text-secondary" },
  { level: 2, nameKey: "personality.bestie.name", taglineKey: "personality.bestie.tagline", ring: "ring-primary/50", text: "text-primary" },
  { level: 3, nameKey: "personality.snake.name", taglineKey: "personality.snake.tagline", ring: "ring-accent/50", text: "text-accent" },
];

export default function Judgment() {
  const [, setLocation] = useLocation();
  const { t } = useLanguage();
  const { gender } = useAvatar();
  const avatars = getAvatarsByGender(gender);

  return (
    <div className="h-full flex flex-col px-5 py-6 safe-top safe-bottom">
      <header className="flex items-center gap-3 mb-8">
        <button
          type="button"
          onClick={() => setLocation("/")}
          className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/5"
          aria-label={t("common.back")}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-display font-bold">Kiminle konuşmak istersin?</h1>
      </header>

      <div className="flex-1 flex flex-col justify-center gap-4">
        {characters.map((character, index) => (
          <motion.button
            key={character.level}
            type="button"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.08, duration: 0.35 }}
            onClick={() => setLocation(`/chat/${character.level}`)}
            className="glass-panel rounded-3xl p-4 flex items-center gap-4 text-left active:scale-[0.98] transition-transform"
            data-testid={`character-${character.level}`}
          >
            <div className={cn("w-16 h-16 rounded-2xl overflow-hidden ring-2 flex-shrink-0", character.ring)}>
              <img
                src={avatars[character.level][0].image}
                alt={t(character.nameKey)}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <h2 className={cn("text-lg font-display font-bold", character.text)}>
                {t(character.nameKey)}
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t(character.taglineKey)}
              </p>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
