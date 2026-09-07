/**
 * logo-3d.png (1024x1024) kaynagindan web boyutlu varliklar uretir.
 *
 * NEDEN BIR BETIK:
 * Kaynak 1024x1024 ve ~1.1 MB. Bunu oldugu gibi sunmak mobilde kabul
 * edilemez - acilis ekraninda 1.1 MB'lik bir PNG, tum JS paketinden
 * (gzip ~108 kB) on kat buyuk demektir.
 *
 * Uretilenler:
 *   client/public/logo.webp      - acilis ekranindaki logo (2x retina)
 *   client/public/icon-192.png   - manifest.json PWA ikonu
 *   client/public/icon-512.png   - manifest.json PWA ikonu
 *
 * icon-192 ve icon-512 manifest.json ile client/index.html tarafindan
 * ZATEN referans veriliyordu ama dosyalar hic var olmamisti - yani
 * favicon ve PWA ikonu 404 donuyordu. Bu betik o eksigi de kapatir.
 *
 * Kullanim:  node scripts/generate-logo-assets.mjs [kaynak.png]
 */
import sharp from "sharp";
import path from "node:path";
import fs from "node:fs/promises";

const SOURCE = process.argv[2] ?? path.join(process.env.USERPROFILE ?? "", "Downloads", "logo-3d.png");
const OUT = path.resolve("client/public");

const targets = [
  // Acilis ekraninda ~128px genisliginde duruyor; 256 = 2x retina payi.
  { file: "logo.webp",    size: 256, format: "webp", opts: { quality: 90 } },
  // PNG zorunlu: manifest.json ikonlari PNG bekler. palette:true ile
  // 256 renge indirgeniyor - logo duz renkli/gradyanli oldugu icin
  // gozle fark edilmiyor ama dosya ucte birine iniyor.
  { file: "icon-192.png", size: 192, format: "png",  opts: { compressionLevel: 9, palette: true } },
  { file: "icon-512.png", size: 512, format: "png",  opts: { compressionLevel: 9, palette: true } },
];

const meta = await sharp(SOURCE).metadata();
console.log(`kaynak: ${SOURCE}  ${meta.width}x${meta.height}  ${(await fs.stat(SOURCE)).size} bayt`);

for (const t of targets) {
  const dest = path.join(OUT, t.file);
  await sharp(SOURCE)
    .resize(t.size, t.size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toFormat(t.format, t.opts)
    .toFile(dest);
  const { size } = await fs.stat(dest);
  console.log(`  ${t.file.padEnd(14)} ${String(t.size).padStart(4)}px  ${String(size).padStart(7)} bayt`);
}
