import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

/* ============================================================
   Global ses modu.
   isVoiceModeActive == true  -> GHOST MODE: TTS açık, mesaj balonları gizli
   isVoiceModeActive == false -> METİN MODU: TTS kapalı (maliyet koruması)

   silentFallbackToText: TTS/mikrofon çöktüğünde kullanıcıya hata
   göstermeden metin moduna düşer. Sesli modda ekranda yazı olmadığı için
   sessiz düşüş olmazsa kullanıcı boş ekrana bakar.
   ============================================================ */

interface VoiceModeContextValue {
  isVoiceModeActive: boolean;
  setVoiceModeActive: (active: boolean) => void;
  toggleVoiceMode: () => void;
  silentFallbackToText: (reason?: string) => void;
  lastFallbackReason: string | null;
}

const VoiceModeContext = createContext<VoiceModeContextValue | null>(null);

export function VoiceModeProvider({ children }: { children: ReactNode }) {
  const [isVoiceModeActive, setIsVoiceModeActive] = useState(false);
  const [lastFallbackReason, setLastFallbackReason] = useState<string | null>(null);

  const setVoiceModeActive = useCallback((active: boolean) => {
    setIsVoiceModeActive(active);
    if (active) setLastFallbackReason(null);
  }, []);

  const toggleVoiceMode = useCallback(
    () => setIsVoiceModeActive((prev) => !prev),
    [],
  );

  const silentFallbackToText = useCallback((reason?: string) => {
    console.warn("[VOICE] Metin moduna sessiz düşüş:", reason ?? "bilinmeyen sebep");
    setLastFallbackReason(reason ?? null);
    setIsVoiceModeActive(false);
  }, []);

  return (
    <VoiceModeContext.Provider
      value={{
        isVoiceModeActive,
        setVoiceModeActive,
        toggleVoiceMode,
        silentFallbackToText,
        lastFallbackReason,
      }}
    >
      {children}
    </VoiceModeContext.Provider>
  );
}

export function useVoiceMode() {
  const ctx = useContext(VoiceModeContext);
  if (!ctx) throw new Error("useVoiceMode, VoiceModeProvider içinde kullanılmalı");
  return ctx;
}
