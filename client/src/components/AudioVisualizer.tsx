import { motion, AnimatePresence } from "framer-motion";
import { Volume2, RotateCcw, Mic } from "lucide-react";
import { cn } from "@/lib/utils";

type Personality = 1 | 2 | 3;

const accentBg: Record<Personality, string> = {
  1: "bg-secondary",
  2: "bg-primary",
  3: "bg-accent",
};

const accentText: Record<Personality, string> = {
  1: "text-secondary",
  2: "text-primary",
  3: "text-accent",
};

const accentRing: Record<Personality, string> = {
  1: "ring-secondary/50",
  2: "ring-primary/50",
  3: "ring-accent/50",
};

/* ------------------------------------------------------------
   Ses dalgası çubukları
   ------------------------------------------------------------ */
function WaveBars({
  active,
  personality = 2,
  bars = 5,
  className,
}: {
  active: boolean;
  personality?: Personality;
  bars?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-center gap-1 h-8", className)}>
      {Array.from({ length: bars }).map((_, i) => (
        <motion.span
          key={i}
          className={cn("w-1 rounded-full", accentBg[personality])}
          animate={
            active
              ? { height: ["25%", "100%", "45%", "80%", "25%"] }
              : { height: "20%" }
          }
          transition={{
            duration: 1.2,
            repeat: active ? Infinity : 0,
            delay: i * 0.11,
            ease: "easeInOut",
          }}
          style={{ height: "20%" }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------
   Mesaj balonundaki küçük oynatma göstergesi
   ------------------------------------------------------------ */
export function VoicePlaybackIndicator({
  isPlaying,
  personality = 2,
  className,
}: {
  isPlaying: boolean;
  personality?: Personality;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <Volume2 className={cn("w-3.5 h-3.5", accentText[personality])} />
      <WaveBars active={isPlaying} personality={personality} bars={3} className="h-3" />
    </span>
  );
}

/* ------------------------------------------------------------
   Ghost mode — sesli modda metin göstermeyen tam ekran arayüz
   ------------------------------------------------------------ */
export function ZeroTextVoiceInterface({
  isListening,
  isSpeaking,
  isProcessing,
  characterName,
  avatarUrl,
  personality = 2,
  hasAudioUrl,
  onReplay,
}: {
  isListening: boolean;
  isSpeaking: boolean;
  isProcessing: boolean;
  characterName: string;
  avatarUrl: string;
  personality?: Personality;
  hasAudioUrl?: boolean;
  onReplay?: () => void;
}) {
  const active = isListening || isSpeaking || isProcessing;

  const statusLabel = isListening
    ? "dinliyor"
    : isProcessing
      ? "düşünüyor"
      : isSpeaking
        ? "konuşuyor"
        : "hazır";

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6 select-none">
      {/* Avatar + genişleyen halkalar */}
      <div className="relative flex items-center justify-center">
        <AnimatePresence>
          {active &&
            [0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className={cn(
                  "absolute rounded-full border",
                  personality === 1
                    ? "border-secondary/40"
                    : personality === 2
                      ? "border-primary/40"
                      : "border-accent/40",
                )}
                initial={{ width: 140, height: 140, opacity: 0.7 }}
                animate={{ width: 280, height: 280, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.8 }}
              />
            ))}
        </AnimatePresence>

        <motion.div
          className={cn(
            "relative w-36 h-36 rounded-full overflow-hidden ring-4 shadow-2xl",
            accentRing[personality],
          )}
          animate={
            isSpeaking
              ? { scale: [1, 1.05, 1] }
              : isListening
                ? { scale: [1, 1.02, 1] }
                : { scale: 1 }
          }
          transition={{
            duration: isSpeaking ? 0.9 : 2,
            repeat: active ? Infinity : 0,
            ease: "easeInOut",
          }}
        >
          <img src={avatarUrl} alt={characterName} className="w-full h-full object-cover" />
        </motion.div>
      </div>

      {/* İsim ve durum */}
      <div className="text-center space-y-2">
        <h2 className={cn("text-2xl font-display font-bold", accentText[personality])}>
          {characterName}
        </h2>
        <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">
          {statusLabel}
        </p>
      </div>

      {/* Dalga göstergesi */}
      <WaveBars active={active} personality={personality} bars={7} className="h-12" />

      {/* Son cevabı tekrar dinle */}
      {hasAudioUrl && !isSpeaking && !isProcessing && (
        <button
          type="button"
          onClick={onReplay}
          className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/15 text-sm text-muted-foreground hover:text-foreground hover:border-white/30 transition-colors"
          data-testid="voice-replay"
        >
          <RotateCcw className="w-4 h-4" />
          Tekrar dinle
        </button>
      )}

      {!active && !hasAudioUrl && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Mic className="w-3.5 h-3.5" />
          Konuşmak için mikrofona basılı tut
        </p>
      )}
    </div>
  );
}

export default WaveBars;
