import { useState, useEffect, useCallback, useRef } from "react";
import { apiRequest } from "@/lib/queryClient";

export interface ChatMessage {
  id: number;
  sessionId: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  /** Sunucu assistant cevabıyla birlikte yazma animasyonu bilgisi gönderir */
  typingInfo?: { minDelay: number; maxDelay: number; pausePoints: number[] };
}

/**
 * useChat(level, language, userId, gender, subLevel)
 *
 * Oturumu ilk mesajda tembel açar; sayfa açılışında boş oturum yaratmaz.
 * Oturum kimliği localStorage'da karakter+altseviye bazında tutulur, böylece
 * kullanıcı geri gelince aynı konuşma devam eder.
 */
export function useChat(
  level: 1 | 2 | 3,
  language: "tr" | "en",
  userId: string,
  gender: "male" | "female",
  subLevel: 1 | 2 = 1,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const sessionIdRef = useRef<number | null>(null);

  const storageKey = `xoxo_session_${userId}_${level}_${subLevel}`;

  /* Kayıtlı oturumu geri yükle */
  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      const saved = window.localStorage.getItem(storageKey);
      if (!saved) {
        sessionIdRef.current = null;
        setMessages([]);
        return;
      }
      const id = parseInt(saved, 10);
      if (Number.isNaN(id)) return;

      setIsLoading(true);
      try {
        const res = await fetch(`/api/chat/sessions/${id}`, { credentials: "include" });
        if (!res.ok) throw new Error("oturum bulunamadı");
        const data = await res.json();
        if (cancelled) return;
        sessionIdRef.current = id;
        setMessages(data.messages ?? []);
      } catch {
        // Oturum silinmiş veya süresi dolmuş — temiz başla
        window.localStorage.removeItem(storageKey);
        sessionIdRef.current = null;
        if (!cancelled) setMessages([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    restore();
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const ensureSession = useCallback(async (): Promise<number> => {
    if (sessionIdRef.current !== null) return sessionIdRef.current;

    const res = await apiRequest("POST", "/api/chat/sessions", {
      judgmentLevel: level,
      userId,
    });
    const session = await res.json();
    sessionIdRef.current = session.id;
    window.localStorage.setItem(storageKey, String(session.id));
    return session.id;
  }, [level, userId, storageKey]);

  const sendMessage = useCallback(
    async (content: string, imageBase64?: string, imageType?: string) => {
      if (!content.trim() && !imageBase64) return;

      const sessionId = await ensureSession();

      /* Kullanıcı mesajını iyimser olarak ekle */
      const optimistic: ChatMessage = {
        id: -Date.now(),
        sessionId,
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
      setIsTyping(true);

      try {
        const res = await apiRequest(
          "POST",
          `/api/chat/sessions/${sessionId}/messages`,
          { content, language, gender, subLevel, imageBase64, imageType },
        );
        const assistantMessage: ChatMessage = await res.json();
        setMessages((prev) => [...prev, assistantMessage]);
        return assistantMessage;
      } catch (err) {
        // Başarısız kullanıcı mesajını geri al ki sohbet yanlış görünmesin
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        throw err;
      } finally {
        setIsTyping(false);
      }
    },
    [ensureSession, language, gender, subLevel],
  );

  const resetChat = useCallback(() => {
    window.localStorage.removeItem(storageKey);
    sessionIdRef.current = null;
    setMessages([]);
    setIsTyping(false);
  }, [storageKey]);

  return {
    messages,
    isLoading,
    isTyping,
    sendMessage,
    resetChat,
    sessionId: sessionIdRef.current,
  };
}
