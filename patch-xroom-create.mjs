/**
 * X-Room Adim 2a: oda olusturma sunucu tarafi.
 *
 * UC UYUMSUZLUK:
 *
 * 1. Sure ust siniri 15 dakika (min(5).max(15)) ama 30 dakika isteniyor.
 *    Ayrica keyfi degerler kabul ediliyordu (7, 13...). Artik sadece
 *    5 / 10 / 15 / 30 gecerli.
 *
 * 2. aiMode: 2 SABIT KODLU. Odayi kuran Angel/Bestie/Snake seciyor ama
 *    secim yok sayiliyor, herkes Bestie ile karsilasiyordu.
 *
 * 3. aiGender hic gonderilmiyor. Kolonu eklemistik ama create onu
 *    doldurmuyordu, hep varsayilan "female" kaliyordu.
 *
 * AYRICA requireAuth:
 *   Oda uclari acikti. Sikayet/engelleme mekanizmasi ancak kimligi olan
 *   kullanicida calisir - anonim uyeyi banlayacak bir hesap yok.
 *   Uygulama genelinde kayit zaten zorunlu, sunucu tarafinda da
 *   zorunlu kilmak sadece bunu garantiye aliyor.
 *
 * Kullanim (proje kokunde):  node patch-xroom-create.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const FILE = path.resolve('server/routes.ts');

const patches = [
  {
    name: 'create: sure secenekleri + avatar + cinsiyet',
    find: `  app.post("/api/xroom/create", async (req, res) => {
    try {
      const schema = z.object({
        durationMinutes: z.number().min(5).max(15),
        nickname: z.string().min(1).max(20),
        memberId: z.string().min(1),
        avatarUrl: z.string().optional(),
      });
      const { durationMinutes, nickname, memberId, avatarUrl } = schema.parse(req.body);`,
    replace: `  app.post("/api/xroom/create", requireAuth, async (req, res) => {
    try {
      const schema = z.object({
        // Sadece bu dort deger. Onceden max(15) idi ve arada kalan
        // keyfi degerler (7, 13) da kabul ediliyordu.
        durationMinutes: z.union([
          z.literal(5),
          z.literal(10),
          z.literal(15),
          z.literal(30),
        ]),
        nickname: z.string().min(1).max(20),
        memberId: z.string().min(1),
        avatarUrl: z.string().optional(),
        // Odayi kuranin sectigi karakter ve cinsiyet.
        // Onceden aiMode: 2 sabit kodluydu, secim yok sayiliyordu.
        aiMode: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
        aiGender: z.enum(["male", "female"]).default("female"),
      });
      const { durationMinutes, nickname, memberId, avatarUrl, aiMode, aiGender } =
        schema.parse(req.body);`,
  },
  {
    name: 'create: secilen karakter kaydediliyor',
    find: `      const room = await storage.createRoom({
        code,
        adminId: memberId,
        durationMinutes,
        aiMode: 2,
        expiresAt,
      });`,
    replace: `      const room = await storage.createRoom({
        code,
        adminId: memberId,
        durationMinutes,
        aiMode,
        aiGender,
        expiresAt,
      } as any);`,
  },
  {
    name: 'join: giris zorunlu',
    find: `  app.post("/api/xroom/join", async (req, res) => {`,
    replace: `  app.post("/api/xroom/join", requireAuth, async (req, res) => {`,
  },
  {
    name: 'message: giris zorunlu',
    find: `  app.post("/api/xroom/:code/message", async (req, res) => {`,
    replace: `  app.post("/api/xroom/:code/message", requireAuth, async (req, res) => {`,
  },
];

async function main() {
  let source;
  try {
    source = await fs.readFile(FILE, 'utf8');
  } catch {
    console.error(`Dosya bulunamadi: ${FILE}`);
    process.exit(1);
  }

  await fs.writeFile(`${FILE}.xc.bak`, source, 'utf8');
  console.log(`Yedek: server/routes.ts.xc.bak\n`);

  let output = source;
  let applied = 0;
  const failures = [];

  for (const p of patches) {
    const count = output.split(p.find).length - 1;
    if (count !== 1) {
      console.error(`ATLANDI  ${p.name} — ${count} eslesme`);
      failures.push(p.name);
      continue;
    }
    output = output.replace(p.find, p.replace);
    console.log(`OK       ${p.name}`);
    applied++;
  }

  if (applied === 0) {
    console.error('\nHicbir degisiklik uygulanmadi.');
    process.exit(1);
  }

  await fs.writeFile(FILE, output, 'utf8');
  console.log(`\n${applied} degisiklik uygulandi.`);

  // requireAuth siralamasi kontrolu - onceki hatanin tekrarini onler
  const defPos = output.indexOf('const requireAuth');
  const firstUse = output.indexOf('requireAuth,');
  if (defPos < 0 || firstUse < 0 || defPos > firstUse) {
    console.error('\nUYARI: requireAuth ilk kullanimdan SONRA tanimli.');
    console.error('Sunucu acilista ReferenceError verir. patch-fix-requireauth.mjs calistirin.');
    process.exit(1);
  }
  console.log('requireAuth siralamasi dogru.');

  if (failures.length) {
    console.log('Atlananlar:', failures.join(', '));
    process.exit(1);
  }
  console.log('Sonraki adim: npm run build');
}

main();
