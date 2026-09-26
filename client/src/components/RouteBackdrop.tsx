import { useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Sayfa arka planlari - her sayfada bir kadin + bir erkek, zit karakter.
 *
 * Ana ekrandaki Snake/Angel fonunun devami. Gorseller mevcut karakter
 * avatarlarindan birlestirildi (client/public/backdrops/), orta kisim
 * karartildi ki metin ve dugmeler okunur kalsin.
 *
 *   /judgment        Snake (K)   + Angel (E)
 *   /login           Bestie (E)  + Angel (K)
 *   /profile         Snake (E)   + Bestie (K)
 *   /pricing         Snake (K)   + Bestie (E)
 *   /xroom           Angel (E)   + Bestie (K)
 *   /privacy, /kvkk, /payment-success, 404   Angel (K) + Snake (E)
 *
 * GOSTERILMEYEN YERLER - bilerek:
 *   /          ana ekranin kendi fonu var
 *   /chat/*    secilen karakterin kendi gorseli var; ikinci bir yuz
 *              sohbet balonlarini okunmaz yapar
 *   /admin*    yonetim paneli
 *
 * HAREKET: 26 sn'lik yavas yakinlasma + hafif kayma ("nefes alma").
 * Sayfa degisince fonlar yumusakca birbirine gecer. Hareket azaltma
 * tercihi acik cihazlarda animasyon kapanir.
 *
 * Gorsel degisirse DOSYA ADINI degistir (Cloudflare eskisini onbellekten verir).
 */

const BACKDROPS: Array<[prefix: string, file: string]> = [
  ["/judgment", "judgment"],
  ["/login", "login"],
  ["/profile", "profile"],
  ["/pricing", "pricing"],
  ["/xroom", "xroom"],
  ["/privacy", "privacy"],
  ["/kvkk", "privacy"],
  ["/payment-success", "privacy"],
];

const HIDDEN_PREFIXES = ["/chat", "/admin"];

function backdropFor(path: string): string | null {
  if (path === "/") return null;
  if (HIDDEN_PREFIXES.some((prefix) => path.startsWith(prefix))) return null;
  const match = BACKDROPS.find(([prefix]) => path === prefix || path.startsWith(prefix + "/"));
  return "/backdrops/" + (match ? match[1] : "privacy") + ".webp";
}

export function RouteBackdrop() {
  const [location] = useLocation();
  const src = backdropFor(location);

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
      <style>{`
        @keyframes xoxo-breathe {
          0%   { transform: scale(1.04) translate3d(0, 0, 0); }
          50%  { transform: scale(1.12) translate3d(-1.2%, -1%, 0); }
          100% { transform: scale(1.04) translate3d(1%, 0.6%, 0); }
        }
        .xoxo-backdrop-img {
          animation: xoxo-breathe 26s ease-in-out infinite alternate;
          will-change: transform;
        }
        @media (prefers-reduced-motion: reduce) {
          .xoxo-backdrop-img { animation: none; transform: scale(1.04); }
        }
      `}</style>
      <AnimatePresence mode="sync">
        {src && (
          <motion.div
            key={src}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          >
            <img
              src={src}
              alt=""
              decoding="async"
              className="xoxo-backdrop-img absolute inset-0 w-full h-full object-cover"
            />
            {/* Okunabilirlik: ust ve alt kenarlar biraz daha koyu */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/60" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
