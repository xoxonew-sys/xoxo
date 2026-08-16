import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { queryClient } from "@/lib/queryClient";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from "@/contexts/AuthContext";
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
const AdminLogin = lazy(() => import("@/pages/AdminLogin"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));

function Loading() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
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
                <div className="h-full flex flex-col">
                  <Suspense fallback={<Loading />}>
                    <Switch>
                      <Route path="/" component={Home} />
                      <Route path="/judgment" component={Judgment} />
                      <Route path="/chat/:level" component={Chat} />
                      <Route path="/login" component={Login} />
                      <Route path="/profile" component={Profile} />
                      <Route path="/pricing" component={Pricing} />
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
