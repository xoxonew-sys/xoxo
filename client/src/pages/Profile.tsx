import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, LogOut, Trash2, Zap } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits } from "@/contexts/CreditContext";
import { useAvatar, getAvatarsByGender, type Personality } from "@/contexts/AvatarContext";
import { useToast } from "@/hooks/use-toast";
import { NeonButton } from "@/components/NeonButton";
import { cn } from "@/lib/utils";

export default function Profile() {
  const [, setLocation] = useLocation();
  const { user, isLoading, logout, updateDisplayName, updateGender, deleteAccount } = useAuth();
  const { credits, isPremium } = useCredits();
  const { gender, setGender, selected, setAvatar } = useAvatar();
  const { toast } = useToast();

  const [name, setName] = useState(user?.displayName ?? "");
  const [busy, setBusy] = useState(false);

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
      toast({ title: "Kaydedildi", variant: "success" });
    } catch {
      toast({ title: "Kaydedilemedi", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const changeGender = async (next: "male" | "female") => {
    setGender(next);
    try {
      await updateGender(next);
    } catch {
      toast({ title: "Sunucuya yazılamadı", variant: "destructive" });
    }
  };

  const removeAccount = async () => {
    if (!window.confirm("Hesabın ve tüm sohbetlerin kalıcı olarak silinecek. Emin misin?")) return;
    try {
      await deleteAccount();
      setLocation("/");
    } catch {
      toast({ title: "Silinemedi", variant: "destructive" });
    }
  };

  const avatars = getAvatarsByGender(gender);

  return (
    <div className="h-full overflow-y-auto px-5 py-6 safe-top safe-bottom">
      <header className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => setLocation("/")}
          className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/5"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-display font-bold">Profil</h1>
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
          {isPremium && <p className="text-[10px] text-secondary">premium</p>}
        </div>
      </div>

      <section className="space-y-2 mb-5">
        <label className="text-xs uppercase tracking-wider text-muted-foreground">
          Görünen ad
        </label>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            className="flex-1 px-4 py-2.5 rounded-xl bg-input/60 border border-border text-sm focus:outline-none focus:border-primary/60"
          />
          <NeonButton isLoading={busy} onClick={saveName}>
            Kaydet
          </NeonButton>
        </div>
      </section>

      <section className="space-y-2 mb-5">
        <label className="text-xs uppercase tracking-wider text-muted-foreground">
          Karakter cinsiyeti
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
              {g === "female" ? "Kadın" : "Erkek"}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3 mb-6">
        <label className="text-xs uppercase tracking-wider text-muted-foreground">
          Avatarlar
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
          Çıkış yap
        </NeonButton>
        <button
          type="button"
          onClick={removeAccount}
          className="w-full flex items-center justify-center gap-2 py-2.5 text-xs text-destructive/80 hover:text-destructive"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Hesabımı sil
        </button>
      </div>
    </div>
  );
}
