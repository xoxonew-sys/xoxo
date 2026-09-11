/**
 * payments.user_ref kolonunu ekler.
 *
 * Admin panelindeki Odemeler sekmesi 500 donuyor cunku kod bu kolona
 * bakiyor ama uretim veritabaninda yok - migration 0001 hic
 * uygulanmamis. chat_sessions icin ayni seyi daha once elle yapmistik;
 * bu, ayni migration'in atlanan ikinci yarisi.
 *
 * Migration 0001'in SADECE payments bolumunu, veri silen kisimlarina
 * DOKUNMADAN uygular:
 *   - kolonu ekler
 *   - eski sayisal user_id degerlerini tasir
 *   - ON DELETE SET NULL yabanci anahtari kurar
 *
 * SET NULL, CASCADE degil: odeme kaydi mali belgedir (VUK 5 yil,
 * TTK 10 yil). Kullanici hesabini silince odeme satiri KALIR, sadece
 * kisi baglantisi kopar.
 *
 * Kullanim (proje kokunde):  node fix-payments-userref.mjs
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
    const before = await columns("payments");
    if (before.length === 0) {
      console.error("\npayments tablosu bulunamadi.");
      process.exitCode = 1;
      return;
    }
    console.log("\nOnce:", before.join(", "));

    if (before.includes("user_ref")) {
      console.log("\nuser_ref zaten var, kolon eklenmedi.");
    } else {
      await pool.query("ALTER TABLE payments ADD COLUMN user_ref integer");
      console.log("\nuser_ref eklendi.");
    }

    const moved = await pool.query(
      "UPDATE payments p SET user_ref = p.user_id::int " +
        "WHERE p.user_ref IS NULL AND p.user_id ~ '^[0-9]+$' " +
        "AND EXISTS (SELECT 1 FROM users u WHERE u.id = p.user_id::int)",
    );
    console.log(`Eski kayitlardan ${moved.rowCount} tanesi baglandi.`);

    const fk = await pool.query(
      "select 1 from pg_constraint where conname = 'payments_user_ref_fk'",
    );
    if (fk.rowCount === 0) {
      await pool.query(
        "ALTER TABLE payments ADD CONSTRAINT payments_user_ref_fk " +
          "FOREIGN KEY (user_ref) REFERENCES users(id) ON DELETE SET NULL",
      );
      console.log("payments_user_ref_fk kuruldu (ON DELETE SET NULL).");
    } else {
      console.log("payments_user_ref_fk zaten var.");
    }

    console.log("\nSonra:", (await columns("payments")).join(", "));
    console.log("\nTamam. Hicbir veri silinmedi.");
    console.log("Admin panelinde Odemeler sekmesini tekrar deneyin.");
  } catch (err) {
    console.error("\nHATA:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
