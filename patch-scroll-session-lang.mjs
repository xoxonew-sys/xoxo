/**
 * Uc duzeltme.
 *
 * 1. OTOMATIK KAYDIRMA — onceki denemem calismadi
 *    scrollIntoView kullaniyordum; hangi atanin kaydirilacagi tarayiciya
 *    kaliyor ve ic ice kapsayicilarda yanlis olani secebiliyor.
 *    Artik gercek kaydirilabilir atayi bulup scrollTop'u dogrudan
 *    yaziyoruz - belirsizlik yok.
 *
 * 2. KARAKTER DEGISINCE SOHBET SIFIRLANSIN
 *    Angel'dan Snake'e gecmek BASKA BIRIYLE konusmak demek; gecmisin
 *    ekranda kalmasi yanlis. Ama Siginak <-> Sicaklik ayni kisinin iki
 *    modu ("ayni kisiyim, sadece tarzim farkli"), orada gecmis KALMALI.
 *    Cozum: oturum anahtarina karakter (level) girer, mod (subLevel)
 *    girmez.
 *
 * 3. TR/EN DUGMESI HER SAYFADA
 *    App.tsx'e sabit konumlu tek dugme; Home'daki yerel dugme siliniyor
 *    ki iki tane gorunmesin.
 *
 * NOT: Ses kimlikleri DEGISTIRILMIYOR. Iki mod ayni kisi oldugu icin
 * ayni ses dogru; karakterler arasi fark zaten mevcut alti seste var.
 *
 * Kullanim (proje kokunde):  node patch-scroll-session-lang.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const targets = [
  {
    file: 'client/src/pages/Chat.tsx',
    patches: [
      {
        name: '1) Kaydirma: scrollTop ile kesin yontem',
        find: `  // Yeni mesajda ve mesaj BUYUDUKCE en alta kaydir.
  // Tek seferlik scroll yetmiyor: MessageReveal metni kademeli olarak
  // aciyor, yani yukseklik mesaj eklendikten sonra da artiyor.
  // MutationObserver bu buyumeyi takip edip alta yapisik kalmamizi saglar.
  useEffect(() => {
    const end = messagesEndRef.current;
    const container = end?.parentElement;
    if (!end) return;

    // Yeni mesajda yumusak, buyume sirasinda ani kaydirma
    end.scrollIntoView({ behavior: "smooth", block: "end" });

    if (!container) return;
    const stickToBottom = () => {
      end.scrollIntoView({ behavior: "auto", block: "end" });
    };

    const observer = new MutationObserver(stickToBottom);
    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });`,
        replace: `  // Yeni mesajda ve mesaj BUYUDUKCE en alta kaydir.
  //
  // scrollIntoView KULLANILMIYOR: hangi atanin kaydirilacagini tarayici
  // seciyor ve ic ice kapsayicilarda yanlis olani secebiliyor - ilk
  // denemede tam olarak bu oldu, sayfa kaydi ama mesaj alani kaymadi.
  // Bunun yerine gercek kaydirilabilir atayi bulup scrollTop'u dogrudan
  // yaziyoruz.
  //
  // MutationObserver sart: MessageReveal metni kademeli aciyor, yani
  // yukseklik mesaj eklendikten SONRA da artiyor. Tek seferlik kaydirma
  // son satiri ekran disinda birakiyor.
  useEffect(() => {
    const end = messagesEndRef.current;
    if (!end) return;

    /** En yakin gercekten kaydirilabilir atayi bul */
    const findScroller = (el: HTMLElement | null): HTMLElement | null => {
      let node = el?.parentElement ?? null;
      while (node) {
        const style = window.getComputedStyle(node);
        const scrollable = /(auto|scroll)/.test(style.overflowY);
        if (scrollable && node.scrollHeight > node.clientHeight) return node;
        node = node.parentElement;
      }
      return null;
    };

    const scroller = findScroller(end);
    const stickToBottom = () => {
      if (scroller) {
        scroller.scrollTop = scroller.scrollHeight;
      } else {
        // Kaydirilabilir kapsayici yoksa sayfanin kendisi kayiyordur
        window.scrollTo(0, document.body.scrollHeight);
      }
    };

    stickToBottom();

    const target = scroller ?? end.parentElement;
    if (!target) return;

    const observer = new MutationObserver(stickToBottom);
    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
    });`,
      },
    ],
  },

  {
    file: 'client/src/hooks/use-chat.ts',
    patches: [
      {
        name: '2) Karakter degisince sohbet sifirlanir',
        find: `  // Karakter/mod anahtara GIRMEZ: tek oturum tum karakterlerde paylasilir.
  // Boylece mod degistirince sohbet silinmez ve restore effect'i
  // gereksiz yere yeniden calisip iptal edilmez.
  const storageKey = \`xoxo_session_\${userId}\`;`,
        replace: `  // Anahtarda KARAKTER var, MOD yok.
  //   Angel -> Snake  : baska biri, sohbet sifirlanir (level degisir)
  //   Siginak -> Sicaklik : ayni kisinin iki modu, sohbet KALIR
  // Kullanicinin kendi ifadesiyle: "ayni kisiyim, sadece tarzim farkli".
  const storageKey = \`xoxo_session_\${userId}_\${level}\`;`,
      },
    ],
  },

  {
    file: 'client/src/App.tsx',
    patches: [
      {
        name: '3) LanguageToggle bileseni',
        find: `function NotFound() {`,
        replace: `/**
 * TR/EN dugmesi - her sayfada gorunur.
 * App.tsx'te tek yerde durdugu icin yeni sayfa eklendiginde
 * ayrica eklemeye gerek kalmiyor.
 */
function LanguageToggle() {
  const { language, setLanguage } = useLanguage();
  return (
    <button
      type="button"
      onClick={() => setLanguage(language === "tr" ? "en" : "tr")}
      className="fixed top-3 right-3 z-50 px-3 py-1.5 rounded-full glass-panel text-[11px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground"
      aria-label={language === "tr" ? "Switch to English" : "Türkçeye geç"}
      data-testid="language-toggle"
    >
      {language === "tr" ? "EN" : "TR"}
    </button>
  );
}

function NotFound() {`,
      },
      {
        name: '3) useLanguage import',
        find: `import { LanguageProvider } from "@/contexts/LanguageContext";`,
        replace: `import { LanguageProvider, useLanguage } from "@/contexts/LanguageContext";`,
      },
      {
        name: '3) Dugme ekrana basildi',
        find: `                <div className="h-full flex flex-col">
                  <Suspense fallback={<Loading />}>`,
        replace: `                <div className="h-full flex flex-col">
                  <LanguageToggle />
                  <Suspense fallback={<Loading />}>`,
      },
    ],
  },

  {
    file: 'client/src/pages/Home.tsx',
    patches: [
      {
        name: '3) Home: yerel dil dugmesi kaldirildi',
        find: `      {/* Üst çubuk: dil + oturum durumu */}
      <header className="flex items-center justify-between py-4">
        <button
          type="button"
          onClick={() => setLanguage(language === "tr" ? "en" : "tr")}
          className="text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground px-2 py-1"
        >
          {language === "tr" ? "EN" : "TR"}
        </button>
`,
        replace: `      {/* Ust cubuk: oturum durumu. Dil dugmesi App.tsx'te global. */}
      <header className="flex items-center justify-end py-4">
`,
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

    await fs.writeFile(`${file}.ssl.bak`, source, 'utf8');
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
    console.log('\nGeri al: ilgili .ssl.bak dosyasini geri kopyalayin.');
    process.exit(1);
  }
  console.log('Sonraki adim: npm run build');
}

main();
