import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, LogOut, Trash2, Zap, Camera, X, Gift, Copy, Check } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCredits } from "@/contexts/CreditContext";
import { useAvatar, getAvatarsByGender, type Personality } from "@/contexts/AvatarContext";
import { useToast } from "@/hooks/use-toast";
import { NeonButton } from "@/components/NeonButton";
import { cn } from "@/lib/utils";

export default function Profile() {
  const [, setLocation] = useLocation();
  const { user, isLoading, logout, updateDisplayName, updateGender, deleteAccount } = useAuth();
  const { credits, isPremium } = useCredits();
  const { t } = useLanguage();
  const { gender, setGender, selected, setAvatar } = useAvatar();
  const { toast } = useToast();

  const [name, setName] = useState(user?.displayName ?? "");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(user?.avatarUrl ?? null);

  /* Davet kodu. Sunucu kodu ilk istekte uretiyor (ensureReferralCode),
     bu yuzden kayit aninda kod olmayan eski kullanicilar da burayi
     acinca kodunu almis oluyor. */
  const [referral, setReferral] = useState<{
    code: string;
    used: number;
    max: number;
    remaining: number;
    referrerReward: number;
    referredReward: number;
  } | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/referral", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setReferral(data);
      } catch {
        /* davet bolumu gorunmez, sayfanin geri kalani calisir */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const copyCode = () => {
    if (!referral) return;
    navigator.clipboard.writeText(referral.code);
    setCodeCopied(true);
    toast({ title: t("referral.copied"), variant: "success" });
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const shareCode = async () => {
    if (!referral) return;
    const text = t("referral.share_text") + referral.code;
    if (navigator.share) {
      try {
        await navigator.share({ text, url: "https://xoxo-apps.com" });
        return;
      } catch {
        /* kullanici vazgecti ya da desteklenmiyor - panoya dus */
      }
    }
    navigator.clipboard.writeText(`${text}\nhttps://xoxo-apps.com`);
    toast({ title: t("referral.copied"), variant: "success" });
  };

  /**
   * Secilen gorseli 256px kareye kucultup JPEG'e cevirir.
   * Sebep: avatar veritabaninda metin kolonunda data URL olarak duruyor.
   * Ham telefon fotografi 3-5 MB; kucultmeden gonderirsek satir siser ve
   * her kullanici listesi sorgusu agirlasir. 256px JPEG ~30 KB.
   */
  const shrink = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("read"));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("decode"));
        img.onload = () => {
          const SIZE = 256;
          const canvas = document.createElement("canvas");
          canvas.width = SIZE;
          canvas.height = SIZE;
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("canvas"));
          // Kisa kenardan kare kirp - yuz ortada kalsin
          const side = Math.min(img.width, img.height);
          ctx.drawImage(
            img,
            (img.width - side) / 2,
            (img.height - side) / 2,
            side,
            side,
            0,
            0,
            SIZE,
            SIZE,
          );
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: t("profile.photo.only_image"), variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: t("profile.photo.too_large"), variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await shrink(file);
      const res = await fetch("/api/auth/avatar", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: dataUrl }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      setPhoto(dataUrl);
      toast({ title: t("profile.saved"), variant: "success" });
    } catch (err: any) {
      toast({ title: err?.message || t("profile.photo.failed"), variant: "destructive" });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removePhoto = async () => {
    setBusy(true);
    try {
      await fetch("/api/auth/avatar", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: null }),
      });
      setPhoto(null);
    } catch {
      toast({ title: t("profile.photo.failed"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-7 h-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) {
    setLocation("/login");
    return null;
  }

  const saveName = async () => {
    setBusy(true);
    try {
      await updateDisplayName(name.trim());
      toast({ title: t("profile.saved"), variant: "success" });
    } catch {
      toast({ title: t("profile.save_failed"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const changeGender = async (next: "male" | "female") => {
    setGender(next);
    try {
      await updateGender(next);
    } catch {
      toast({ title: t("profile.sync_failed"), variant: "destructive" });
    }
  };

  const removeAccount = async () => {
    if (!window.confirm(t("profile.delete_confirm"))) return;
    try {
      await deleteAccount();
      setLocation("/");
    } catch {
      toast({ title: t("profile.delete_failed"), variant: "destructive" });
    }
  };

  const avatars = getAvatarsByGender(gender);

  return (
    <div className="h-full overflow-y-auto px-5 py-6 safe-bottom">
      <header className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => setLocation("/")}
          className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/5"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-display font-bold">{t("profile.title")}</h1>
      </header>

      <div className="glass-panel rounded-2xl p-4 mb-4 flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{user.displayName || user.username}</p>
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="flex items-center gap-1 text-xl font-display font-bold text-primary">
            <Zap className="w-4 h-4" />
            {credits}
          </p>
          {isPremium && <p className="text-[10px] text-secondary">{t("profile.premium_badge")}</p>}
        </div>
      </div>

      {/* Profil fotografi - odalarda ve sohbetlerde gorunur */}
      <section className="mb-5">
        <label className="text-xs uppercase tracking-wider text-muted-foreground">
          {t("profile.photo")}
        </label>
        <div className="flex items-center gap-4 mt-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="relative w-20 h-20 rounded-full overflow-hidden glass-panel flex items-center justify-center flex-shrink-0 disabled:opacity-50"
            data-testid="profile-photo-button"
          >
            {photo ? (
              <img src={photo} alt="" className="w-full h-full object-cover" />
            ) : (
              <Camera className="w-6 h-6 text-muted-foreground" />
            )}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="px-3 py-1.5 rounded-full text-xs glass-panel disabled:opacity-50"
              >
                {t("profile.photo.upload")}
              </button>
              {photo && (
                <button
                  type="button"
                  onClick={removePhoto}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-full text-xs glass-panel disabled:opacity-50 flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  {t("profile.photo.remove")}
                </button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
              {t("profile.photo.hint")}
            </p>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => pickPhoto(e.target.files?.[0])}
          data-testid="profile-photo-input"
        />
      </section>

      <section className="space-y-2 mb-5">
        <label className="text-xs uppercase tracking-wider text-muted-foreground">
          {t("profile.display_name")}
        </label>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            className="flex-1 px-4 py-2.5 rounded-xl bg-input/60 border border-border text-sm focus:outline-none focus:border-primary/60"
          />
          <NeonButton isLoading={busy} onClick={saveName}>
            {t("profile.save")}
          </NeonButton>
        </div>
      </section>

      {/* Arkadasini getir */}
      {referral && (
        <section className="mb-5">
          <label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Gift className="w-3.5 h-3.5" />
            {t("referral.title")}
          </label>

          <div className="glass-panel rounded-2xl p-4 mt-2">
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">
              {t("referral.hint")}
            </p>

            <button
              type="button"
              onClick={copyCode}
              className="w-full rounded-xl px-4 py-3 flex items-center justify-between mb-2"
              style={{
                background: "rgba(255,63,164,0.1)",
                border: "1.5px solid rgba(255,63,164,0.5)",
              }}
              data-testid="referral-code"
            >
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {t("referral.code")}
              </span>
              <span className="flex items-center gap-2 font-mono text-lg font-bold tracking-[0.2em] text-primary">
                {referral.code}
                {codeCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </span>
            </button>

            <button
              type="button"
              onClick={shareCode}
              className="w-full glass-panel rounded-xl py-2.5 text-sm"
              data-testid="referral-share"
            >
              {t("referral.share")}
            </button>

            <p className="text-[11px] text-muted-foreground/70 mt-3 text-center">
              {referral.remaining > 0
                ? `${referral.used} ${t("referral.used")} · ${referral.remaining} ${t("referral.remaining")}`
                : t("referral.exhausted")}
            </p>
          </div>
        </section>
      )}

      <section className="space-y-2 mb-5">
        <label className="text-xs uppercase tracking-wider text-muted-foreground">
          {t("profile.character_gender")}
        </label>
        <div className="flex gap-2">
          {(["female", "male"] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => changeGender(g)}
              className={cn(
                "flex-1 py-2.5 rounded-xl border text-sm transition-colors",
                gender === g
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border text-muted-foreground",
              )}
            >
              {t(g === "female" ? "profile.gender.female" : "profile.gender.male")}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3 mb-6">
        <label className="text-xs uppercase tracking-wider text-muted-foreground">
          {t("profile.avatars")}
        </label>
        {([1, 2, 3] as Personality[]).map((level) => (
          <div key={level}>
            <p className="text-[11px] text-muted-foreground mb-1.5">
              {level === 1 ? "Angel" : level === 2 ? "Bestie" : "Snake"}
            </p>
            <div className="flex gap-2">
              {avatars[level].map((avatar) => (
                <button
                  key={avatar.id}
                  type="button"
                  onClick={() => setAvatar(level, avatar.id)}
                  className={cn(
                    "w-16 h-16 rounded-xl overflow-hidden ring-2 transition-all",
                    selected[level] === avatar.id
                      ? "ring-primary scale-105"
                      : "ring-white/10 opacity-70",
                  )}
                >
                  <img src={avatar.image} alt={avatar.nameTr} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <div className="space-y-2 pb-6">
        <NeonButton variant="outline" fullWidth onClick={() => logout().then(() => setLocation("/"))}>
          <LogOut className="w-4 h-4" />
          {t("profile.logout")}
        </NeonButton>
        <button
          type="button"
          onClick={removeAccount}
          className="w-full flex items-center justify-center gap-2 py-2.5 text-xs text-destructive/80 hover:text-destructive"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {t("profile.delete_account")}
        </button>
      </div>
    </div>
  );
}
