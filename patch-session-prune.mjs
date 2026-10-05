import { readFileSync, writeFileSync, copyFileSync } from "node:fs";

const file = "server/index.ts";
const src = readFileSync(file, "utf8");

if (src.includes("pruneSessionInterval")) {
  console.log("Zaten uygulanmis, bir sey yapilmadi.");
  process.exit(0);
}

const needle = "createTableIfMissing: true,";
const count = src.split(needle).length - 1;
if (count !== 1) {
  console.error("Eslesme sayisi " + count + ", beklenen 1. Durduruldu.");
  process.exit(1);
}

const eol = src.includes("\r\n") ? "\r\n" : "\n";
const insert =
  needle +
  eol +
  "      pruneSessionInterval: 60 * 60 * 24, // 24 saatte bir temizle, Neon'u surekli uyandirmasin";

copyFileSync(file, file + ".bak");
writeFileSync(file, src.replace(needle, insert), "utf8");
console.log("Tamam: server/index.ts guncellendi. Yedek: server/index.ts.bak");