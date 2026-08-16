import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { pool } from "./db";
import { setupVite, serveStatic } from "./vite";

const app = express();
const httpServer = createServer(app);
const isProduction = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT) || 5000;

/* ------------------------------------------------------------
   Gövde ayrıştırma
   Görsel yükleme base64 olarak geldiği için limit yüksek tutuldu.
   Stripe webhook'u ham gövde ister — o yol JSON ayrıştırmadan muaf.
   ------------------------------------------------------------ */
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: false, limit: "12mb" }));

/* Railway proxy arkasında çalışır; secure cookie'ler için şart */
app.set("trust proxy", 1);

/* ------------------------------------------------------------
   Oturum — PostgreSQL'de saklanır.
   Bellekte tutulsaydı her yeniden dağıtımda herkes çıkış yapardı.
   ------------------------------------------------------------ */
const PgSession = connectPgSimple(session);

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET tanımlı değil. `openssl rand -hex 32` ile üretin.");
}

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    name: "xoxo.sid",
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 gün — "beni hatırla" için
    },
  }),
);

/* ------------------------------------------------------------
   Sağlık kontrolü — railway.json bu adrese bakıyor.
   Veritabanına da dokunur ki bağlantı koptuysa fark edilsin.
   ------------------------------------------------------------ */
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Detaylı Veritabanı Durumu Kontrolü
app.get("/api/health/db", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "up" });
  } catch (err) {
    console.error("[HEALTH] Veritabanı erişilemiyor:", err);
    res.status(503).json({ status: "degraded", db: "down" });
  }
});
/* İstek günlüğü — sadece /api yolları, gövde kırpılmış */
app.use((req, res, next) => {
  if (!req.path.startsWith("/api")) return next();
  const started = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - started;
    if (ms > 2000 || res.statusCode >= 400) {
      console.log(`[${req.method}] ${req.path} ${res.statusCode} ${ms}ms`);
    }
  });
  next();
});

async function bootstrap() {
  await registerRoutes(httpServer, app);

  /* Hata yakalayıcı — rota kaydından SONRA gelmeli */
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    console.error("[ERROR]", status, err.message);
    if (!res.headersSent) {
      res.status(status).json({ message: err.message || "Sunucu hatası" });
    }
  });

  /* Ön yüz: geliştirmede Vite ara katmanı, üretimde derlenmiş dosyalar */
  if (isProduction) {
    serveStatic(app);
  } else {
    await setupVite(app, httpServer);
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`[SERVER] ${isProduction ? "üretim" : "geliştirme"} modunda :${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error("[FATAL] Sunucu başlatılamadı:", err);
  process.exit(1);
});

/* Railway yeniden dağıtımda SIGTERM gönderir — açık bağlantıları kapat */
const shutdown = (signal: string) => {
  console.log(`[SERVER] ${signal} alındı, kapanıyor...`);
  httpServer.close(() => {
    pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
