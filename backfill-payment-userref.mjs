/**
 * Mevcut odeme kayitlarinda user_ref'i doldurur.
 *
 * recordPayment bugune kadar yalnizca userId (metin) yaziyordu,
 * user_ref bos kaliyordu. Admin paneli e-postayi user_ref uzerinden
 * aldigi icin satirlarda "#6" gorunuyordu.
 *
 * Kod duzeltildi (patch-payment-userref.mjs) ama ESKI satirlar hala
 * bos. Bu script onlari user_id degerinden dolduruyor.
 *
 * HICBIR SEY SILMEZ. Yalnizca user_ref'i NULL olan ve user_id'si
 * gecerli bir kullaniciya isaret eden satirlari gunceller.
 *
 * Kullanim (proje kokunde):  node backfill-payment-userref.mjs
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

async function main() {
  try {
    const before = await pool.query(
      "select count(*)::int as bos from payments where user_ref is null",
    );
    console.log(`\nuser_ref bos olan kayit: ${before.rows[0].bos}`);

    if (before.rows[0].bos === 0) {
      console.log("Doldurulacak kayit yok.");
      return;
    }

    const res = await pool.query(
      "UPDATE payments p SET user_ref = p.user_id::int " +
        "WHERE p.user_ref IS NULL AND p.user_id ~ '^[0-9]+$' " +
        "AND EXISTS (SELECT 1 FROM users u WHERE u.id = p.user_id::int)",
    );
    console.log(`${res.rowCount} kayit baglandi.`);

    const after = await pool.query(
      "select count(*)::int as bos from payments where user_ref is null",
    );
    if (after.rows[0].bos > 0) {
      console.log(
        `\n${after.rows[0].bos} kayit hala bos - user_id'si sayisal degil ` +
          "veya kullanici silinmis. Bunlar panelde #id olarak gorunmeye devam eder.",
      );
    }

    const sample = await pool.query(
      "select p.id, p.amount, p.currency, p.product_type, u.email " +
        "from payments p left join users u on u.id = p.user_ref " +
        "order by p.created_at desc limit 5",
    );
    console.log("\nSon kayitlar:");
    for (const r of sample.rows) {
      const tutar = (r.amount / 100).toFixed(2);
      console.log(`  #${r.id}  ${tutar} ${r.currency}  ${r.product_type}  ${r.email ?? "(bagli degil)"}`);
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
