import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Smile } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORIES: { key: string; label: string; emojis: string[] }[] = [
  {
    key: "mood",
    label: "Ruh hali",
    emojis: ["😭", "😩", "🥲", "😅", "😐", "🙃", "😤", "😏", "🥴", "😌", "🤡", "💀", "😈", "🫠", "😶‍🌫️", "🥹"],
  },
  {
    key: "drama",
    label: "Dram",
    emojis: ["🔥", "💅", "👀", "🤫", "🗣️", "🙄", "💔", "❤️‍🔥", "🫦", "💋", "🍵", "🐍", "😱", "🤯", "⚡", "🚩"],
  },
  {
    key: "love",
    label: "Aşk",
    emojis: ["❤️", "🩷", "💜", "💖", "💘", "🥰", "😍", "😘", "🤍", "💐", "🌹", "✨", "🫶", "👩‍❤️‍👨", "💍", "🦋"],
  },
  {
    key: "react",
    label: "Tepki",
    emojis: ["👍", "👎", "🙏", "👏", "🤝", "💯", "✅", "❌", "🎉", "🥳", "🤞", "🫡", "🤔", "😴", "🍀", "⭐"],
  },
];

export function EmojiPicker({
  onEmojiSelect,
  className,
}: {
  onEmojiSelect: (emoji: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(CATEGORIES[0].key);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const active = CATEGORIES.find((c) => c.key === category) ?? CATEGORIES[0];

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
        aria-label="Emoji seç"
        data-testid="emoji-toggle"
      >
        <Smile className="w-5 h-5" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full mb-2 left-0 z-50 w-64 p-3 rounded-2xl border border-white/10 bg-[#160a20] shadow-2xl"
          >
            <div className="flex gap-1 mb-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  className={cn(
                    "flex-1 text-[10px] uppercase tracking-wide py-1 rounded-lg transition-colors",
                    c.key === category
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-8 gap-1">
              {active.emojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onEmojiSelect(emoji);
                    setOpen(false);
                  }}
                  className="text-lg leading-none p-1 rounded-lg hover:bg-white/10 transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default EmojiPicker;
