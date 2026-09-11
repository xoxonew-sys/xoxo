/**
 * ACIL: Sunucu acilista coküyor.
 *
 *   ReferenceError: Cannot access 'requireAuth' before initialization
 *
 * Sikayet ucunu (/api/xroom/:code/report) 2729. satira koydum ama
 * requireAuth 3084'te const olarak tanimli. const hoisting yapmaz;
 * tanimlanmadan once kullanilinca ReferenceError firlar ve sure&ccedil;
 * olur. Healthcheck cevapsiz kalir, Railway deploy'u reddeder.
 *
 * COZUM: requireAuth tanimini requireAdmin'in hemen yanina tasi.
 * Uclari tasimak yerine tanimi yukari almak daha saglam - ileride
 * eklenecek uclar da ayni tuzaga dusmez.
 *
 * Kullanim (proje kokunde):  node patch-fix-requireauth.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const FILE = path.resolve('server/routes.ts');

const definition = `  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    if (!(req.session as any)?.userId) {
      return res.status(401).json({ message: "Bu islem icin giris yapmalisiniz" });
    }
    next();
  };

`;

const anchor = `  const requireAdmin = (req: Request, res: Response, next: NextFunction) => {`;

const source = await fs.readFile(FILE, 'utf8');

const occurrences = source.split(definition).length - 1;
if (occurrences === 0) {
  console.error('requireAuth tanimi bulunamadi - dosya beklenenden farkli.');
  process.exit(1);
}
if (occurrences > 1) {
  console.error(`requireAuth tanimi ${occurrences} kez gecmis - elle kontrol gerekli.`);
  process.exit(1);
}
if (!source.includes(anchor)) {
  console.error('requireAdmin tanimi bulunamadi.');
  process.exit(1);
}

const posAuth = source.indexOf(definition);
const posAdmin = source.indexOf(anchor);

if (posAuth < posAdmin) {
  console.log('requireAuth zaten yukarida, degisiklik gerekmedi.');
  process.exit(0);
}

await fs.writeFile(`${FILE}.auth.bak`, source, 'utf8');

// Once eski yerinden kaldir, sonra requireAdmin'in ustune koy
let output = source.replace(definition, '');
output = output.replace(
  anchor,
  `  // requireAuth burada tanimli olmali: asagida kullanan uclar var ve
  // const hoisting yapmadigi icin sonra tanimlanirsa sunucu acilista
  // ReferenceError ile olur.
` + definition + anchor,
);

await fs.writeFile(FILE, output, 'utf8');

const newAuth = output.indexOf('const requireAuth');
const firstUse = output.indexOf('requireAuth,');
console.log('OK  requireAuth yukari tasindi.');
console.log(`    tanim karakter ${newAuth}, ilk kullanim ${firstUse} — ` +
  (newAuth < firstUse ? 'sira dogru' : 'SIRA HALA YANLIS'));
console.log('\nSonraki adim: npm run build');
