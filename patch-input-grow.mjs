/**
 * Mesaj kutusu uzun yazida buyumuyor.
 *
 * ASIL HATA:
 *   Chat.tsx auto-resize efektinde `+ "px"` yorum satirinin ICINDE kalmis:
 *     style.height = Math.min(scrollHeight, 112) // ... + "px";
 *   Birimsiz sayi gecersiz CSS oldugu icin tarayici atamayi yok sayiyor,
 *   kutu hep tek satirda kaliyor.
 *
 * IKINCI ENGEL:
 *   Alt cubuk `height: 80px` ile sabit. Kutu buyuse bile cubuktan tasardi.
 *   Artik `minHeight: 80px` - tek satirda gorunum birebir ayni (titreme yok),
 *   yazi uzadikca cubuk yukari dogru buyur (en fazla ~7 satir, sonra kutu
 *   kendi icinde kayar).
 *
 * UYUM:
 *   Cubuk yuksekligi --chat-bar-h CSS degiskenine yaziliyor. Mesaj listesinin
 *   alt boslugu ve cubugun ustundeki katmanlar (gorsel onizleme, "dinliyorum",
 *   uyari) bu degiskeni izliyor - buyuyen cubuk hicbir seyin ustune binmiyor.
 *
 * Ya hep ya hic: bir esleme bile tutmazsa dosyaya DOKUNMAZ.
 *
 * Kullanim (proje kokunde, C:\Projelerim\xoxo):  node patch-input-grow.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const FILE = 'client/src/pages/Chat.tsx';

const patches = [
  {
    name: '1) auto-resize: px birimi + cubuk yuksekligi degiskeni',
    find: [
      '    if (textareaRef.current) {',
      '      textareaRef.current.style.height = "auto";',
      '      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 112) // max-h-28 = en fazla ~4 satir + "px";',
      '    }',
      '  }, [content]);',
    ].join('\n'),
    replace: [
      '    const ta = textareaRef.current;',
      '    if (!ta) return;',
      '    const MAX_H = 144; // max-h-36 = ~7 satir, sonrasi kutu icinde kayar',
      '    ta.style.height = "auto";',
      '    const full = ta.scrollHeight;',
      '    const h = Math.max(40, Math.min(full, MAX_H));',
      '    ta.style.height = h + "px";',
      '    ta.style.overflowY = full > MAX_H ? "auto" : "hidden";',
      '    // Alt cubuk: tek satirda 80px, kutu buyudukce ayni oranda buyur',
      '    document.documentElement.style.setProperty("--chat-bar-h", (80 + (h - 40)) + "px");',
      '  }, [content]);',
      '',
      '  // Sohbetten cikinca degiskeni temizle',
      '  useEffect(() => {',
      '    return () => {',
      '      document.documentElement.style.removeProperty("--chat-bar-h");',
      '    };',
      '  }, []);',
    ].join('\n'),
  },
  {
    name: '2) alt cubuk: sabit yukseklik -> minHeight',
    find: [
      "          height: '80px', // ÇİVİLENDİ - TİTREME ENGELLENDİ",
      '          zIndex: 9998,',
      "          display: 'flex',",
      "          alignItems: 'center',",
    ].join('\n'),
    replace: [
      "          minHeight: '80px', // tek satirda 80px sabit; uzun yazida buyur",
      "          paddingTop: '16px',",
      "          paddingBottom: '16px',",
      '          zIndex: 9998,',
      "          display: 'flex',",
      "          alignItems: 'flex-end',",
    ].join('\n'),
  },
  {
    name: '3) textarea: ust sinir max-h-28 -> max-h-36',
    find: 'resize-none min-h-10 max-h-28 overflow-y-auto leading-snug',
    replace: 'resize-none min-h-10 max-h-36 overflow-y-auto leading-snug',
  },
  {
    name: '4) gonder dugmesi alta hizali',
    find: '"flex items-center justify-center rounded-full flex-shrink-0 transition-all w-10 h-10 sm:w-12 sm:h-12"',
    replace: '"flex items-center justify-center rounded-full flex-shrink-0 transition-all w-10 h-10 sm:w-12 sm:h-12 mb-1 sm:mb-0"',
  },
  {
    name: '5) mikrofon dugmesi alta hizali',
    find: '"flex items-center justify-center rounded-full flex-shrink-0 select-none touch-none transition-all w-10 h-10 sm:w-12 sm:h-12"',
    replace: '"flex items-center justify-center rounded-full flex-shrink-0 select-none touch-none transition-all w-10 h-10 sm:w-12 sm:h-12 mb-1 sm:mb-0"',
  },
  {
    name: '6) mesaj listesi alt boslugu cubugu izler',
    find: '<div className="min-h-screen flex flex-col p-4 md:p-6 max-w-4xl mx-auto pb-20">',
    replace: '<div className="min-h-screen flex flex-col p-4 md:p-6 max-w-4xl mx-auto pb-20" style={{ paddingBottom: \'var(--chat-bar-h, 80px)\' }}>',
  },
  {
    name: '7) cubuk ustu katmanlar (3 adet) cubugu izler',
    all: 3,
    find: "bottom: '90px'",
    replace: "bottom: 'calc(var(--chat-bar-h, 80px) + 10px)'",
  },
];

async function main() {
  const file = path.resolve(FILE);
  let source;
  try {
    source = await fs.readFile(file, 'utf8');
  } catch {
    console.error('BULUNAMADI  ' + FILE + '\nBu script proje kokunden calistirilmali (C:\\Projelerim\\xoxo).');
    process.exit(1);
  }

  // Windows satir sonlari (CRLF) eslesmeyi bozmasin
  const crlf = source.includes('\r\n');
  let output = crlf ? source.split('\r\n').join('\n') : source;

  const failures = [];
  for (const p of patches) {
    const count = output.split(p.find).length - 1;
    const expected = p.all || 1;
    if (count !== expected) {
      console.error('  TUTMADI  ' + p.name + ' — ' + count + ' eslesme (beklenen ' + expected + ')');
      failures.push(p.name);
      continue;
    }
    output = output.split(p.find).join(p.replace);
    console.log('  OK       ' + p.name);
  }

  if (failures.length) {
    console.error('\nDosyaya DOKUNULMADI. Chat.tsx beklenenden farkli — ciktiyi Claude\'a gonder.');
    process.exit(1);
  }

  await fs.writeFile(file + '.ig.bak', source, 'utf8');
  await fs.writeFile(file, crlf ? output.split('\n').join('\r\n') : output, 'utf8');
  console.log('\n' + patches.length + ' degisiklik uygulandi. Yedek: ' + FILE + '.ig.bak');
  console.log('Sonraki adim: npm run build');
}

main();
