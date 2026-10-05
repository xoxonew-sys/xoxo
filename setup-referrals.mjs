/**
 * Davet sistemi icin veritabani kolonlarini ekler.
 *
 * KOLONLAR:
 *   users.referral_code   davet kodu (her kullaniciya benzersiz)
 *   users.referred_by     bu kullaniciyi kim davet etti (users.id)
 *   users.referral_count  kac kisi davet etti - 10 ust siniri icin
 *   users.pending_notice  bir sonraki acilista gosterilecek bildirim
 *
 * NEDEN pending_notice:
 *   Davet eden kisi, davet ettigi kullanici dogrulama yaptiginda
 *   cevrimici olmayabilir. Kredi sessizce eklenirse neden arttigini
 *   anlamaz. Bu alan bir sonraki acilista gosterilir ve temizlenir.
 *
 *   Sinirlamasi var: ust uste iki olay olursa ikincisi birincinin
 *   uzerine yazar. Davet ust siniri 10 oldugu icin pratikte sorun
 *   degil; gercek bir olay gecmisi gerekirse ayri tablo gerekir.
 *
 * Bu script HICBIR SEY SILMEZ.
 *
 * Kullanim (proje kokunde):  node setup-referrals.mjs
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

/* Karistirilmasi kolay karakterler yok: 0/O, 1/I/l.
   Kullanici kodu elle yazacak ya da sesli soyleyecek. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function makeCode(len = 7) {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

async function main() {
  try {
    const cols = [
      ["referral_code", "text"],
      ["referred_by", "integer REFERENCES users(id) ON DELETE SET NULL"],
      ["referral_count", "integer NOT NULL DEFAULT 0"],
      ["pending_notice", "text"],
    ];

    for (const [name, type] of cols) {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${name} ${type}`);
      console.log(`users.${name} hazir.`);
    }

    // Benzersizlik: ayni kod iki kisiye gitmemeli
    await pool.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_idx ON users (referral_code)",
    );
    console.log("users_referral_code_idx hazir.");

    // Mevcut kullanicilara kod uret
    const missing = await pool.query(
      "select id from users where referral_code is null order by id",
    );
    console.log(`\nKodu olmayan kullanici: ${missing.rowCount}`);

    let made = 0;
    for (const row of missing.rows) {
      // Cakisma olursa yeniden dene - alfabe 31^7, pratikte nadir
      for (let attempt = 0; attempt < 8; attempt++) {
        try {
          await pool.query("UPDATE users SET referral_code = $1 WHERE id = $2", [
            makeCode(),
            row.id,
          ]);
          made++;
          break;
        } catch (err) {
          if (!String(err.message).includes("duplicate")) throw err;
        }
      }
    }
    console.log(`${made} kullaniciya kod uretildi.`);

    const sample = await pool.query(
      "select id, email, referral_code, referral_count from users order by id limit 5",
    );
    console.log("\nOrnek:");
    for (const r of sample.rows) {
      console.log(`  #${r.id}  ${r.referral_code}  (${r.referral_count} davet)  ${r.email}`);
    }

    console.log("\nTamam. Hicbir veri silinmedi.");
  } catch (err) {
    console.error("\nHATA:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
