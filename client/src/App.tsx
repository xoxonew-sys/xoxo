import { lazy, Suspense, useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { queryClient } from "@/lib/queryClient";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { CreditProvider } from "@/contexts/CreditContext";
import { AvatarProvider } from "@/contexts/AvatarContext";
import { VoiceModeProvider } from "@/contexts/VoiceModeContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/* Sohbet ekranı ağır (ses + görsel yükleme) — ayrı parçaya alındı */
const Chat = lazy(() => import("@/pages/Chat"));
const Home = lazy(() => import("@/pages/Home"));
const Judgment = lazy(() => import("@/pages/Judgment"));
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
                <div className="h-full flex flex-col">
                  <Suspense fallback={<Loading />}>
                    <Switch>
                      <Route path="/" component={Home} />
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
