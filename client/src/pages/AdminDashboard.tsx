import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  RefreshCw, LogOut, Users, CreditCard, Ban, Bell, BarChart3,
  Search, X, Zap, Crown, Shield, Mail, Flag, Power, AlertTriangle,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

/* ============================================================
   Yönetim paneli

   Sunucudaki admin uçlarının tamamını kullanır. Uçlar
   server/routes.ts içinde requireAdmin ile korunuyor; bu dosya
   yalnızca arayüz — yetki kontrolü burada YAPILMAZ.

   Sekmeler: Kullanıcılar / Ödemeler / Banlar / Bildirimler / Analitik
   Kullanıcı satırına tıklayınca detay paneli açılır.
   ============================================================ */

type Tab = "users" | "payments" | "reports" | "bans" | "notifications" | "analytics";

interface AdminUser {
  id: number;
  username: string;
  email: string;
  displayName: string | null;
  gender: string;
  credits: number;
  isPremium: boolean;
  premiumUntil: string | null;
  isGodMode: boolean;
  isAdmin: boolean;
  isBanned?: boolean;
  createdAt: string;
  lastChar?: number | null;
  lastEmailSuccess?: boolean | null;
  lastEmailAt?: string | null;
  lastEmailType?: string | null;
}

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: "users", label: "Kullanıcılar", icon: Users },
  { id: "payments", label: "Ödemeler", icon: CreditCard },
  { id: "reports", label: "Şikayetler", icon: Flag },
  { id: "bans", label: "Banlar", icon: Ban },
  { id: "notifications", label: "Bildirimler", icon: Bell },
  { id: "analytics", label: "Analitik", icon: BarChart3 },
];

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>("users");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [revenue, setRevenue] = useState<any>(null);
  const [creditStats, setCreditStats] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [bans, setBans] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [costs, setCosts] = useState<any>(null);

  const [query, setQuery] = useState("");
  const [openUser, setOpenUser] = useState<AdminUser | null>(null);

  const notify = (text: string, error = false) => {
    setToast({ text, error });
    setTimeout(() => setToast(null), 4000);
  };

  const getJson = async (url: string) => {
    const res = await fetch(url, { credentials: "include" });
    if (res.status === 401) {
      setLocation("/admin/login");
      throw new Error("oturum yok");
    }
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [u, r, c] = await Promise.all([
        getJson("/api/admin/users"),
        getJson("/api/admin/revenue"),
        getJson("/api/admin/credit-stats"),
      ]);
      setUsers(u.users ?? []);
      setRevenue(r);
      setCreditStats(c);
    } catch {
      /* getJson 401'de yönlendirdi */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  /* Sekme verisi ilk açılışta yüklenir, tekrar tekrar çekilmez */
  useEffect(() => {
    const load = async () => {
      try {
        if (tab === "payments" && payments.length === 0) {
          setPayments((await getJson("/api/admin/payments")).payments ?? []);
        } else if (tab === "reports" && reports.length === 0) {
          setReports((await getJson("/api/admin/reports")).reports ?? []);
        } else if (tab === "bans" && bans.length === 0) {
          setBans(await getJson("/api/admin/bans"));
        } else if (tab === "notifications" && notifications.length === 0) {
          setNotifications(await getJson("/api/admin/notifications"));
        } else if (tab === "analytics" && !analytics) {
          const [a, c] = await Promise.all([
            getJson("/api/admin/analytics"),
            getJson("/api/admin/costs"),
          ]);
          setAnalytics(a);
          setCosts(c);
        }
      } catch {
        /* yoksay */
      }
    };
    load();
  }, [tab]);

  const patchUser = async (userId: number, body: Record<string, unknown>, label: string) => {
    setBusy(`${userId}-${label}`);
    try {
      await apiRequest("PATCH", `/api/admin/users/${userId}`, body);
      const u = await getJson("/api/admin/users");
      setUsers(u.users ?? []);
      const fresh = (u.users ?? []).find((x: AdminUser) => x.id === userId);
      if (fresh && openUser?.id === userId) setOpenUser(fresh);
      notify(`${label} güncellendi`);
    } catch (err: any) {
      notify(err?.message || `${label} güncellenemedi`, true);
    } finally {
      setBusy(null);
    }
  };

  const sendReset = async (user: AdminUser) => {
    setBusy(`${user.id}-reset`);
    try {
      const res = await apiRequest(
        "POST",
        `/api/admin/users/${user.id}/send-password-reset`,
        {},
      );
      const data = await res.json();
      notify(data.message ?? "Sıfırlama kodu gönderildi");
    } catch (err: any) {
      notify(err?.message || "Mail gönderilemedi", true);
    } finally {
      setBusy(null);
    }
  };


  /** Sikayeti kapat / yeniden ac */
  const setReportStatus = async (id: number, status: "open" | "resolved") => {
    setBusy(`report-${id}`);
    try {
      await apiRequest("PATCH", `/api/admin/reports/${id}`, { status });
      setReports((prev) =>
        prev.map((r: any) => (r.id === id ? { ...r, status } : r)),
      );
      notify(status === "resolved" ? "Şikayet kapatıldı" : "Şikayet yeniden açıldı");
    } catch (err: any) {
      notify(err?.message || "Güncellenemedi", true);
    } finally {
      setBusy(null);
    }
  };

  /**
   * Sikayet satirindan dogrudan yasaklama.
   * Onay penceresi SART: tek tikla kalici ban yanlislikla basilabilir.
   */
  const banFromReport = async (report: any, days: number | null) => {
    if (!report.reportedEmail) {
      notify("Bu kayıtta e-posta yok, Kullanıcılar sekmesinden yasaklayın", true);
      return;
    }
    const label = days === null ? "kalıcı olarak" : `${days} gün`;
    if (!window.confirm(`${report.reportedEmail} ${label} yasaklansın mı?`)) return;

    setBusy(`report-${report.id}`);
    try {
      await apiRequest("POST", "/api/admin/bans", {
        email: report.reportedEmail,
        banType: days === null ? "permanent" : "temporary",
        durationDays: days ?? undefined,
        reason: `X-Room şikayeti #${report.id}`,
      });
      await setReportStatus(report.id, "resolved");
      setBans([]); // Banlar sekmesi bir sonraki acilista yenilensin
      notify("Yasaklandı ve şikayet kapatıldı");
    } catch (err: any) {
      notify(err?.message || "Yasaklanamadı", true);
    } finally {
      setBusy(null);
    }
  };

  /** Bani silmeden ac/kapa - gecmis kayit kalsin diye */
  const toggleBan = async (ban: any) => {
    setBusy(`ban-${ban.id}`);
    try {
      await apiRequest("PATCH", `/api/admin/bans/${ban.id}`, { isActive: !ban.isActive });
      setBans((prev) =>
        prev.map((b: any) => (b.id === ban.id ? { ...b, isActive: !b.isActive } : b)),
      );
      notify(ban.isActive ? "Yasaklama kapatıldı" : "Yasaklama açıldı");
    } catch (err: any) {
      notify(err?.message || "Güncellenemedi", true);
    } finally {
      setBusy(null);
    }
  };

  /** Kullanici detayindan sureli/kalici yasaklama */
  const banUser = async (u: AdminUser, days: number | null) => {
    const label = days === null ? "kalıcı olarak" : `${days} gün`;
    if (!window.confirm(`${u.email} ${label} yasaklansın mı?`)) return;
    setBusy(`${u.id}-ban`);
    try {
      await apiRequest("POST", "/api/admin/bans", {
        email: u.email,
        banType: days === null ? "permanent" : "temporary",
        durationDays: days ?? undefined,
        reason: "Yönetici kararı",
      });
      await patchUser(u.id, { isBanned: true }, "Yasak");
      setBans([]);
      notify(`Yasaklandı (${label})`);
    } catch (err: any) {
      notify(err?.message || "Yasaklanamadı", true);
    } finally {
      setBusy(null);
    }
  };

  const logout = async () => {
    await apiRequest("POST", "/api/admin/logout").catch(() => undefined);
    setLocation("/admin/login");
  };

  const filtered = users.filter((u) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      (u.displayName ?? "").toLowerCase().includes(q)
    );
  });

  const money = (n: number | undefined) =>
    typeof n === "number" ? `₺${n.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}` : "—";

  const date = (s: string | null | undefined) =>
    s ? new Date(s).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

  return (
    <div className="min-h-full flex flex-col px-4 py-4 safe-top safe-bottom">
      <header className="flex items-center justify-between mb-4 flex-shrink-0">
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
            className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/5"
            aria-label="Çıkış"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Özet kartları */}
      <div className="grid grid-cols-2 gap-3 mb-4 flex-shrink-0">
        <Stat label="KULLANICI" value={users.length} icon={Users} />
        <Stat
          label="GELİR"
          value={money(revenue?.totalRevenue)}
          sub={`${revenue?.paymentCount ?? 0} ödeme`}
          icon={CreditCard}
        />
        <Stat label="AKTİF KREDİ" value={creditStats?.totalCredits ?? 0} icon={Zap} />
        <Stat
          label="HARCANAN"
          value={creditStats?.usedCredits ?? 0}
          sub={`%${creditStats?.usagePercent ?? 0} kullanım`}
          icon={Zap}
        />
      </div>

      {/* Sekmeler */}
      <nav className="flex gap-1 mb-4 overflow-x-auto flex-shrink-0 pb-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors",
              tab === id
                ? "bg-primary/20 text-primary ring-1 ring-primary/40"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5",
            )}
            data-testid={`admin-tab-${id}`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </nav>

      {/* ---------- KULLANICILAR ---------- */}
      {tab === "users" && (
        <div className="flex-1 min-h-0">
          <div className="relative mb-3">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="E-posta veya kullanıcı adı ara"
              className="w-full glass-panel rounded-2xl pl-10 pr-4 py-3 text-sm bg-transparent outline-none"
              data-testid="admin-user-search"
            />
          </div>

          {filtered.length === 0 ? (
            <Empty text={loading ? "Yükleniyor…" : "Kayıt bulunamadı."} />
          ) : (
            <div className="space-y-2">
              {filtered.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setOpenUser(u)}
                  className="w-full glass-panel rounded-2xl p-3 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
                  data-testid={`admin-user-${u.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium truncate">{u.email}</span>
                      {u.isGodMode && <Shield className="w-3.5 h-3.5 text-accent flex-shrink-0" />}
                      {u.isPremium && <Crown className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                      {u.isBanned && <Ban className="w-3.5 h-3.5 text-destructive flex-shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {u.username} · {u.gender === "male" ? "erkek" : "kadın"} · {date(u.createdAt)}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-primary">{u.credits}</p>
                    <p className="text-[10px] text-muted-foreground">kredi</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------- ÖDEMELER ---------- */}
      {tab === "payments" && (
        <div className="flex-1 min-h-0 space-y-2">
          {payments.length === 0 ? (
            <Empty text="Ödeme kaydı yok." />
          ) : (
            payments.map((p: any) => (
              <div key={p.id} className="glass-panel rounded-2xl p-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{p.userEmail ?? p.email ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.itemName ?? p.productName ?? "—"} · {date(p.createdAt)}
                  </p>
                </div>
                <span className="text-sm font-bold text-primary flex-shrink-0">
                  {money(Number(p.amount))}
                </span>
              </div>
            ))
          )}
        </div>
      )}


      {/* ---------- ŞİKAYETLER ---------- */}
      {tab === "reports" && (
        <div className="flex-1 min-h-0 space-y-2">
          {reports.length === 0 ? (
            <Empty text="Şikayet yok." />
          ) : (
            [...reports]
              .sort((a: any, b: any) =>
                a.status === b.status ? 0 : a.status === "open" ? -1 : 1,
              )
              .map((r: any) => {
                const open = r.status === "open";
                return (
                  <div
                    key={r.id}
                    className={cn(
                      "glass-panel rounded-2xl p-3 ring-1",
                      open ? "ring-destructive/40" : "ring-white/5 opacity-60",
                    )}
                    data-testid={`admin-report-${r.id}`}
                  >
                    <div className="flex items-start gap-2 mb-2">
                      {open && (
                        <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">
                          <span className="text-muted-foreground">Oda</span>{" "}
                          <span className="font-mono">{r.roomCode}</span>
                          {" · "}
                          <span className="text-muted-foreground">Bildiren</span>{" "}
                          {r.reporterEmail}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {r.reportedNickname || "—"}
                          {r.reportedEmail ? ` (${r.reportedEmail})` : " (e-posta yok)"}
                          {" · "}
                          {date(r.createdAt)}
                        </p>
                      </div>
                      {!open && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-muted-foreground flex-shrink-0">
                          kapalı
                        </span>
                      )}
                    </div>

                    {r.messageText && (
                      <p className="text-sm bg-black/30 rounded-xl px-3 py-2 mb-2 leading-relaxed">
                        {r.messageText}
                      </p>
                    )}
                    {r.reason && (
                      <p className="text-xs text-muted-foreground mb-2">
                        Sebep: {r.reason}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {open ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setReportStatus(r.id, "resolved")}
                            disabled={busy === `report-${r.id}`}
                            className="px-3 py-1.5 rounded-full text-xs glass-panel hover:text-primary"
                          >
                            İşlem yapıldı
                          </button>
                          <button
                            type="button"
                            onClick={() => banFromReport(r, 1)}
                            disabled={busy === `report-${r.id}`}
                            className="px-3 py-1.5 rounded-full text-xs glass-panel hover:text-destructive"
                          >
                            1 gün ban
                          </button>
                          <button
                            type="button"
                            onClick={() => banFromReport(r, 7)}
                            disabled={busy === `report-${r.id}`}
                            className="px-3 py-1.5 rounded-full text-xs glass-panel hover:text-destructive"
                          >
                            1 hafta ban
                          </button>
                          <button
                            type="button"
                            onClick={() => banFromReport(r, null)}
                            disabled={busy === `report-${r.id}`}
                            className="px-3 py-1.5 rounded-full text-xs glass-panel hover:text-destructive"
                          >
                            Kalıcı ban
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setReportStatus(r.id, "open")}
                          disabled={busy === `report-${r.id}`}
                          className="px-3 py-1.5 rounded-full text-xs glass-panel"
                        >
                          Yeniden aç
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
          )}
        </div>
      )}

      {/* ---------- BANLAR ---------- */}
      {tab === "bans" && (
        <div className="flex-1 min-h-0 space-y-2">
          {bans.length === 0 ? (
            <Empty text="Aktif yasaklama yok." />
          ) : (
            bans.map((b: any) => (
              <div key={b.id} className="glass-panel rounded-2xl p-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{b.email ?? b.ipAddress}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {b.banType} · {b.reason || "sebep yok"} ·{" "}
                    {b.expiresAt ? `${date(b.expiresAt)} sonuna kadar` : "süresiz"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleBan(b)}
                  disabled={busy === `ban-${b.id}`}
                  className={cn(
                    "p-2 rounded-full flex-shrink-0",
                    b.isActive
                      ? "text-destructive hover:text-destructive/70"
                      : "text-muted-foreground/40 hover:text-muted-foreground",
                  )}
                  aria-label={b.isActive ? "Yasaklamayı kapat" : "Yasaklamayı aç"}
                  data-testid={`admin-ban-toggle-${b.id}`}
                >
                  <Power className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* ---------- BİLDİRİMLER ---------- */}
      {tab === "notifications" && (
        <div className="flex-1 min-h-0 space-y-2">
          {notifications.length === 0 ? (
            <Empty text="Bildirim yok." />
          ) : (
            notifications.map((n: any) => (
              <div key={n.id} className="glass-panel rounded-2xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">{n.title}</span>
                  {n.isActive && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                      aktif
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{n.message}</p>
              </div>
            ))
          )}
        </div>
      )}

      {/* ---------- ANALİTİK ---------- */}
      {tab === "analytics" && (
        <div className="flex-1 min-h-0 space-y-4">
          <Section title="Karakter kullanımı">
            {(analytics?.modeStats ?? []).length === 0 ? (
              <Empty text="Veri yok." />
            ) : (
              analytics.modeStats.map((m: any, i: number) => (
                <Row key={i} left={`Karakter ${m.judgmentLevel ?? m.mode ?? "—"}`} right={m.count} />
              ))
            )}
          </Section>

          <Section title="En aktif kullanıcılar">
            {(analytics?.topUsers ?? []).length === 0 ? (
              <Empty text="Veri yok." />
            ) : (
              analytics.topUsers.map((u: any, i: number) => (
                <Row key={i} left={u.email ?? u.userId} right={u.count} />
              ))
            )}
          </Section>

          <Section title="API maliyeti">
            {(costs?.costs ?? []).length === 0 ? (
              <Empty text="Veri yok." />
            ) : (
              costs.costs.map((c: any, i: number) => (
                <Row key={i} left={c.service} right={`$${Number(c.estimatedCost ?? 0).toFixed(4)}`} />
              ))
            )}
          </Section>
        </div>
      )}

      {/* ---------- KULLANICI DETAY PANELİ ---------- */}
      {openUser && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setOpenUser(null)}
        >
          <div
            className="glass-panel rounded-3xl p-5 w-full max-w-md max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="min-w-0">
                <h2 className="text-lg font-display font-bold truncate">{openUser.email}</h2>
                <p className="text-xs text-muted-foreground">
                  #{openUser.id} · {openUser.username} · kayıt {date(openUser.createdAt)}
                </p>
                {openUser.lastEmailAt && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    son mail: {openUser.lastEmailType} ·{" "}
                    {openUser.lastEmailSuccess ? "başarılı" : "başarısız"} ·{" "}
                    {date(openUser.lastEmailAt)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpenUser(null)}
                className="p-1.5 rounded-full text-muted-foreground hover:text-foreground flex-shrink-0"
                aria-label="Kapat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Kredi */}
            <div className="mb-4">
              <p className="text-xs text-muted-foreground mb-2">
                Kredi: <span className="text-primary font-bold">{openUser.credits}</span>
              </p>
              <div className="flex gap-2 flex-wrap">
                {[100, 500, 1000, -100].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => patchUser(openUser.id, { creditDelta: d }, "Kredi")}
                    disabled={busy === `${openUser.id}-Kredi`}
                    className="px-3 py-1.5 rounded-full text-xs glass-panel hover:text-primary"
                  >
                    {d > 0 ? `+${d}` : d}
                  </button>
                ))}
              </div>
            </div>

            {/* Anahtarlar */}
            <div className="space-y-2 mb-4">
              <Toggle
                label="Premium"
                hint={openUser.premiumUntil ? `${date(openUser.premiumUntil)} sonuna kadar` : undefined}
                on={openUser.isPremium}
                busy={busy === `${openUser.id}-Premium`}
                onChange={() => patchUser(openUser.id, { isPremium: !openUser.isPremium }, "Premium")}
              />
              <Toggle
                label="God Mode"
                hint="sınırsız kullanım, kredi düşmez"
                on={openUser.isGodMode}
                busy={busy === `${openUser.id}-God Mode`}
                onChange={() => patchUser(openUser.id, { isGodMode: !openUser.isGodMode }, "God Mode")}
              />
              <Toggle
                label="Admin"
                on={openUser.isAdmin}
                busy={busy === `${openUser.id}-Admin`}
                onChange={() => patchUser(openUser.id, { isAdmin: !openUser.isAdmin }, "Admin")}
              />
            </div>

            {/* Yasaklama - sure secenekli.
                Anahtar yerine dugmeler: "1 gun mu kalici mi" karari
                tek bir ac/kapa ile ifade edilemiyor. */}
            <div className="mb-4">
              <p className="text-xs text-muted-foreground mb-2">
                Yasaklama
                {openUser.isBanned && (
                  <span className="text-destructive"> — şu an yasaklı</span>
                )}
              </p>
              <div className="flex gap-2 flex-wrap">
                {openUser.isBanned ? (
                  <button
                    type="button"
                    onClick={() => patchUser(openUser.id, { isBanned: false }, "Yasak")}
                    disabled={busy === `${openUser.id}-Yasak`}
                    className="px-3 py-1.5 rounded-full text-xs glass-panel hover:text-primary"
                    data-testid="admin-unban"
                  >
                    Yasağı kaldır
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => banUser(openUser, 1)}
                      disabled={busy === `${openUser.id}-ban`}
                      className="px-3 py-1.5 rounded-full text-xs glass-panel hover:text-destructive"
                    >
                      1 gün
                    </button>
                    <button
                      type="button"
                      onClick={() => banUser(openUser, 7)}
                      disabled={busy === `${openUser.id}-ban`}
                      className="px-3 py-1.5 rounded-full text-xs glass-panel hover:text-destructive"
                    >
                      1 hafta
                    </button>
                    <button
                      type="button"
                      onClick={() => banUser(openUser, null)}
                      disabled={busy === `${openUser.id}-ban`}
                      className="px-3 py-1.5 rounded-full text-xs glass-panel hover:text-destructive"
                    >
                      Kalıcı
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Şifre */}
            <button
              type="button"
              onClick={() => sendReset(openUser)}
              disabled={busy === `${openUser.id}-reset`}
              className="w-full glass-panel rounded-2xl py-3 flex items-center justify-center gap-2 text-sm hover:text-primary disabled:opacity-50"
              data-testid="admin-send-reset"
            >
              <Mail className="w-4 h-4" />
              {busy === `${openUser.id}-reset` ? "Gönderiliyor…" : "Şifre sıfırlama maili gönder"}
            </button>
            <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
              Kullanıcıya doğrulama kodu gider, yeni şifreyi kendisi belirler.
              Şifre üretilmez ve mail ile gönderilmez.
            </p>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={cn(
            "fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-full text-sm z-[60] glass-panel",
            toast.error ? "text-destructive" : "text-primary",
          )}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

/* ---------- küçük parçalar ---------- */

function Stat({
  label, value, sub, icon: Icon,
}: { label: string; value: any; sub?: string; icon: typeof Users }) {
  return (
    <div className="glass-panel rounded-2xl p-4">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-[10px] tracking-widest text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-display font-bold">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Toggle({
  label, hint, on, busy, danger, onChange,
}: {
  label: string; hint?: string; on: boolean; busy?: boolean;
  danger?: boolean; onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={busy}
      className="w-full glass-panel rounded-2xl px-4 py-3 flex items-center justify-between disabled:opacity-50"
    >
      <span className="text-left">
        <span className="text-sm block">{label}</span>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </span>
      <span
        className={cn(
          "w-10 h-6 rounded-full flex items-center px-0.5 transition-colors flex-shrink-0",
          on ? (danger ? "bg-destructive" : "bg-primary") : "bg-white/10",
        )}
      >
        <span
          className={cn(
            "w-5 h-5 rounded-full bg-white transition-transform",
            on && "translate-x-4",
          )}
        />
      </span>
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs tracking-widest text-muted-foreground mb-2">{title}</h3>
      <div className="glass-panel rounded-2xl divide-y divide-white/5">{children}</div>
    </div>
  );
}

function Row({ left, right }: { left: any; right: any }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-sm truncate">{left}</span>
      <span className="text-sm font-medium text-primary flex-shrink-0">{right}</span>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-center text-sm text-muted-foreground py-10">{text}</p>;
}
