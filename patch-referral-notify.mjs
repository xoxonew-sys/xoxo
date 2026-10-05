/**
 * Davet bildirimlerini iki tarafa da gonderir.
 *
 * ONCEKI DURUM:
 *   Davet eden uygulama acilisinda bildirim aliyordu.
 *   Davet edilen HICBIR SEY gormuyordu - sadece bakiyesinde 150 kredi
 *   buluyordu ve 50'sinin nereden geldigini bilmiyordu.
 *
 * EKLENENLER:
 *   - davet edilene de uygulama ici bildirim
 *   - davet edene AYRICA mail
 *
 * NEDEN DAVET EDENE MAIL:
 *   Davet edilen kisi dogrulama yaptigi anda uygulamayi zaten aciyor,
 *   bildirimi hemen goruyor. Davet eden ise gunlerce girmeyebilir;
 *   o zamana kadar odulu kazandigini bilmez ve tekrar davet etmeye
 *   tesvik olmaz. Mail o bosluğu kapatiyor.
 *   Mail basarisiz olsa bile uygulama ici bildirim duruyor.
 *
 * Kullanim (proje kokunde):  node patch-referral-notify.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';

/* ---------- 1. Mail sablonu ---------- */
const emailFn = `
/* ---------------- Davet odulu bildirimi ---------------- */

/**
 * Davet eden kisiye "davetin kabul edildi" maili.
 *
 * Davet edilen kisi dogrulama aninda uygulamayi zaten acik tutuyor ve
 * bildirimi hemen goruyor; davet eden ise gunlerce girmeyebilir.
 * Mail o boslugu kapatiyor.
 */
export async function sendReferralRewardEmail(
  to: string,
  reward: number,
  remaining: number,
) {
  const html =
    \`<!DOCTYPE html><html><body style="margin:0;padding:32px;background:#0b0410;font-family:system-ui,sans-serif">\` +
    \`<div style="max-width:480px;margin:0 auto;background:#160a20;border:1px solid #3b1a4d;border-radius:20px;padding:32px;text-align:center">\` +
    \`<p style="margin:0 0 8px;color:#ff3fa4;font-size:13px;letter-spacing:3px;text-transform:uppercase">XOXO</p>\` +
    \`<h2 style="margin:0 0 12px;color:#fff;font-size:22px">Davetin kabul edildi</h2>\` +
    \`<p style="margin:0 0 24px;color:#b9a3c9;font-size:14px;line-height:1.6">\` +
    \`Paylaştığın kodla biri XOXO'ya katıldı. Hesabına <b style="color:#ff3fa4">\${reward} X-Kredi</b> eklendi.\` +
    \`</p>\` +
    \`<div style="background:rgba(255,63,164,0.1);border:1px solid rgba(255,63,164,0.4);border-radius:14px;padding:16px;margin-bottom:24px">\` +
    \`<p style="margin:0;color:#b9a3c9;font-size:13px">\` +
    (remaining > 0
      ? \`Kalan davet hakkın: <b style="color:#fff">\${remaining}</b>\`
      : \`Davet hakkını tamamen kullandın.\`) +
    \`</p></div>\` +
    \`<a href="https://xoxo-apps.com" style="display:inline-block;background:#ff3fa4;color:#fff;text-decoration:none;padding:12px 28px;border-radius:999px;font-size:14px;font-weight:600">Uygulamayı aç</a>\` +
    \`</div></body></html>\`;

  return send(to, "XOXO — Davetin kabul edildi, kredilerin hazır", html, "referral_reward");
}
`;

/* ---------- 2. Odul dagitimi guncellemesi ---------- */
const oldGrant = `    await storage.addXCredits(newUserId, REFERRED_REWARD);
    await storage.addXCredits(referrer.id, REFERRER_REWARD);

    await db
      .update(users)
      .set({
        referralCount: referrer.count + 1,
        pendingNotice:
          \`Davetinle biri katıldı — hesabına \${REFERRER_REWARD} X-Kredi eklendi.\`,
      })
      .where(eq(users.id, referrer.id));`;

const newGrant = `    await storage.addXCredits(newUserId, REFERRED_REWARD);
    await storage.addXCredits(referrer.id, REFERRER_REWARD);

    // Davet edilene de bildirim: 150 kredi gorup 50'sinin nereden
    // geldigini bilmemeli.
    await db
      .update(users)
      .set({
        pendingNotice:
          \`Davet kodu kullandın — \${REFERRED_REWARD} X-Kredi hediye kazandın.\`,
      })
      .where(eq(users.id, newUserId));

    const remaining = MAX_REFERRALS - (referrer.count + 1);

    await db
      .update(users)
      .set({
        referralCount: referrer.count + 1,
        pendingNotice:
          \`Davetinle biri katıldı — hesabına \${REFERRER_REWARD} X-Kredi eklendi.\`,
      })
      .where(eq(users.id, referrer.id));

    /* Davet edene ayrica mail.
       Uygulamayi gunlerce acmayabilir; o zamana kadar odulu
       kazandigini bilmezse tekrar davet etmeye tesvik olmaz.
       Mail basarisiz olsa bile uygulama ici bildirim duruyor. */
    const [referrerRow] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, referrer.id))
      .limit(1);

    if (referrerRow?.email) {
      sendReferralRewardEmail(referrerRow.email, REFERRER_REWARD, remaining).catch((err) =>
        console.error("[REFERRAL] Odul maili gonderilemedi:", err),
      );
    }`;

/* ---------- 3. Ust sinir dalinda da bildirim ---------- */
const oldCap = `    if (referrer.count >= MAX_REFERRALS) {
      await storage.addXCredits(newUserId, REFERRED_REWARD);`;

const newCap = `    if (referrer.count >= MAX_REFERRALS) {
      await storage.addXCredits(newUserId, REFERRED_REWARD);
      await db
        .update(users)
        .set({
          pendingNotice:
            \`Davet kodu kullandın — \${REFERRED_REWARD} X-Kredi hediye kazandın.\`,
        })
        .where(eq(users.id, newUserId));`;

const patches = [
  { name: 'Davet edilene bildirim + davet edene mail', find: oldGrant, replace: newGrant },
  { name: 'Ust sinir dalinda da bildirim', find: oldCap, replace: newCap },
  {
    name: 'sendReferralRewardEmail import edildi',
    find: `sendPasswordResetEmail, sendReportEmail } from "./email";`,
    replace: `sendPasswordResetEmail, sendReportEmail, sendReferralRewardEmail } from "./email";`,
  },
];

async function main() {
  /* email.ts */
  const emailPath = path.resolve('server/email.ts');
  let email = await fs.readFile(emailPath, 'utf8');

  if (email.includes('sendReferralRewardEmail')) {
    console.log('--- server/email.ts\n  ATLANDI  zaten var');
  } else {
    await fs.writeFile(`${emailPath}.rn.bak`, email, 'utf8');
    await fs.writeFile(emailPath, email.trimEnd() + '\n' + emailFn, 'utf8');
    console.log('--- server/email.ts\n  OK       sendReferralRewardEmail eklendi');
  }

  /* routes.ts */
  const FILE = path.resolve('server/routes.ts');
  let source = await fs.readFile(FILE, 'utf8');
  await fs.writeFile(`${FILE}.rn.bak`, source, 'utf8');
  console.log('\n--- server/routes.ts');

  let applied = 0;
  const failures = [];
  for (const p of patches) {
    const n = source.split(p.find).length - 1;
    if (n !== 1) {
      console.error(`  ATLANDI  ${p.name} — ${n} eslesme`);
      failures.push(p.name);
      continue;
    }
    source = source.replace(p.find, p.replace);
    console.log(`  OK       ${p.name}`);
    applied++;
  }
  await fs.writeFile(FILE, source, 'utf8');

  console.log(`\n${applied} degisiklik uygulandi.`);
  if (failures.length) {
    console.log('Atlananlar:', failures.join(', '));
    process.exit(1);
  }
  console.log('Sonraki adim: npm run build');
}

main();
