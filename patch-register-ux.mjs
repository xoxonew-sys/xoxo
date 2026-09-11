/**
 * Kayit formundaki iki kullanilabilirlik sorununu duzeltir.
 *
 * SORUN 1 - Hata mesaji hangi alana ait belli degil:
 *   Sunucu Zod'un ilk hatasini duz metin olarak donuyordu:
 *     "Sadece harf, rakam ve alt cizgi kullanilabilir"
 *   Kullanici bunu SIFRE kurali sanip sifreyi degistirmeye calisiyor,
 *   oysa kural KULLANICI ADI alaninda. Test sirasinda bu tam olarak
 *   yasandi. Artik mesaj alan adiyla birlikte geliyor:
 *     "Kullanici adi: Sadece harf, rakam ve alt cizgi kullanilabilir"
 *
 * SORUN 2 - Turkce karakter reddediliyor:
 *   ^[a-zA-Z0-9_]+$ yuzunden "mehmet_avci" gecerken "mehmet_avci"nin
 *   Turkce yazimi ("avcı") reddediliyordu. Turkiye oncelikli bir
 *   uygulamada bu ciddi bir surtunme.
 *   Karsilastirma iki tarafta da lower() kullandigi icin acmak guvenli.
 *
 * Bosluga hala izin YOK - kullanici adi tek kelime kalmali (URL,
 * mention ve arama davranisi bozulmasin diye). Ama mesaj artik bunu
 * acikca soyluyor.
 *
 * Kullanim (proje kokunde):  node patch-register-ux.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const targets = [
  {
    file: 'shared/schema.ts',
    patches: [
      {
        name: 'Kullanici adi: Turkce harfler kabul ediliyor',
        find: `    .regex(/^[a-zA-Z0-9_]+$/, "Sadece harf, rakam ve alt çizgi kullanılabilir"),`,
        replace: `    // Turkce harfler dahil. Bosluk ve noktalama YOK: kullanici adi tek
    // kelime kalmali. Karsilastirma storage.getUserByUsername icinde
    // iki tarafta da lower() ile yapiliyor, bu yuzden guvenli.
    .regex(
      /^[a-zA-Z0-9_çğıöşüÇĞİÖŞÜ]+$/,
      "Boşluk ve noktalama kullanılamaz — sadece harf, rakam ve alt çizgi",
    ),`,
      },
    ],
  },

  {
    file: 'server/routes.ts',
    patches: [
      {
        name: 'Kayit hatasi: alan adiyla birlikte donuyor',
        find: `    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("[AUTH] Register error:", error);
      res.status(500).json({ message: "Kayıt işlemi başarısız oldu" });
    }
  });`,
        replace: `    } catch (error) {
      if (error instanceof z.ZodError) {
        // Hangi alanin hatali oldugunu mesaja koy. Duz mesaj donunce
        // kullanici yanlis alani duzeltmeye calisiyor - kullanici adi
        // kurali sifre kurali saniliyor.
        const issue = error.errors[0];
        const labels: Record<string, string> = {
          username: "Kullanıcı adı",
          email: "E-posta",
          password: "Şifre",
          displayName: "Görünen ad",
        };
        const field = String(issue.path[0] ?? "");
        const label = labels[field];
        return res.status(400).json({
          field: field || undefined,
          message: label ? \`\${label}: \${issue.message}\` : issue.message,
        });
      }
      console.error("[AUTH] Register error:", error);
      res.status(500).json({ message: "Kayıt işlemi başarısız oldu" });
    }
  });`,
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
      failures.push(`${target.file} (dosya yok)`);
      continue;
    }

    await fs.writeFile(`${file}.reg.bak`, source, 'utf8');
    console.log(`\n--- ${target.file}`);

    let output = source;
    for (const p of target.patches) {
      const count = output.split(p.find).length - 1;
      if (count !== 1) {
        console.error(`  ATLANDI  ${p.name} — ${count} eslesme`);
        failures.push(`${target.file}: ${p.name}`);
        continue;
      }
      output = output.replace(p.find, p.replace);
      console.log(`  OK       ${p.name}`);
      total++;
    }

    if (output !== source) await fs.writeFile(file, output, 'utf8');
  }

  console.log(`\n${total} degisiklik uygulandi.`);

  if (failures.length) {
    console.log('\nATLANANLAR:');
    failures.forEach((f) => console.log('  - ' + f));
    console.log('\nGeri al: ilgili .reg.bak dosyasini geri kopyalayin.');
    process.exit(1);
  }
  console.log('Sonraki adim: npm run build');
}

main();
