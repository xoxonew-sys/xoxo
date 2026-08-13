import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Personality = 1 | 2 | 3;

const accent: Record<Personality, string> = {
  1: "bg-secondary",
  2: "bg-primary",
  3: "bg-accent",
};

const ring: Record<Personality, string> = {
  1: "ring-secondary/60 shadow-secondary/30",
  2: "ring-primary/60 shadow-primary/30",
  3: "ring-accent/60 shadow-accent/30",
};

/* ------------------------------------------------------------
   Üç nokta yazıyor animasyonu
   ------------------------------------------------------------ */
export function TypingIndicator({ personality = 2 }: { personality?: Personality }) {
  return (
    <div className="flex items-center gap-1.5 py-1" aria-label="yazıyor">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className={cn("block w-2 h-2 rounded-full", accent[personality])}
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------
   Konuşurken nefes alan avatar
   ------------------------------------------------------------ */
export function PulseAvatar({
  src,
  alt,
  isTyping = false,
  personality = 2,
  size = "md",
  className,
}: {
  src: string;
  alt: string;
  isTyping?: boolean;
  personality?: Personality;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = { sm: "w-8 h-8", md: "w-11 h-11", lg: "w-20 h-20" };

  return (
    <motion.div
      className={cn(
        "rounded-full overflow-hidden ring-2 shadow-lg flex-shrink-0",
        sizes[size],
        ring[personality],
        className,
      )}
      animate={
        isTyping
          ? { scale: [1, 1.06, 1], boxShadow: ["0 0 0px", "0 0 18px", "0 0 0px"] }
          : { scale: 1 }
      }
      transition={{ duration: 1.6, repeat: isTyping ? Infinity : 0, ease: "easeInOut" }}
    >
      <img src={src} alt={alt} className="w-full h-full object-cover" />
    </motion.div>
  );
}

/* ------------------------------------------------------------
   Harf harf beliren metin
   typingInfo sunucudan gelir: getTypingDelay() çıktısı
   ------------------------------------------------------------ */
export function MessageReveal({
  text,
  typingInfo,
  className,
  onComplete,
}: {
  text: string;
  typingInfo?: { minDelay: number; maxDelay: number; pausePoints: number[] };
  className?: string;
  onComplete?: () => void;
}) {
  const [shown, setShown] = useState("");
  const completedRef = useRef(false);

  useEffect(() => {
    setShown("");
    completedRef.current = false;

    if (!text) return;

    const minDelay = typingInfo?.minDelay ?? 14;
    const maxDelay = typingInfo?.maxDelay ?? 32;
    const pausePoints = new Set(typingInfo?.pausePoints ?? []);

    let index = 0;
    let timer: ReturnType<typeof setTimeout>;

    const step = () => {
      index += 1;
      setShown(text.slice(0, index));

      if (index >= text.length) {
        if (!completedRef.current) {
          completedRef.current = true;
          onComplete?.();
        }
        return;
      }

      // Noktalama sonrası duraklama insansı ritim verir
      const base = minDelay + Math.random() * (maxDelay - minDelay);
      const delay = pausePoints.has(index) ? base + 260 : base;
      timer = setTimeout(step, delay);
    };

    timer = setTimeout(step, minDelay);
    return () => clearTimeout(timer);
  }, [text, typingInfo, onComplete]);

  return (
    <p className={className}>
      {shown}
      {shown.length < text.length && (
        <motion.span
          className="inline-block w-[2px] h-[1em] align-middle ml-0.5 bg-current"
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 0.9, repeat: Infinity }}
        />
      )}
    </p>
  );
}
