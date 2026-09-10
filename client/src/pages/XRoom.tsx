import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Copy, Check, Send, Users, Flag } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useAvatar, getAvatarsByGender, type Personality, type Gender } from "@/contexts/AvatarContext";
import { EmojiPicker } from "@/components/EmojiPicker";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

/* ============================================================
   X-Room — süreli, kendini imha eden grup sohbeti

   Akış:
     kurulum → süre + takma ad + karakter/cinsiyet → oda kodu
     katılım → kod + takma ad
     sohbet  → üyeler + yapay zekâ, üstte geri sayım
     imha    → son 10 sn kırmızı sayaç, sıfırda patlama, her şey silinir

   Sunucu oda süresi dolunca medyayı, mesajları ve odayı siliyor
   (routes.ts temizlik döngüsü) ve WebSocket'ten room_expired yayınlıyor.
   Buradaki geri sayım o ana kadar olan süreyi gösteriyor.

   Şikayet düğmesi mağaza şartı: kullanıcı üretimi içerik barındıran
   uygulamalarda bildirme yolu zorunlu (Apple 1.2, Google UGC).
   ============================================================ */

type Step = "menu" | "create" | "join" | "chat";
const DURATIONS = [5, 10, 15, 30] as const;

interface RoomMessage {
  id: number;
  memberId: string;
  nickname: string;
  content: string;
  messageType: string;
  avatarUrl?: string | null;
  createdAt: string;
}

interface Member {
  memberId: string;
  nickname: string;
  isAdmin: boolean;
}

/** Cihaz başına sabit kimlik — sunucu üyeleri bununla ayırt ediyor */
function getMemberId(): string {
  const KEY = "xoxo_member_id";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = `m_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    window.localStorage.setItem(KEY, id);
  }
  return id;
}

export default function XRoom() {
  const [, setLocation] = useLocation();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { gender } = useAvatar();

  const isTr = language === "tr";
  const memberId = useRef(getMemberId()).current;

  const [step, setStep] = useState<Step>("menu");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* kurulum */
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]>(10);
  const [nickname, setNickname] = useState(user?.displayName || user?.username || "");
  const [aiMode, setAiMode] = useState<Personality>(2);
  const [aiGender, setAiGender] = useState<Gender>(gender);
  const [joinCode, setJoinCode] = useState("");

  /* oda */
  const [code, setCode] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [content, setContent] = useState("");
  const [copied, setCopied] = useState(false);
  const [phase, setPhase] = useState<"live" | "blast" | "dead">("live");

  const [remaining, setRemaining] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef(0);
  const pollingRef = useRef(false); // ayni anda tek cekim

  const fail = (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    setError(msg);
    setTimeout(() => setError(null), 5000);
  };

  /* ---------- geri sayım ---------- */
  useEffect(() => {
    if (!expiresAt || phase !== "live") return;
    const tick = () => {
      const left = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) setPhase("blast");
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, phase]);

  /* patlama efekti bitince imha ekrani */
  useEffect(() => {
    if (phase !== "blast") return;
    const id = setTimeout(() => setPhase("dead"), 1600);
    return () => clearTimeout(id);
  }, [phase]);

  /* ---------- mesaj çekme ---------- */
  const poll = useCallback(async () => {
    if (!code || phase !== "live") return;
    if (pollingRef.current) return; // yaris durumunu engelle
    pollingRef.current = true;
    try {
      const res = await fetch(`/api/xroom/${code}/messages?after=${lastIdRef.current}`, {
        credentials: "include",
      });
      if (res.status === 404) {
        setPhase("blast");
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      const fresh: RoomMessage[] = data.messages ?? [];
      if (!fresh.length) return;

      lastIdRef.current = Math.max(lastIdRef.current, ...fresh.map((m) => m.id));

      // Kimlige gore tekillestir: ayni mesaj iki kez gelirse ekranda
      // iki kez gorunmesin.
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const add = fresh.filter((m) => !seen.has(m.id));
        return add.length ? [...prev, ...add] : prev;
      });
    } catch {
      /* ag dalgalanmasi */
    } finally {
      pollingRef.current = false;
    }
  }, [code, phase]);

  useEffect(() => {
    if (step !== "chat" || !code) return;
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [step, code, poll]);

  /* ---------- alta kaydır ---------- */
  useEffect(() => {
    const el = endRef.current;
    if (!el) return;
    const scroller = el.parentElement;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [messages]);

  /* ---------- oda kur ---------- */
  const createRoom = async () => {
    if (!nickname.trim()) return fail(new Error(isTr ? "Takma ad gerekli" : "Nickname required"));
    setBusy(true);
    try {
      const res = await apiRequest("POST", "/api/xroom/create", {
        durationMinutes: duration,
        nickname: nickname.trim(),
        memberId,
        aiMode,
        aiGender,
      });
      const data = await res.json();
      setCode(data.code);
      setExpiresAt(new Date(data.room.expiresAt));
      setMembers([{ memberId, nickname: nickname.trim(), isAdmin: true }]);
      setStep("chat");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  /* ---------- odaya katıl ---------- */
  const joinRoom = async () => {
    const c = joinCode.trim().toUpperCase();
    if (c.length !== 6) return fail(new Error(isTr ? "Oda kodu 6 karakter" : "Room code is 6 characters"));
    if (!nickname.trim()) return fail(new Error(isTr ? "Takma ad gerekli" : "Nickname required"));
    setBusy(true);
    try {
      await apiRequest("POST", "/api/xroom/join", {
        code: c,
        nickname: nickname.trim(),
        memberId,
      });
      const res = await fetch(`/api/xroom/${c}`, { credentials: "include" });
      const data = await res.json();
      setCode(c);
      setExpiresAt(new Date(data.room.expiresAt));
      setMembers(data.members ?? []);
      setMessages(data.messages ?? []);
      lastIdRef.current = data.messages?.length ? data.messages[data.messages.length - 1].id : 0;
      setStep("chat");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  /* ---------- mesaj gönder ---------- */
  const sendMessage = async () => {
    const text = content.trim();
    if (!text || busy || phase !== "live") return;
    setContent("");
    try {
      await apiRequest("POST", `/api/xroom/${code}/message`, {
        memberId,
        content: text,
        messageType: "text",
        language,
      });
      poll();
    } catch (err) {
      setContent(text);
      fail(err);
    }
  };

  /* ---------- şikayet ---------- */
  const report = async (msg: RoomMessage) => {
    const reason = window.prompt(
      isTr ? "Neden bildiriyorsun? (isteğe bağlı)" : "Why are you reporting this? (optional)",
    );
    if (reason === null) return;
    try {
      const res = await apiRequest("POST", `/api/xroom/${code}/report`, {
        reportedNickname: msg.nickname,
        messageText: msg.content,
        reason,
      });
      const data = await res.json();
      setError(data.message);
      setTimeout(() => setError(null), 5000);
    } catch (err) {
      fail(err);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const mmss = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const counting = remaining <= 10 && remaining > 0 && step === "chat";
  const avatars = getAvatarsByGender(aiGender);

  /* ============================================================
     PATLAMA
     ============================================================ */
  /* ============================================================
     PATLAMA — beyaz flas, sonra dagilan parcalar
     ============================================================ */
  if (phase === "blast") {
    const shards = Array.from({ length: 18 });
    return (
      <div className="fixed inset-0 z-[100] bg-black overflow-hidden">
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="absolute inset-0 bg-white"
        />
        <motion.div
          initial={{ scale: 0, opacity: 1 }}
          animate={{ scale: 6, opacity: 0 }}
          transition={{ duration: 1.1, ease: "easeOut" }}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full"
          style={{ background: "radial-gradient(circle,#fff 0%,#ff2d55 45%,transparent 70%)" }}
        />
        {shards.map((_, i) => {
          const angle = (i / shards.length) * Math.PI * 2;
          return (
            <motion.span
              key={i}
              initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
              animate={{
                x: Math.cos(angle) * (220 + Math.random() * 180),
                y: Math.sin(angle) * (220 + Math.random() * 180),
                opacity: 0,
                rotate: Math.random() * 540 - 270,
              }}
              transition={{ duration: 1.2, ease: "easeOut" }}
              className="absolute left-1/2 top-1/2 w-3 h-8"
              style={{ background: "#ff2d55", boxShadow: "0 0 18px rgba(255,45,85,0.9)" }}
            />
          );
        })}
      </div>
    );
  }

  if (phase === "dead") {
    return (
      <div className="h-full flex items-center justify-center bg-black">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: [0.6, 1.4, 1], opacity: 1 }}
          transition={{ duration: 0.8 }}
          className="text-center px-8"
        >
          <motion.div
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
            className="text-7xl font-display font-black text-destructive mb-6"
            style={{ textShadow: "0 0 40px rgba(255,0,60,0.8)" }}
          >
            {isTr ? "İMHA" : "DESTROYED"}
          </motion.div>
          <p className="text-sm tracking-[0.3em] uppercase text-destructive/70 mb-8">
            {isTr ? "auto-destruction protocol" : "auto-destruction protocol"}
          </p>
          <p className="text-sm text-muted-foreground mb-8 leading-relaxed max-w-xs mx-auto">
            {isTr
              ? "Oda kapandı. Konuşulanların tamamı silindi — sunucuda da kopyası yok."
              : "The room is closed. Everything said was deleted — no copy remains on the server."}
          </p>
          <button
            type="button"
            onClick={() => setLocation("/")}
            className="px-6 py-3 rounded-full glass-panel text-sm"
            data-testid="xroom-exit"
          >
            {isTr ? "Ana sayfaya dön" : "Back to home"}
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col px-5 py-6 safe-top safe-bottom">
      {/* ---------- SON 10 SANIYE: tam ekran geri sayim ---------- */}
      <AnimatePresence>
        {counting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center pointer-events-none"
            style={{ background: "radial-gradient(circle,rgba(255,45,85,0.18) 0%,rgba(0,0,0,0.86) 70%)" }}
          >
            <motion.div
              key={remaining}
              initial={{ scale: 1.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="text-[8rem] leading-none font-display font-black"
              style={{ color: "#ff2d55", textShadow: "0 0 60px rgba(255,45,85,0.95)" }}
              data-testid="xroom-countdown"
            >
              {remaining}
            </motion.div>
            <motion.p
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="mt-4 text-xs tracking-[0.35em] uppercase"
              style={{ color: "#ff2d55" }}
            >
              auto-destruction protocol
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="flex items-center gap-3 mb-4 flex-shrink-0">
        <button
          type="button"
          onClick={() => (step === "chat" ? setLocation("/") : setStep("menu"))}
          className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/5"
          aria-label={t("common.back")}
          data-testid="xroom-back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-display font-bold flex-1">X-Room</h1>

        {step === "chat" && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="w-3.5 h-3.5" />
            {members.length}
          </span>
        )}
      </header>

      {/* ---------- SURE: ust orta, LED gorunumlu geri sayim ----------
           Odadaki herkes ayni sureyi gorur - sunucudaki expiresAt'ten
           hesaplaniyor, istemci saatine gore degil. */}
      {step === "chat" && (
        <div className="flex justify-center mb-4 flex-shrink-0">
          <motion.div
            animate={counting ? { scale: [1, 1.06, 1] } : {}}
            transition={{ duration: 0.7, repeat: counting ? Infinity : 0 }}
            className="relative px-7 py-3 rounded-2xl"
            style={{
              background: "#0a0510",
              border: `2px solid ${remaining <= 60 ? "#ff2d55" : "#ff3fa4"}`,
              boxShadow: `0 0 24px ${remaining <= 60 ? "rgba(255,45,85,0.75)" : "rgba(255,63,164,0.55)"}, inset 0 0 18px rgba(0,0,0,0.9)`,
            }}
            data-testid="xroom-timer"
          >
            <span
              className="font-mono font-bold tabular-nums"
              style={{
                fontSize: "22px",
                letterSpacing: "3px",
                color: remaining <= 60 ? "#ff5c7a" : "#ff6ec7",
                textShadow: `0 0 12px ${remaining <= 60 ? "#ff2d55" : "#ff3fa4"}, 0 0 28px ${remaining <= 60 ? "rgba(255,45,85,0.7)" : "rgba(255,63,164,0.6)"}`,
              }}
            >
              {mmss(remaining)}
            </span>
          </motion.div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* ---------- MENÜ ---------- */}
        {step === "menu" && (
          <motion.div
            key="menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col justify-center gap-4"
          >
            <p className="text-center text-sm text-muted-foreground leading-relaxed mb-2">
              {isTr
                ? "Süreli bir oda kur, kodu arkadaşlarına ver. Süre dolunca her şey silinir."
                : "Create a timed room and share the code. When time runs out, everything is deleted."}
            </p>
            <button
              type="button"
              onClick={() => setStep("create")}
              className="glass-panel rounded-3xl p-5 text-left active:scale-[0.98] transition-transform"
              data-testid="xroom-create-btn"
            >
              <h2 className="text-lg font-display font-bold text-primary mb-1">
                {isTr ? "Oda kur" : "Create a room"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {isTr ? "Süreyi ve karakteri sen seç" : "You pick the timer and the character"}
              </p>
            </button>
            <button
              type="button"
              onClick={() => setStep("join")}
              className="glass-panel rounded-3xl p-5 text-left active:scale-[0.98] transition-transform"
              data-testid="xroom-join-btn"
            >
              <h2 className="text-lg font-display font-bold mb-1">
                {isTr ? "Odaya katıl" : "Join a room"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {isTr ? "Elindeki 6 haneli kodu gir" : "Enter the 6-character code"}
              </p>
            </button>
          </motion.div>
        )}

        {/* ---------- ODA KUR ---------- */}
        {step === "create" && (
          <motion.div
            key="create"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 overflow-y-auto space-y-6"
          >
            <Field label={isTr ? "Takma adın" : "Your nickname"}>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={20}
                placeholder={isTr ? "Odada görünecek ad" : "Shown in the room"}
                className="w-full glass-panel rounded-2xl px-4 py-3 text-sm bg-transparent outline-none"
                data-testid="xroom-nickname"
              />
            </Field>

            <Field label={isTr ? "Süre" : "Duration"}>
              <div className="grid grid-cols-4 gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuration(d)}
                    className={cn(
                      "py-3 rounded-2xl text-sm transition-colors",
                      duration === d
                        ? "bg-primary/20 text-primary ring-1 ring-primary"
                        : "glass-panel text-muted-foreground",
                    )}
                    data-testid={`xroom-duration-${d}`}
                  >
                    {d} {isTr ? "dk" : "min"}
                  </button>
                ))}
              </div>
            </Field>

            <Field label={isTr ? "Odaya katılacak karakter" : "Character joining the room"}>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {(["female", "male"] as Gender[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setAiGender(g)}
                    className={cn(
                      "py-2.5 rounded-2xl text-sm transition-colors",
                      aiGender === g
                        ? "bg-primary/20 text-primary ring-1 ring-primary"
                        : "glass-panel text-muted-foreground",
                    )}
                  >
                    {g === "female" ? (isTr ? "Kadın" : "Woman") : isTr ? "Erkek" : "Man"}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                {([1, 2, 3] as Personality[]).map((level) => {
                  const option = avatars[level][0];
                  const active = aiMode === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setAiMode(level)}
                      className={cn(
                        "w-full glass-panel rounded-2xl p-3 flex items-center gap-3 text-left ring-1 transition-colors",
                        active ? "ring-primary" : "ring-white/5",
                      )}
                      data-testid={`xroom-ai-${level}`}
                    >
                      <img
                        src={option.image}
                        alt=""
                        className="w-12 h-12 rounded-xl object-cover flex-shrink-0"
                        loading="lazy"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {level === 1 ? "Angel" : level === 2 ? "Bestie" : "Snake"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {isTr ? option.blurbTr : option.blurbEn}
                        </p>
                      </div>
                      {active && <Check className="w-4 h-4 text-primary ml-auto flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </Field>

            <button
              type="button"
              onClick={createRoom}
              disabled={busy}
              className="w-full py-4 rounded-2xl bg-primary/20 text-primary ring-1 ring-primary text-sm font-medium disabled:opacity-50"
              data-testid="xroom-create-submit"
            >
              {busy ? (isTr ? "Kuruluyor…" : "Creating…") : isTr ? "Odayı kur" : "Create room"}
            </button>
          </motion.div>
        )}

        {/* ---------- KATIL ---------- */}
        {step === "join" && (
          <motion.div
            key="join"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col justify-center space-y-6"
          >
            <Field label={isTr ? "Oda kodu" : "Room code"}>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="ABC123"
                className="w-full glass-panel rounded-2xl px-4 py-4 text-center text-2xl font-mono tracking-[0.4em] bg-transparent outline-none"
                data-testid="xroom-join-code"
              />
            </Field>

            <Field label={isTr ? "Takma adın" : "Your nickname"}>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={20}
                className="w-full glass-panel rounded-2xl px-4 py-3 text-sm bg-transparent outline-none"
              />
            </Field>

            <button
              type="button"
              onClick={joinRoom}
              disabled={busy}
              className="w-full py-4 rounded-2xl bg-primary/20 text-primary ring-1 ring-primary text-sm font-medium disabled:opacity-50"
              data-testid="xroom-join-submit"
            >
              {busy ? (isTr ? "Katılıyor…" : "Joining…") : isTr ? "Katıl" : "Join"}
            </button>
          </motion.div>
        )}

        {/* ---------- SOHBET ---------- */}
        {step === "chat" && (
          <motion.div
            key="chat"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 flex flex-col min-h-0"
          >
            <button
              type="button"
              onClick={copyCode}
              className="glass-panel rounded-2xl px-4 py-3 flex items-center justify-between mb-3 flex-shrink-0"
              data-testid="xroom-code-copy"
            >
              <span className="text-xs text-muted-foreground">
                {isTr ? "Oda kodu — arkadaşlarına ver" : "Room code — share it"}
              </span>
              <span className="flex items-center gap-2 font-mono text-lg tracking-[0.3em] text-primary">
                {code}
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </span>
            </button>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {messages.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-10">
                  {isTr ? "Henüz mesaj yok. Başlat." : "No messages yet. Start it."}
                </p>
              )}

              {messages.map((m) => {
                const mine = m.memberId === memberId;
                const isAi = m.messageType === "ai" || m.memberId === "ai";
                return (
                  <div
                    key={m.id}
                    className={cn("flex gap-2 group", mine && "flex-row-reverse")}
                  >
                    <div
                      className={cn(
                        "max-w-[78%] rounded-2xl px-4 py-2.5",
                        isAi
                          ? "bg-accent/15 ring-1 ring-accent/40"
                          : mine
                            ? "bg-primary/20"
                            : "glass-panel",
                      )}
                    >
                      {!mine && (
                        <p
                          className={cn(
                            "text-[11px] mb-0.5",
                            isAi ? "text-accent" : "text-muted-foreground",
                          )}
                        >
                          {m.nickname}
                          {isAi && " (AI)"}
                        </p>
                      )}
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
                    </div>

                    {!mine && !isAi && (
                      <button
                        type="button"
                        onClick={() => report(m)}
                        className="self-center p-1.5 rounded-full text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        aria-label={isTr ? "Bildir" : "Report"}
                        data-testid={`xroom-report-${m.id}`}
                      >
                        <Flag className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>

            <p className="text-[11px] text-muted-foreground/60 text-center py-2 flex-shrink-0">
              {isTr
                ? "Uygunsuz mesajları bayrak ikonuyla bildir — 24 saat içinde incelenir."
                : "Report inappropriate messages with the flag icon — reviewed within 24 hours."}
            </p>

            <div className="flex gap-2 flex-shrink-0 items-center">
              <EmojiPicker onEmojiSelect={(emoji) => setContent((prev) => prev + emoji)} />
              <input
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={isTr ? "Mesaj" : "Message"}
                className="flex-1 glass-panel rounded-full px-5 py-3 text-sm bg-transparent outline-none"
                data-testid="xroom-input"
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={!content.trim()}
                className="w-12 h-12 rounded-full bg-primary flex items-center justify-center disabled:opacity-40 flex-shrink-0"
                aria-label={t("chat.send")}
                data-testid="xroom-send"
              >
                <Send className="w-5 h-5 text-white" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-full glass-panel text-sm text-primary z-50 max-w-[90%] text-center">
          {error}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs tracking-widest text-muted-foreground mb-2 uppercase">{label}</p>
      {children}
    </div>
  );
}
