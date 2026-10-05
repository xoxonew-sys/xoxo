// Proje kokunden calistir: node patch-chat-input.mjs
// Mesaj kutusu yazdikca 4 satira kadar buyur, sonrasi kutu icinde kayar.
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";

const file = "client/src/pages/Chat.tsx";
let src = readFileSync(file, "utf8");
if (src.includes("max-h-28 overflow-y-auto")) {
  console.log("Zaten uygulanmis, bir sey yapilmadi.");
  process.exit(0);
}
const steps = [
  [
    "flex-1 min-w-0 flex items-center bg-white dark:bg-zinc-800 rounded-full px-1.5 sm:px-2 py-1 gap-0.5 sm:gap-1",
    "flex-1 min-w-0 flex items-end bg-white dark:bg-zinc-800 rounded-3xl px-1.5 sm:px-2 py-1 gap-0.5 sm:gap-1"
  ],
  [
    "resize-none h-10 max-h-10 overflow-hidden placeholder:text-zinc-400",
    "resize-none min-h-10 max-h-28 overflow-y-auto leading-snug placeholder:text-zinc-400"
  ],
  [
    "Math.min(textareaRef.current.scrollHeight, 150)",
    "Math.min(textareaRef.current.scrollHeight, 112) // max-h-28 = en fazla ~4 satir"
  ]
];

for (const [needle, replacement] of steps) {
  const count = src.split(needle).length - 1;
  if (count !== 1) {
    console.error("Eslesme sayisi " + count + " (beklenen 1). Durduruldu: " + needle);
    process.exit(1);
  }
  src = src.replace(needle, () => replacement);
}

copyFileSync(file, file + ".bak-input");
writeFileSync(file, src, "utf8");
console.log("Tamam: Chat.tsx guncellendi. Yedek: Chat.tsx.bak-input");
