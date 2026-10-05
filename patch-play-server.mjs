// Proje kokunden calistir: node patch-play-server.mjs
// /api/play/verify route'unu kaydeder (oturum middleware'inden sonra).
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";

const file = "server/index.ts";
if (!existsSync("server/play-billing.ts")) {
  console.error("Once server/play-billing.ts dosyasini yerlestir. Durduruldu.");
  process.exit(1);
}

let src = readFileSync(file, "utf8");
if (src.includes("registerPlayBillingRoutes")) {
  console.log("Zaten uygulanmis, bir sey yapilmadi.");
  process.exit(0);
}

const eol = src.includes("\r\n") ? "\r\n" : "\n";
const importNeedle = 'import { startRetentionJobs } from "./retention";';
const routeNeedle = 'app.get("/api/health", (_req, res) => {';

for (const needle of [importNeedle, routeNeedle]) {
  const count = src.split(needle).length - 1;
  if (count !== 1) {
    console.error("Eslesme sayisi " + count + " (beklenen 1): " + needle + " - Durduruldu.");
    process.exit(1);
  }
}

src = src.replace(importNeedle, importNeedle + eol + 'import { registerPlayBillingRoutes } from "./play-billing";');
src = src.replace(routeNeedle, "registerPlayBillingRoutes(app); // Google Play uygulama ici satin alma" + eol + eol + routeNeedle);

copyFileSync(file, file + ".bak-play");
writeFileSync(file, src, "utf8");
console.log("Tamam: server/index.ts guncellendi. Yedek: server/index.ts.bak-play");
