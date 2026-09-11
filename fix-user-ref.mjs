/**
 * chat_sessions.user_ref kolonunu ekler.
 *
 * Kod bu kolona yaziyor ama production veritabaninda yok:
 *   column "user_ref" of relation "chat_sessions" does not exist (42703)
 * Sonuc: oturum acilamiyor, hicbir mesaj gonderilemiyor.
 *
 * Bu script HICBIR SEY SILMEZ. Sadece eksik kolonu ekler.
 * (drizzle-kit push kullanilmadi cunku user_sessions tablosunu
 *  silmek istiyor - orasi connect-pg-simple'in oturum deposu.)
 *
 * Kullanim (proje kokunde):  node fix-user-ref.mjs
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

async function columns(table) {
  const r = await pool.query(
    "select column_name from information_schema.columns where table_name = $1 order by ordinal_position",
    [table],
  );
  return r.rows.map((x) => x.column_name);
}

async function main() {
  try {
    const before = await columns("chat_sessions");
    console.log("\nOnce:", before.join(", "));

    if (before.includes("user_ref")) {
      console.log("\nuser_ref zaten var, degisiklik yapilmadi.");
      return;
    }

    await pool.query(
      "ALTER TABLE chat_sessions ADD COLUMN user_ref integer REFERENCES users(id) ON DELETE CASCADE",
    );
    console.log("\nuser_ref eklendi.");

    // Eski satirlarda user_id metin olarak duruyor; sayisal olanlari tasi
    const filled = await pool.query(
      "UPDATE chat_sessions SET user_ref = user_id::integer " +
        "WHERE user_ref IS NULL AND user_id ~ '^[0-9]+$' " +
        "AND EXISTS (SELECT 1 FROM users u WHERE u.id = chat_sessions.user_id::integer)",
    );
    console.log(`Eski kayitlardan ${filled.rowCount} tanesi baglandi.`);

    const after = await columns("chat_sessions");
    console.log("\nSonra:", after.join(", "));
    console.log("\nTamam. Uygulamada mesaj gondermeyi deneyin.");
  } catch (err) {
    console.error("\nHATA:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
