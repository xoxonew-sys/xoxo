import { lazy, Suspense, useEffect, useRef } from "react";
import { Route, Switch, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { queryClient } from "@/lib/queryClient";
import { LanguageProvider, useLanguage } from "@/contexts/LanguageContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { CreditProvider, useCredits } from "@/contexts/CreditContext";
import { AvatarProvider } from "@/contexts/AvatarContext";
import { VoiceModeProvider } from "@/contexts/VoiceModeContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Settings, Zap } from "lucide-react";

/* Sohbet ekranı ağır (ses + görsel yükleme) — ayrı parçaya alındı */
const Chat = lazy(() => import("@/pages/Chat"));
const Home = lazy(() => import("@/pages/Home"));
const Judgment = lazy(() => import("@/pages/Judgment"));
const XRoom = lazy(() => import("@/pages/XRoom"));
const PaymentSuccess = lazy(() => import("@/pages/PaymentSuccess"));
const Login = lazy(() => import("@/pages/Login"));
const Profile = lazy(() => import("@/pages/Profile"));
const Pricing = lazy(() => import("@/pages/Pricing"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const AdminLogin = lazy(() => import("@/pages/AdminLogin"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));

function Loading() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

/**
 * Misafir kullanim kaldirildi: uygulamanin icine yalnizca uye girer.
 *
 * Ana ekrandaki "Basla" dugmesini degistirmek TEK BASINA yeterli degil -
 * adres cubuguna /judgment yazan biri yine iceri girerdi. Korumanin
 * kendisi burada; dugme sadece dogru yere goturuyor.
 *
 * Bu istemci tarafi bir yonlendirme, guvenlik siniri degil. Gercek sinir
 * sunucudaki oturum kontrolu (bkz. server/routes.ts requireAuth).
 */
function Protected({ component: Component }: { component: React.ComponentType<any> }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) setLocation("/login");
  }, [isLoading, isAuthenticated, setLocation]);

  if (isLoading) return <Loading />;
  if (!isAuthenticated) return <Loading />;
  return <Component />;
}

/**
 * Ust cubuk - her sayfada gorunur: kredi, ayarlar, dil.
 *
 * SABIT DEGIL, AKISTA. Onceden "fixed top-3 right-3" idi ve sayfa
 * basliklarinin uzerine biniyordu ("Kiminle konusmak istersin?" yazisi
 * ikonlarin altinda kaliyordu). Dikey siralamak sorunu cozmez, sadece
 * tasir - bu sefer sohbet balonlarinin ustunu kapatir. Akista bir satir
 * olunca icerik her zaman altindan baslar ve hicbir yerde cakisma olmaz.
 */

/**
 * Bekleyen bildirim gostericisi.
 *
 * Davet eden kisi, davet ettigi kullanici dogrulama yaptiginda
 * cevrimici olmayabilir. Sunucu o an users.pending_notice alanina
 * yaziyor; burasi uygulama acilisinda bir kez okuyup temizliyor.
 *
 * Kredinin NEDEN arttigini soylemek onemli: sessizce artan bakiye
 * kullaniciya bir sey ifade etmiyor, davet etmeye de tesvik etmiyor.
 */
function PendingNotice() {
  const { isAuthenticated } = useAuth();
  const { refreshCredits } = useCredits();
  const { toast } = useToast();
  const shownRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || shownRef.current) return;
    shownRef.current = true;

    (async () => {
      try {
        const res = await fetch("/api/notice/consume", {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.notice) {
          toast({ title: data.notice, variant: "success" });
          refreshCredits?.();
        }
      } catch {
        /* bildirim gosterilemedi - uygulamanin geri kalani etkilenmez */
      }
    })();
  }, [isAuthenticated, refreshCredits, toast]);

  return null;
}

function TopBar() {
  const { language, setLanguage } = useLanguage();
  const { isAuthenticated } = useAuth();
  const { credits } = useCredits();
  const [, setLocation] = useLocation();

  /* Kirmizi neon cerceve - uc dugmede de ayni.
     Tek yerde tanimli: renk veya siddet degisecekse burasi. */
  const neon = {
    border: "1.5px solid #ff2d55",
    boxShadow: "0 0 8px #ff2d55, 0 0 20px rgba(255,45,85,0.55)",
    background: "rgba(10,5,16,0.75)",
  } as const;

  return (
    <div className="flex items-center justify-end gap-2.5 px-3 pt-3 pb-1.5 flex-shrink-0 safe-top">
      <button
        type="button"
        onClick={() => setLanguage(language === "tr" ? "en" : "tr")}
        className="px-4 py-2 rounded-full text-sm font-mono font-bold uppercase tracking-widest text-white backdrop-blur-xl transition-all duration-150 active:scale-95"
        style={neon}
        aria-label={language === "tr" ? "Switch to English" : "Türkçeye geç"}
        data-testid="language-toggle"
      >
        {language === "tr" ? "EN" : "TR"}
      </button>

      {/* Kalan kredi - her sayfada gorunur. Onceden yalnizca Home'daydi,
          sohbet sirasinda kullanici bakiyesini goremiyordu. */}
      {isAuthenticated && (
        <button
          type="button"
          onClick={() => setLocation("/pricing")}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold text-white backdrop-blur-xl transition-all duration-150 active:scale-95"
          style={neon}
          aria-label={language === "tr" ? "X-Kredi" : "Credits"}
          data-testid="credits-badge"
        >
          <Zap className="w-4 h-4 text-primary" />
          {credits}
        </button>
      )}

      {/* /profile zaten Protected; giris yapmamis kullaniciya
          gostermek onu login'e atmaktan baska ise yaramaz. */}
      {isAuthenticated && (
        <button
          type="button"
          onClick={() => setLocation("/profile")}
          className="p-2.5 rounded-full text-white backdrop-blur-xl transition-all duration-150 active:scale-95"
          style={neon}
          aria-label={language === "tr" ? "Ayarlar" : "Settings"}
          data-testid="settings-button"
        >
          <Settings className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

function NotFound() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-4xl font-display font-bold text-primary">404</h1>
      <p className="text-sm text-muted-foreground">Aradığın sayfa burada değil.</p>
      <a href="/" className="text-sm text-secondary underline underline-offset-4">
        Ana sayfaya dön
      </a>
    </div>
  );
}

/** Toast kuyruğunu ekrana basar — use-toast provider gerektirmiyor. */
function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <div className="fixed top-4 inset-x-0 z-[10000] flex flex-col items-center gap-2 px-4 pointer-events-none safe-top">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.96 }}
            onClick={() => dismiss(toast.id)}
            className={cn(
              "pointer-events-auto w-full max-w-sm rounded-2xl px-4 py-3 shadow-2xl cursor-pointer",
              "glass-panel-strong",
              toast.variant === "destructive" && "border-destructive/50",
              toast.variant === "success" && "border-secondary/50",
            )}
          >
            {toast.title && (
              <p className="text-sm font-display font-semibold">{toast.title}</p>
            )}
            {toast.description && (
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {toast.description}
              </p>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <AuthProvider>
          <CreditProvider>
            <AvatarProvider>
              <VoiceModeProvider>
                {/* Uygulama mobil oncelikli tasarlandi. Genislik siniri
                    olmadan masaustunde satirlar tum ekrana yayiliyor ve
                    saga hizali icerik (fiyat, kredi, sayac) ekranin
                    disinda kaliyordu. max-w-md mobil sutunu ortalar;
                    telefonda hicbir sey degismez. */}
                <div className="h-full w-full max-w-md mx-auto flex flex-col">
                  <TopBar />
                  <PendingNotice />
                  <Suspense fallback={<Loading />}>
                    <Switch>
                      <Route path="/" component={Home} />
                      <Route path="/xroom">
                        <Protected component={XRoom} />
                      </Route>
                      <Route path="/judgment">
                        <Protected component={Judgment} />
                      </Route>
                      <Route path="/chat/:level">
                        <Protected component={Chat} />
                      </Route>
                      <Route path="/login" component={Login} />
                      <Route path="/profile">
                        <Protected component={Profile} />
                      </Route>
                      <Route path="/pricing" component={Pricing} />
                      {/* Odeme donusu. Krediyi yukleyen verify-session'i
                          cagiran TEK yer burasi - webhook yok. Rota
                          eksikken odeme aliniyor ama kullanici 404
                          goruyor ve kredi hic yuklenmiyordu. */}
                      <Route path="/payment-success" component={PaymentSuccess} />
                      {/* Yasal metin. Iki yol ayni sayfayi acar:
                          /privacy magaza formlarinda, /kvkk yerel kullanimda. */}
                      <Route path="/privacy" component={Privacy} />
                      <Route path="/kvkk" component={Privacy} />
                      <Route path="/admin/login" component={AdminLogin} />
                      <Route path="/admin" component={AdminDashboard} />
                      <Route component={NotFound} />
                    </Switch>
                  </Suspense>
                </div>
                <Toaster />
              </VoiceModeProvider>
            </AvatarProvider>
          </CreditProvider>
        </AuthProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}
