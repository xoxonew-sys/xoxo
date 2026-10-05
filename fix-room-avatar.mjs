/**
 * room_messages.avatar_url kolonunu ekler.
 *
 * X-Room mesajlarinda kullanici fotografi gorunmuyordu. Sebep:
 * sunucu createRoomMessage({ ..., avatarUrl }) cagiriyor ama semada
 * boyle bir kolon YOK. Drizzle bilinmeyen alani sessizce atiyor -
 * hata vermiyor, veri de yazilmiyor. Liste de bos donuyor.
 *
 * Normal sohbette calismasinin sebebi orada avatarin dogrudan
 * user.avatarUrl'den okunmasi; veritabanina hic ugramiyor.
 *
 * Bu script HICBIR SEY SILMEZ. Sadece eksik kolonu ekler.
 *
 * Kullanim (proje kokunde):  node fix-room-avatar.mjs
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
    for (const table of ["room_messages", "room_members"]) {
      const before = await columns(table);
      if (before.length === 0) {
        console.log(`\n${table}: tablo yok, atlandi.`);
        continue;
      }
      if (before.includes("avatar_url")) {
        console.log(`\n${table}: avatar_url zaten var.`);
        continue;
      }
      await pool.query(`ALTER TABLE ${table} ADD COLUMN avatar_url text`);
      console.log(`\n${table}: avatar_url eklendi.`);
      console.log(`  ${(await columns(table)).join(", ")}`);
    }
    console.log("\nTamam. Hicbir veri silinmedi.");
    console.log("Yeni bir oda kurup test edin - eski odalardaki");
    console.log("mesajlarda fotograf olmayacak, kolon sonradan eklendi.");
  } catch (err) {
    console.error("\nHATA:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
