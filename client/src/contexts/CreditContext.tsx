import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useAuth } from "./AuthContext";

/* ============================================================
   Kredi durumu — Chat.tsx iyimser (optimistic) güncelleme yapıyor:
   deductCredits(n) UI'ı anında düşürür, sunucu doğrulaması arka planda
   koşar ve sonuç farklıysa refreshCredits() gerçek değeri geri yazar.
   ============================================================ */

interface CreditContextValue {
  credits: number;
  isPremium: boolean;
  isGodMode: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  /** Yalnızca yerel state'i düşürür — sunucu çağrısı yapmaz. */
  deductCredits: (amount: number) => void;
  /** Yalnızca yerel state'i artırır (satın alma sonrası anlık geri bildirim). */
  addCredits: (amount: number) => void;
  /** Sunucudan gerçek bakiyeyi çeker ve yerel state'i eşitler. */
  refreshCredits: () => Promise<void>;
}

const CreditContext = createContext<CreditContextValue | null>(null);

export function CreditProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [credits, setCredits] = useState(0);
  const [isPremium, setIsPremium] = useState(false);
  const [isGodMode, setIsGodMode] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refreshCredits = useCallback(async () => {
    if (!isAuthenticated) {
      setCredits(0);
      setIsPremium(false);
      setIsGodMode(false);
      setIsAdmin(false);
      setIsLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/x-credits", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setCredits(data.credits ?? 0);
      setIsPremium(!!data.isPremium);
      setIsGodMode(!!data.isGodMode);
      setIsAdmin(!!data.isAdmin);
    } catch (err) {
      console.error("[CREDITS] Bakiye alınamadı:", err);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    refreshCredits();
  }, [refreshCredits, user?.id]);

  /* Sekme yeniden odaklandığında bakiyeyi tazele — çoklu cihaz senkronu */
  useEffect(() => {
    const onFocus = () => refreshCredits();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshCredits]);

  const deductCredits = (amount: number) =>
    setCredits((prev) => Math.max(0, prev - amount));

  const addCredits = (amount: number) => setCredits((prev) => prev + amount);

  return (
    <CreditContext.Provider
      value={{
        credits,
        isPremium,
        isGodMode,
        isAdmin,
        isLoading,
        deductCredits,
        addCredits,
        refreshCredits,
      }}
    >
      {children}
    </CreditContext.Provider>
  );
}

export function useCredits() {
  const ctx = useContext(CreditContext);
  if (!ctx) throw new Error("useCredits, CreditProvider içinde kullanılmalı");
  return ctx;
}
