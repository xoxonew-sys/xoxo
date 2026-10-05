// Proje kokunden calistir: node patch-stt-server.mjs
// /api/stt route'unu kaydeder. Oturum middleware'inden SONRA eklenmeli
// (req.session gerekiyor), bu yuzden /api/health satirinin hemen ustune giriyor.
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";

const file = "server/index.ts";
if (!existsSync("server/stt.ts")) {
  console.error("Once server/stt.ts dosyasini yerlestir. Durduruldu.");
  process.exit(1);
}

let src = readFileSync(file, "utf8");
if (src.includes("registerSttRoute")) {
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

src = src.replace(importNeedle, importNeedle + eol + 'import { registerSttRoute } from "./stt";');
src = src.replace(routeNeedle, "registerSttRoute(app); // bas-konus-birak kaydini yaziya cevirir" + eol + eol + routeNeedle);

copyFileSync(file, file + ".bak-stt");
writeFileSync(file, src, "utf8");
console.log("Tamam: server/index.ts guncellendi. Yedek: server/index.ts.bak-stt");
