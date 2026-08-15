import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Users, DollarSign, Zap, LogOut, Search, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface AdminUser {
  id: number;
  username: string;
  email: string;
  displayName: string | null;
  credits: number;
  isPremium: boolean;
  isGodMode: boolean;
  emailVerified: boolean;
  lastChar: number | null;
  lastEmailSuccess: boolean | null;
  createdAt: string;
}

const CHARACTER_NAMES: Record<number, string> = { 1: "Angel", 2: "Bestie", 3: "Snake" };

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="glass-panel rounded-2xl p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
        <Icon className="w-4 h-4" />
        <span className="text-[11px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-display font-bold">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [revenue, setRevenue] = useState<any>(null);
  const [creditStats, setCreditStats] = useState<any>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, revenueRes, creditsRes] = await Promise.all([
        fetch("/api/admin/users", { credentials: "include" }),
        fetch("/api/admin/revenue", { credentials: "include" }),
        fetch("/api/admin/credit-stats", { credentials: "include" }),
      ]);

      // Oturum düşmüşse giriş ekranına dön
      if (usersRes.status === 401 || usersRes.status === 403) {
        setLocation("/admin/login");
        return;
      }

      setUsers((await usersRes.json()).users ?? []);
      setRevenue(await revenueRes.json());
      setCreditStats(await creditsRes.json());
    } catch (err) {
      toast({
        title: "Veriler alınamadı",
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [setLocation, toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const adjustCredits = async (userId: number, delta: number) => {
    const target = users.find((u) => u.id === userId);
    if (!target) return;
    const next = Math.max(0, target.credits + delta);
    try {
      await apiRequest("PATCH", `/api/admin/users/${userId}`, { credits: next });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, credits: next } : u)));
    } catch (err) {
      toast({ title: "Güncellenemedi", variant: "destructive" });
    }
  };

  const togglePremium = async (userId: number, current: boolean) => {
    try {
      await apiRequest("PATCH", `/api/admin/users/${userId}`, { isPremium: !current });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, isPremium: !current } : u)),
      );
    } catch {
      toast({ title: "Güncellenemedi", variant: "destructive" });
    }
  };

  const logout = async () => {
    await apiRequest("POST", "/api/admin/logout").catch(() => undefined);
    setLocation("/admin/login");
  };

  const filtered = users.filter((u) => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    return (
      u.email.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      (u.displayName ?? "").toLowerCase().includes(q)
    );
  });

  const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <div className="h-full overflow-y-auto px-4 py-5 safe-top safe-bottom">
      <header className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-display font-bold">Yönetim paneli</h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={loadAll}
            className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/5"
            aria-label="Yenile"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
          <button
            type="button"
            onClick={logout}
            className="p-2 rounded-full text-muted-foreground hover:text-destructive hover:bg-white/5"
            aria-label="Çıkış"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <StatCard icon={Users} label="Kullanıcı" value={String(users.length)} />
        <StatCard
          icon={DollarSign}
          label="Gelir"
          value={revenue ? money(revenue.totalRevenue ?? 0) : "—"}
          hint={revenue ? `${revenue.completedCount ?? 0} ödeme` : undefined}
        />
        <StatCard
          icon={Zap}
          label="Aktif kredi"
          value={creditStats ? String(creditStats.activeCredits ?? 0) : "—"}
        />
        <StatCard
          icon={Zap}
          label="Harcanan"
          value={creditStats ? String(creditStats.totalUsed ?? 0) : "—"}
          hint={
            creditStats?.creditUsageRate != null
              ? `%${Number(creditStats.creditUsageRate).toFixed(0)} kullanım`
              : undefined
          }
        />
      </div>

      <div className="relative mb-3">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="E-posta veya kullanıcı adı ara"
          className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-input/60 border border-border text-sm focus:outline-none focus:border-primary/60"
        />
      </div>

      <div className="space-y-2 pb-6">
        {filtered.map((user, index) => (
          <motion.div
            key={user.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index * 0.02, 0.3) }}
            className="glass-panel rounded-2xl p-3.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {user.displayName || user.username}
                </p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  {!user.emailVerified && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/20 text-destructive">
                      doğrulanmadı
                    </span>
                  )}
                  {user.isPremium && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/20 text-secondary">
                      premium
                    </span>
                  )}
                  {user.isGodMode && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent">
                      god
                    </span>
                  )}
                  {user.lastChar && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">
                      {CHARACTER_NAMES[user.lastChar]}
                    </span>
                  )}
                  {user.lastEmailSuccess === false && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/20 text-destructive">
                      e-posta gitmedi
                    </span>
                  )}
                </div>
              </div>

              <div className="text-right flex-shrink-0">
                <p className="text-lg font-display font-bold text-primary">{user.credits}</p>
                <p className="text-[10px] text-muted-foreground">kredi</p>
              </div>
            </div>

            <div className="flex gap-1.5 mt-3">
              {[10, 50, 100].map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => adjustCredits(user.id, amount)}
                  className="flex-1 py-1.5 rounded-lg border border-white/10 text-[11px] hover:border-primary/50 hover:bg-primary/10 transition-colors"
                >
                  +{amount}
                </button>
              ))}
              <button
                type="button"
                onClick={() => togglePremium(user.id, user.isPremium)}
                className={cn(
                  "flex-1 py-1.5 rounded-lg border text-[11px] transition-colors",
                  user.isPremium
                    ? "border-secondary/50 text-secondary"
                    : "border-white/10 hover:border-secondary/50",
                )}
              >
                {user.isPremium ? "Premium ✓" : "Premium"}
              </button>
            </div>
          </motion.div>
        ))}

        {!loading && filtered.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">
            Kayıt bulunamadı.
          </p>
        )}
      </div>
    </div>
  );
}
