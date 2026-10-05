// Proje kokunden calistir: node patch-i18n-server.mjs
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";

const file = "server/index.ts";
if (!existsSync("server/i18n-messages.ts")) {
  console.error("Once server/i18n-messages.ts dosyasini yerlestir. Durduruldu.");
  process.exit(1);
}

let src = readFileSync(file, "utf8");
if (src.includes("translateApiMessages")) {
  console.log("Zaten uygulanmis, bir sey yapilmadi.");
  process.exit(0);
}

const eol = src.includes("\r\n") ? "\r\n" : "\n";
const steps = [
  {
    needle: 'import { startRetentionJobs } from "./retention";',
    add: 'import { translateApiMessages } from "./i18n-messages";',
  },
  {
    needle: 'app.set("trust proxy", 1);',
    add: "app.use(translateApiMessages); // API mesajlarini istemci diline cevirir",
  },
];

for (const { needle, add } of steps) {
  const count = src.split(needle).length - 1;
  if (count !== 1) {
    console.error("Eslesme sayisi " + count + " (beklenen 1): " + needle + " - Durduruldu.");
    process.exit(1);
  }
  src = src.replace(needle, needle + eol + add);
}

copyFileSync(file, file + ".bak");
writeFileSync(file, src, "utf8");
console.log("Tamam: server/index.ts guncellendi. Yedek: server/index.ts.bak");
