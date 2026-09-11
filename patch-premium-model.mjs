/**
 * Premium yeniden tanimlandi: sinirsiz yazili + 300 sesli yanit.
 *
 * ONCEKI DURUM VE NEDEN DEGISTI:
 *   Premium 4.99 idi ve hicbir mesaj icermiyordu ("erisim satar, mesaj
 *   satmaz"). Ayni parayla 100 kredi paketi aliniyordu. Yani kullanici
 *   4.99 odeyip Premium aliyor ve HALA mesaj gonderemiyordu - sohbet
 *   uygulamasinda "para odedim ama konusamiyorum" demek. Iade ve kotu
 *   yorum ureten sekil.
 *
 * YENI DENGE:
 *   Yazili sinirsiz, cunku mesaj basina maliyet binde birkac dolar.
 *   Sesli SINIRLI (300 yanit), cunku ses saglayici basina odeniyor;
 *   sinirsiz verilirse tek agir kullanici aboneligin birkac katini
 *   harcayabilir.
 *
 * MALIYET HESABI (ElevenLabs Flash, 1M karakter = 50 USD):
 *   yanit ~130 karakter -> yanit basina ~0.0065 USD
 *   300 sesli yanit     -> ~2 USD
 *   9.99 fiyatta Stripe komisyonu dustukten sonra marj rahat.
 *
 * TEKNIK: kredi dusum ucu artik mesajin sesli mi yazili mi oldugunu
 * biliyor. Onceden istemci govde gondermiyordu ve sunucu ayrim
 * yapamiyordu.
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
        find: `export const PREMIUM_PLANS: readonly PremiumPlan[] = [
  { id: "monthly", priceInCents: 499, days: 30, credits: 0 },
] as const;`,
        replace: `export const PREMIUM_PLANS: readonly PremiumPlan[] = [
  { id: "monthly", priceInCents: 999, days: 30, credits: 300 },
] as const;`,
      },
      {
        name: 'Premium: credits tipi 0 olmaktan cikti',
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
        find: `      // Premium ARTIK ÖLÇÜLEN HİÇBİR ŞEYİ BEDAVA YAPMAZ. Buradaki atlama
      // kaldırıldı: premium kullanıcı da mesaj başına kredi öder.
      // Gerekçe shared/catalog.ts başlığında - hacim satan bir abonelik,
      // tavanı vidalanmış sınırsız premium'dur; aynı şekil, küçüğü.
      // Premium erişim satar (karakter kilidi, öncelik), mesaj satmaz.

      // Deduct 1 X-Credit per message (text or voice) - everyone pays
      const MESSAGE_CREDIT_COST = 1;`,
        replace: `      /* Premium: YAZILI sinirsiz, SESLI odeli.
         Yazili mesajin maliyeti binde birkac dolar, sinirsiz verilebilir.
         Ses saglayici basina odeniyor; sinirsiz verilirse tek agir
         kullanici aboneligin birkac katini harcar. Premium satin
         alindiginda 300 kredi yukleniyor, sesli yanitlar oradan dusuyor.

         Premium'un suresi dolduysa (premiumUntil gecmis) bu atlama
         calismaz - isPremium alani sunucu tarafinda guncelleniyor. */
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

async function main() {
  let total = 0;
  const failures = [];

  for (const target of targets) {
    const file = path.resolve(target.file);
    let source;
    try {
      source = await fs.readFile(file, 'utf8');
    } catch {
      console.error(`\nBULUNAMADI  ${target.file}`);
      failures.push(target.file);
      continue;
    }

    await fs.writeFile(`${file}.pm.bak`, source, 'utf8');
    console.log(`\n--- ${target.file}`);

    let out = source;
    for (const p of target.patches) {
      const n = out.split(p.find).length - 1;
      if (n !== 1) {
        console.error(`  ATLANDI  ${p.name} — ${n} eslesme`);
        failures.push(p.name);
        continue;
      }
      out = out.replace(p.find, p.replace);
      console.log(`  OK       ${p.name}`);
      total++;
    }
    if (out !== source) await fs.writeFile(file, out, 'utf8');
  }

  console.log(`\n${total} degisiklik uygulandi.`);
  if (failures.length) {
    console.log('Atlananlar:', failures.join(', '));
    process.exit(1);
  }
  console.log('\nDIKKAT: Pricing sayfasindaki Premium aciklamasi da');
  console.log('guncellenmelidir - "mesaj kredisi icermez" artik yanlis.');
  console.log('Sonraki adim: npm run build');
}

main();
