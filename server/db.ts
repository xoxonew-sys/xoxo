import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

/**
 * Railway kalıcı bir Node süreci çalıştırdığı için Neon'un WebSocket
 * sürücüsü yerine düz TCP bağlantısı kullanıyoruz — daha hızlı ve
 * bağlantı havuzu süreç boyunca canlı kalır.
 *
 * Neon panelinden "Pooled connection" adresini al (-pooler içerir).
 */
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL tanımlı değil. Railway → Variables bölümüne ekleyin.");
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Neon SSL zorunlu
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (err) => {
  console.error("[DB] Havuz hatası:", err.message);
});

export const db = drizzle(pool, { schema });
