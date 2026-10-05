/**
 * Premium yeniden tanimlandi: 9.99, sinirsiz yazili + 300 sesli yanit.
 *
 * ONCEKI DURUM VE NEDEN DEGISTI:
 *   Premium 4.99 idi ve hicbir mesaj icermiyordu (credits: 0).
 *   Ayni parayla 100 kredi paketi aliniyordu. Yani kullanici 4.99
 *   odeyip Premium aliyor ve HALA mesaj gonderemiyordu - sohbet
 *   uygulamasinda "para odedim ama konusamiyorum" demek.
 *
 * YENI DENGE:
 *   Yazili sinirsiz: mesaj basina maliyet binde birkac dolar.
 *   Sesli SINIRLI (300): ses saglayici basina odeniyor; sinirsiz
 *   verilirse tek agir kullanici aboneligin birkac katini harcar.
 *
 * TEKNIK: kredi dusum ucu artik mesajin sesli mi yazili mi oldugunu
 * biliyor. Onceden istemci govde gondermiyordu, sunucu ayrim yapamiyordu.
 *
 * Kullanim (proje kokunde):  node patch-premium-model.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const targets = [
  {
    file: 'shared/catalog.ts',
    patches: [
      {
        name: 'Premium: 9.99 + 300 sesli yanit',
        find: `  { id: "monthly", priceInCents: 499, days: 30, credits: 0 },`,
        replace: `  { id: "monthly", priceInCents: 999, days: 30, credits: 300 },`,
      },
      {
        name: 'credits tipi 0 olmaktan cikti',
        find: `  /** Bilerek 0. Premium kilit açar, mesaj beslemez. */
  credits: 0;`,
        replace: `  /**
   * Sesli yanit hakki. Yazili mesaj Premium'da kredi harcamaz;
   * ses harcar, cunku ses saglayici basina odenir ve sinirsiz
   * verilirse tek agir kullanici aboneligin birkac katini yakar.
   */
  credits: number;`,
      },
    ],
  },
  {
    file: 'server/routes.ts',
    patches: [
      {
        name: 'Kredi dusumu: Premium yazilida bedava, seste odeli',
        find: `      // Deduct 1 X-Credit per message (text or voice) - everyone pays
      const MESSAGE_CREDIT_COST = 1;`,
        replace: `      /* Premium: YAZILI sinirsiz, SESLI odeli.
         Yazili mesajin maliyeti binde birkac dolar, sinirsiz verilebilir.
         Ses saglayici basina odeniyor; sinirsiz verilirse tek agir
         kullanici aboneligin birkac katini harcar. Premium satin
         alindiginda 300 kredi yukleniyor, sesli yanitlar oradan duser. */
      const isVoice = req.body?.mode === "voice";

      if (user.isPremium && !isVoice) {
        return res.json({
          success: true,
          remaining: user.credits,
          premiumUnlimitedText: true,
        });
      }

      // Deduct 1 X-Credit per message (text or voice) - everyone pays
      const MESSAGE_CREDIT_COST = 1;`,
      },
      {
        name: 'Checkout aciklamasi guncellendi',
        find: `              description: \`Snake karakteri, tüm avatarlar, seste sıra önceliği - mesaj kredisi içermez\``,
        replace: `              description: \`Sınırsız yazılı mesaj, 300 sesli yanıt, Snake karakteri, tüm avatarlar\``,
      },
    ],
  },
  {
    file: 'client/src/pages/Chat.tsx',
    patches: [
      {
        name: 'Istemci: sesli mi yazili mi bildiriliyor',
        find: `      fetch("/api/message-credits/use", {
        method: "POST",
        credentials: "include"
      }).then(async (response) => {`,
        replace: `      // Sunucu Premium'da yazili mesaji bedava geciriyor, sesliyi
      // ucretlendiriyor - hangisi oldugunu bilmesi sart.
      fetch("/api/message-credits/use", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: isVoiceModeActive ? "voice" : "text" }),
      }).then(async (response) => {`,
      },
    ],
  },
];

let total = 0;
const failures = [];
for (const target of targets) {
  const file = path.resolve(target.file);
  let source;
  try { source = await fs.readFile(file, 'utf8'); }
  catch { console.error(`BULUNAMADI ${target.file}`); failures.push(target.file); continue; }
  await fs.writeFile(`${file}.pm.bak`, source, 'utf8');
  console.log(`\n--- ${target.file}`);
  let out = source;
  for (const p of target.patches) {
    // Zaten uygulanmissa atla - ayni blogu iki kez eklemeyi onler
    if (out.includes(p.replace.trim().split('\n')[0].trim()) && p.replace !== p.find
        && out.includes('premiumUnlimitedText') && p.name.includes('Kredi dusumu')) {
      console.log(`  ATLANDI  ${p.name} (zaten uygulanmis)`); continue;
    }
    const n = out.split(p.find).length - 1;
    if (n !== 1) { console.error(`  ATLANDI  ${p.name} — ${n} eslesme`); failures.push(p.name); continue; }
    out = out.replace(p.find, p.replace);
    console.log(`  OK       ${p.name}`);
    total++;
  }
  if (out !== source) await fs.writeFile(file, out, 'utf8');
}
console.log(`\n${total} degisiklik uygulandi.`);
if (failures.length) { console.log('Atlananlar:', failures.join(', ')); process.exit(1); }
console.log('\nNOT: /pricing sayfasi PREMIUM_PLANS.priceInCents degerini');
console.log('okudugu icin fiyat kendiliginden 9.99 gorunur.');
console.log('Sonraki adim: npm run build');
