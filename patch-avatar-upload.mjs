/**
 * Avatar yuklemeye sunucu tarafi denetim ekler.
 *
 * Avatar, users tablosunda metin kolonunda data URL olarak duruyor.
 * Istemci gorseli 256px'e kucultup JPEG'e ceviriyor (~30 KB), ama
 * istemciye guvenilmez: dogrudan API'ye 5 MB'lik bir gorsel
 * gonderilebilir. O satir her kullanici listesi sorgusunda okunur ve
 * admin panelindeki liste agirlasir.
 *
 * Iki kural:
 *   - yalnizca png / jpeg / webp data URL
 *   - 300 KB ustu reddedilir
 *
 * Kullanim (proje kokunde):  node patch-avatar-upload.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const FILE = path.resolve('server/routes.ts');

const find = `      const { avatarUrl, avatarPreset } = req.body;
      await storage.updateUserAvatar(userId, avatarUrl || null, avatarPreset || null);`;

const replace = `      const { avatarUrl, avatarPreset } = req.body;

      /* Avatar data URL olarak geliyor ve users tablosunda metin kolonunda
         duruyor. Istemci 256px'e kucultup sikistiriyor (~30 KB), ama
         istemciye guvenilmez: dogrudan API'ye buyuk bir gorsel
         gonderilebilir ve satir sisebilir. 300 KB ustu reddediliyor. */
      if (typeof avatarUrl === "string" && avatarUrl.length > 0) {
        if (!/^data:image\\/(png|jpeg|jpg|webp);base64,/.test(avatarUrl)) {
          return res.status(400).json({ message: "Geçersiz görsel biçimi" });
        }
        if (avatarUrl.length > 300_000) {
          return res.status(413).json({ message: "Görsel çok büyük" });
        }
      }

      await storage.updateUserAvatar(userId, avatarUrl || null, avatarPreset || null);`;

const source = await fs.readFile(FILE, 'utf8');

if (source.includes('300_000')) {
  console.log('Zaten uygulanmis, degisiklik yapilmadi.');
  process.exit(0);
}
if (!source.includes(find)) {
  console.error('Eslesme bulunamadi: /api/auth/avatar ucu beklenenden farkli.');
  process.exit(1);
}

await fs.writeFile(`${FILE}.av.bak`, source, 'utf8');
await fs.writeFile(FILE, source.replace(find, replace), 'utf8');

console.log('OK  Avatar bicim ve boyut denetimi eklendi.');
console.log('Sonraki adim: npm run build');
