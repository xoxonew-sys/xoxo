/**
 * X-Room sikayet tablosunu olusturur.
 *
 * NEDEN drizzle-kit push DEGIL:
 *   push, semada tanimli olmayan user_sessions tablosunu silmek istiyor
 *   (orasi connect-pg-simple'in oturum deposu). Bu script sadece EKLER,
 *   hicbir seyi silmez.
 *
 * Kullanim (proje kokunde):  node create-reports-table.mjs
 */

import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL bulunamadi. .env dosyasini kontrol edin.");
  process.exit(1);
}

console.log("Veritabani:", url.replace(/:[^:@]+@/, ":****@").slice(0, 70));

const pool = new Pool({ connectionString: url });

const DDL = `
CREATE TABLE IF NOT EXISTS room_reports (
  id            serial PRIMARY KEY,
  room_code     text NOT NULL,
  reporter_email text NOT NULL,
  reported_email text,
  reported_nickname text,
  message_text  text,
  reason        text,
  status        text NOT NULL DEFAULT 'open',
  created_at    timestamp NOT NULL DEFAULT now(),
  resolved_at   timestamp,
  resolved_by   text
);

CREATE INDEX IF NOT EXISTS room_reports_status_idx ON room_reports (status, created_at DESC);
`;

/* Oda kurucusunun sectigi avatar cinsiyeti. Sabit "female" kodluydu. */
const ROOM_GENDER = `
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS ai_gender text NOT NULL DEFAULT 'female';
`;

async function main() {
  try {
    await pool.query(DDL);
    console.log("\nroom_reports tablosu hazir.");

    await pool.query(ROOM_GENDER);
    console.log("rooms.ai_gender kolonu hazir.");

    const r = await pool.query(
      "select column_name from information_schema.columns where table_name = 'room_reports' order by ordinal_position",
    );
    console.log("\nroom_reports:", r.rows.map((x) => x.column_name).join(", "));

    const g = await pool.query(
      "select column_name from information_schema.columns where table_name = 'rooms' order by ordinal_position",
    );
    console.log("rooms:", g.rows.map((x) => x.column_name).join(", "));

    console.log("\nTamam. Hicbir veri silinmedi.");
  } catch (err) {
    console.error("\nHATA:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
