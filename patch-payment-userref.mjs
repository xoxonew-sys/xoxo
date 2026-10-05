/**
 * Odeme kaydina userRef ekler.
 *
 * Admin panelinde odeme satirlari kullanici e-postasi yerine "#6"
 * gosteriyordu. Sebep: recordPayment yalnizca userId (metin) yaziyor,
 * userRef (users.id'ye yabanci anahtar) bos kaliyordu. Panel
 * e-postayi userRef uzerinden LEFT JOIN ile aldigi icin bos donuyordu.
 *
 * userId metin kolonu (eski kayitlarla uyum icin duruyor), userRef ise
 * gercek iliski. Ikisi de yaziliyor.
 *
 * Kullanim (proje kokunde):  node patch-payment-userref.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const FILE = path.resolve('server/routes.ts');

const patches = [
  {
    name: 'Kredi odemesi: userRef yaziliyor',
    find: `        await storage.recordPayment({
          userId,
          stripeSessionId: session.id,
          stripePaymentIntentId: session.payment_intent as string,
          amount: session.amount_total || 0,
          currency: session.currency || 'usd',
          productType: 'credits',`,
    replace: `        await storage.recordPayment({
          userId,
          // userRef gercek iliski; userId metin kolonu eski kayitlarla
          // uyum icin duruyor. Admin paneli e-postayi userRef uzerinden
          // aliyor, bos kalirsa satirda "#6" gorunuyor.
          userRef: Number(userId),
          stripeSessionId: session.id,
          stripePaymentIntentId: session.payment_intent as string,
          amount: session.amount_total || 0,
          currency: session.currency || 'usd',
          productType: 'credits',`,
  },
  {
    name: 'Premium odemesi: userRef yaziliyor',
    find: `        await storage.recordPayment({
          userId,
          stripeSessionId: session.id,
          stripePaymentIntentId: session.payment_intent as string,
          amount: session.amount_total || 0,
          currency: session.currency || 'usd',
          productType: 'subscription',`,
    replace: `        await storage.recordPayment({
          userId,
          userRef: Number(userId),
          stripeSessionId: session.id,
          stripePaymentIntentId: session.payment_intent as string,
          amount: session.amount_total || 0,
          currency: session.currency || 'usd',
          productType: 'subscription',`,
  },
];

let source = await fs.readFile(FILE, 'utf8');

if (source.includes('userRef: Number(userId)')) {
  console.log('Zaten uygulanmis, degisiklik yapilmadi.');
  process.exit(0);
}

await fs.writeFile(`${FILE}.ur.bak`, source, 'utf8');

let applied = 0;
const failures = [];
for (const p of patches) {
  const n = source.split(p.find).length - 1;
  if (n !== 1) { console.error(`ATLANDI  ${p.name} — ${n} eslesme`); failures.push(p.name); continue; }
  source = source.replace(p.find, p.replace);
  console.log(`OK       ${p.name}`);
  applied++;
}

await fs.writeFile(FILE, source, 'utf8');
console.log(`\n${applied} degisiklik uygulandi.`);
if (failures.length) { console.log('Atlananlar:', failures.join(', ')); process.exit(1); }
console.log('Sonraki adim: npm run build');
