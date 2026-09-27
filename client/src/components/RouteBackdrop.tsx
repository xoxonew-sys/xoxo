import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Sayfa arka planlari - her karede bir kadin + bir erkek, zit karakter.
 *
 * 12 farkli cift var (client/public/backdrops/). Fon SABIT DEGIL:
 *   - Her sayfa gecisinde bir oncekinden farkli bir cift secilir.
 *   - Ayni sayfada kalinirsa 18 sn'de bir yumusakca bir sonrakine gecer.
 *     Karakter/mod secimi gibi adimlar URL degistirmedigi icin bu da
 *     "her ekranda baska yuzler" hissini veriyor.
 *   - Ayni cift arka arkaya gelmez; son 4 cift tekrar secilmez.
 *
 * GOSTERILMEYEN YERLER - bilerek:
 *   /          ana ekranin kendi Snake/Angel fonu var
 *   /chat/*    secilen karakterin kendi gorseli var; ikinci bir yuz
 *              sohbet balonlarini okunmaz yapar
 *   /admin*    yonetim paneli
 *
 * HAREKET: 26 sn'lik yavas yakinlasma + hafif kayma ("nefes alma"),
 * gecislerde 1,2 sn capraz solma. Hareket azaltma tercihi acik
 * cihazlarda yakinlasma ve otomatik degisim kapanir.
 *
 * Gorsel degisirse DOSYA ADINI degistir (Cloudflare eskisini onbellekten verir).
 */

const POOL = [
  "judgment", "login", "profile", "pricing", "xroom", "privacy",
  "pair-07", "pair-08", "pair-09", "pair-10", "pair-11", "pair-12",
].map((name) => "/backdrops/" + name + ".webp");

const ROTATE_MS = 18_000;
const NO_REPEAT_WINDOW = 4;
const HIDDEN_PREFIXES = ["/chat", "/admin"];

function isHidden(path: string): boolean {
  return path === "/" || HIDDEN_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function RouteBackdrop() {
  const [location] = useLocation();
  const hidden = isHidden(location);
  const [current, setCurrent] = useState<string>(() => POOL[Math.floor(Math.random() * POOL.length)]);
  const recentRef = useRef<string[]>([current]);

  const pickNext = () => {
    const recent = recentRef.current;
    const candidates = POOL.filter((src) => !recent.includes(src));
    const next = candidates[Math.floor(Math.random() * candidates.length)] ?? POOL[0];
    recentRef.current = [next, ...recent].slice(0, NO_REPEAT_WINDOW);
    // Bir sonrakini onceden indir ki gecis aninda bos kare olmasin
    const img = new Image();
    img.src = next;
    setCurrent(next);
  };

  // Her sayfa degisiminde yeni cift
  const firstRenderRef = useRef(true);
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    if (!isHidden(location)) pickNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  // Ayni sayfada kalindikca yavasca degis
  useEffect(() => {
    if (hidden || prefersReducedMotion()) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") pickNext();
    }, ROTATE_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden, location]);

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
        {!hidden && (
          <motion.div
            key={current}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: "easeInOut" }}
          >
            <img
              src={current}
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
