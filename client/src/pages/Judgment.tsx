import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  useAvatar,
  getAvatarsByGender,
  type Personality,
} from "@/contexts/AvatarContext";
import { cn } from "@/lib/utils";

/* ============================================================
   Karakter seçim akışı — iki adım

   1. tür     : Angel / Bestie / Snake
                Listede o türün avatar-1 görseli görünür.
   2. seçenek : avatar-1 (listedeki kişi) veya avatar-2 (farklı kişi)
                Seçim aynı zamanda kişilik seviyesini ve sesi belirler.

   Cinsiyet burada SORULMAZ — giriş ekranında veya profil
   ayarlarından belirlenir. Seçim yapılmamışsa kadın varsayılır.

   Not: *-character.webp (800x1200) görselleri bu akışta kullanılmıyor.
   ============================================================ */

const characters: {
  level: Personality;
  nameKey: string;
  taglineKey: string;
  ring: string;
  text: string;
}[] = [
  {
    level: 1,
    nameKey: "personality.angel.name",
    taglineKey: "personality.angel.tagline",
    ring: "ring-secondary/50",
    text: "text-secondary",
  },
  {
    level: 2,
    nameKey: "personality.bestie.name",
    taglineKey: "personality.bestie.tagline",
    ring: "ring-primary/50",
    text: "text-primary",
  },
  {
    level: 3,
    nameKey: "personality.snake.name",
    taglineKey: "personality.snake.tagline",
    ring: "ring-accent/50",
    text: "text-accent",
  },
];

export default function Judgment() {
  const [, setLocation] = useLocation();
  const { t, language } = useLanguage();
  const { gender, setAvatar, selected } = useAvatar();

  const [chosenType, setChosenType] = useState<Personality | null>(null);

  const isTr = language === "tr";
  const avatars = getAvatarsByGender(gender);

  const goBack = () => {
    if (chosenType !== null) {
      setChosenType(null);
    } else {
      setLocation("/");
    }
  };

  const pickAvatar = (level: Personality, avatarId: string) => {
    setAvatar(level, avatarId);
    setLocation(`/chat/${level}`);
  };

  const heading =
    chosenType === null
      ? isTr
        ? "Kiminle konuşmak istersin?"
        : "Who would you like to talk to?"
      : isTr
        ? "Hangi modda?"
        : "Which mode?";

  return (
    <div className="h-full flex flex-col px-5 py-6 safe-top safe-bottom">
      <header className="flex items-center gap-3 mb-8 flex-shrink-0">
        <button
          type="button"
          onClick={goBack}
          className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/5"
          aria-label={t("common.back")}
          data-testid="judgment-back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-display font-bold">{heading}</h1>
      </header>

      <AnimatePresence mode="wait">
        {/* ---------- 1. TÜR ---------- */}
        {chosenType === null && (
          <motion.div
            key="type"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col justify-center gap-4"
          >
            {characters.map((character, index) => (
              <motion.button
                key={character.level}
                type="button"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.08, duration: 0.35 }}
                onClick={() => setChosenType(character.level)}
                className="glass-panel rounded-3xl p-4 flex items-center gap-4 text-left active:scale-[0.98] transition-transform"
                data-testid={`character-${character.level}`}
              >
                <div
                  className={cn(
                    "w-16 h-16 rounded-2xl overflow-hidden ring-2 flex-shrink-0",
                    character.ring,
                  )}
                >
                  {/* Listede her zaman avatar-1 gorunur; avatar-2 ikinci adimda */}
                  <img
                    src={avatars[character.level][0].image}
                    alt={t(character.nameKey)}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="min-w-0">
                  <h2
                    className={cn(
                      "text-lg font-display font-bold",
                      character.text,
                    )}
                  >
                    {t(character.nameKey)}
                  </h2>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {t(character.taglineKey)}
                  </p>
                </div>
              </motion.button>
            ))}
          </motion.div>
        )}

        {/* ---------- 2. SEÇENEK (avatar = mod = ses) ---------- */}
        {chosenType !== null && (
          <motion.div
            key="option"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col justify-center gap-4"
          >
            {avatars[chosenType].map((option, index) => {
              const isSelected = selected[chosenType] === option.id;
              const theme = characters.find((c) => c.level === chosenType)!;

              return (
                <motion.button
                  key={option.id}
                  type="button"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.08, duration: 0.35 }}
                  onClick={() => pickAvatar(chosenType, option.id)}
                  className={cn(
                    "glass-panel rounded-3xl p-4 flex items-center gap-4 text-left active:scale-[0.98] transition-transform ring-1",
                    isSelected ? theme.ring : "ring-white/5",
                  )}
                  data-testid={`avatar-${option.id}`}
                >
                  <div
                    className={cn(
                      "w-24 h-24 rounded-2xl overflow-hidden ring-2 flex-shrink-0",
                      theme.ring,
                    )}
                  >
                    <img
                      src={option.image}
                      alt={isTr ? option.nameTr : option.nameEn}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2
                      className={cn(
                        "text-lg font-display font-bold",
                        theme.text,
                      )}
                    >
                      {isTr ? option.nameTr : option.nameEn}
                    </h2>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {isTr ? option.blurbTr : option.blurbEn}
                    </p>
                  </div>

                  {isSelected && (
                    <Check className={cn("w-5 h-5 flex-shrink-0", theme.text)} />
                  )}
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
