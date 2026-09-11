/**
 * ACIL: Mesaj gonderilemiyor hatasi + bekleyen duzeltmeler.
 *
 * ASIL HATA (A):
 *   use-chat.ts restore effect'inde `finally { if (!cancelled) setIsLoading(false) }`
 *   Efekt yarida iptal edilirse isLoading SONSUZA KADAR true kaliyor.
 *   handleSubmit ilk satirda `if (!trimmedContent || isLoading) return;`
 *   dedigi icin hicbir mesaj gonderilemiyor - istek bile atilmiyor.
 *
 *   Efekt neden iptal oluyor: storageKey icinde characterGender ve subLevel
 *   var; syncGenderFromAccount acilista cinsiyeti guncelleyince anahtar
 *   degisiyor ve ilk calisma iptal ediliyor.
 *
 * TEK OTURUM (B):
 *   storageKey artik sadece userId. Karakter/mod degistirince sohbet
 *   silinmiyor, ve efekt gereksiz yere yeniden calismiyor.
 *   sessionStorage: program kapaninca sohbet sifirlanir.
 *   Kisilik oturuma kilitli degil - her mesajla judgmentLevel gidiyor.
 *
 * SES (C):
 *   Istemci "character" gonderiyordu, sunucu "personality" bekliyordu.
 *   Alan hic eslesmedigi icin sunucu varsayilan personality=2 (Bestie)
 *   sesine dusuyordu - tum karakterler ayni sesle konusuyordu.
 *   Ayrica ses cinsiyeti kullanicidan degil karakterden okunmali.
 *
 * SESLI INPUT (D):
 *   Gonderimden sonra ses tanima son bir sonuc daha yayinlayip
 *   temizlenen kutuyu geri dolduruyordu.
 *
 * Kullanim (proje kokunde):  node patch-send-fix.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const targets = [
  /* ============================================================
     A + B — use-chat.ts
     ============================================================ */
  {
    file: 'client/src/hooks/use-chat.ts',
    patches: [
      {
        name: 'A) isLoading artik asili kalmiyor',
        find: `      } finally {
        if (!cancelled) setIsLoading(false);
      }`,
        replace: `      } finally {
        // KRITIK: cancelled kontrolu YOK. Efekt yarida iptal edilirse
        // isLoading sonsuza kadar true kalir ve handleSubmit ilk satirda
        // geri doner - hicbir mesaj gonderilemez, istek bile atilmaz.
        setIsLoading(false);
      }`,
      },
      {
        name: 'B) Tek oturum: storageKey sadece userId',
        find: `  const storageKey = \`xoxo_session_\${userId}_\${level}_\${characterGender}_\${subLevel}\`;`,
        replace: `  // Karakter/mod anahtara GIRMEZ: tek oturum tum karakterlerde paylasilir.
  // Boylece mod degistirince sohbet silinmez ve restore effect'i
  // gereksiz yere yeniden calisip iptal edilmez.
  const storageKey = \`xoxo_session_\${userId}\`;`,
      },
      {
        name: 'B) Oturum okuma: sessionStorage',
        find: `      const saved = window.localStorage.getItem(storageKey);`,
        replace: `      const saved = window.sessionStorage.getItem(storageKey);`,
      },
      {
        name: 'B) Gecersiz oturum temizleme: sessionStorage',
        find: `        window.localStorage.removeItem(storageKey);
        sessionIdRef.current = null;
        if (!cancelled) setMessages([]);`,
        replace: `        window.sessionStorage.removeItem(storageKey);
        sessionIdRef.current = null;
        if (!cancelled) setMessages([]);`,
      },
      {
        name: 'B) Oturum kaydetme: sessionStorage',
        find: `    window.localStorage.setItem(storageKey, String(session.id));`,
        replace: `    window.sessionStorage.setItem(storageKey, String(session.id));`,
      },
      {
        name: 'B) resetChat: sessionStorage',
        find: `    window.localStorage.removeItem(storageKey);
    sessionIdRef.current = null;
    setMessages([]);
    setIsTyping(false);`,
        replace: `    window.sessionStorage.removeItem(storageKey);
    sessionIdRef.current = null;
    setMessages([]);
    setIsTyping(false);`,
      },
      {
        name: 'B) Istek govdesine judgmentLevel eklendi',
        find: `          { content, language, gender, characterGender, subLevel, imageBase64, imageType },`,
        replace: `          // judgmentLevel her mesajda gonderilir: kisilik oturuma kilitli
          // degil, tek oturum icinde karakter degistirilebilsin diye.
          { content, language, judgmentLevel: level, gender, characterGender, subLevel, imageBase64, imageType },`,
      },
      {
        name: 'B) sendMessage bagimliliklarina level eklendi',
        find: `    [ensureSession, language, gender, characterGender, subLevel],`,
        replace: `    [ensureSession, language, level, gender, characterGender, subLevel],`,
      },
    ],
  },

  /* ============================================================
     C — ses alani ve cinsiyeti
     ============================================================ */
  {
    file: 'client/src/hooks/use-voice.ts',
    patches: [
      {
        name: 'C) TTS alani: character -> personality',
        find: `            character: personality,`,
        replace: `            // Sunucu bu alani "personality" adiyla okuyor (/api/tts/stream).
            // "character" adiyla gonderilirse alan eslesmez ve sunucu
            // varsayilan personality=2 (Bestie) sesine duser.
            personality,`,
      },
    ],
  },

  {
    file: 'client/src/pages/Chat.tsx',
    patches: [
      {
        name: 'C) TTS sesi karakter cinsiyetine baglandi',
        find: `  } = useStreamingTTS(level, user?.gender || "female", language); // Streaming TTS with personality-specific voice based on user gender`,
        replace: `    // Sesin cinsiyeti SECILEN AVATARIN cinsiyetidir, kullanicinin degil.
  } = useStreamingTTS(level, characterGender, language);`,
      },
      {
        name: 'D) Gec gelen ses sonuclari yok sayiliyor',
        find: `  // Update content when voice transcript changes
  useEffect(() => {
    if (transcript && transcript.trim()) {
      setContent(transcript);
      contentRef.current = transcript; // FIX: ref'i anında güncelle
      setIsVoiceInput(true);
    }
  }, [transcript]);`,
        replace: `  // Sesli girdiyi input kutusuna yansit.
  // isListening guard'i SART: gonderim sirasinda resetTranscript()
  // cagriliyor ama stopListening() ondan sonra geliyor ve ses tanima
  // dururken son bir sonuc daha yayinliyor. Guard olmadan o sonuc
  // temizlenmis kutuyu geri dolduruyor.
  useEffect(() => {
    if (!isListening) return;
    if (transcript && transcript.trim()) {
      setContent(transcript);
      contentRef.current = transcript;
      setIsVoiceInput(true);
    }
  }, [transcript, isListening]);`,
      },
    ],
  },

  /* ============================================================
     B + C — sunucu
     ============================================================ */
  {
    file: 'server/routes.ts',
    patches: [
      {
        name: 'B) Kisilik oturumdan degil istekten okunuyor',
        find: `      const systemPrompt = await getSystemPromptWithAdminSettings(session.judgmentLevel, language, userGender, subLevel, characterGender);`,
        replace: `      // Kisilik OTURUMA KILITLI DEGIL: her mesajin kendi isteginden okunur.
      // Boylece tek oturum icinde Angel'dan Snake'e gecilebilir ve
      // ekrandaki sohbet gecmisi kaybolmadan karakter degisir.
      const requestedLevel = Number(req.body.judgmentLevel);
      const activeLevel =
        requestedLevel === 1 || requestedLevel === 2 || requestedLevel === 3
          ? requestedLevel
          : session.judgmentLevel;

      const systemPrompt = await getSystemPromptWithAdminSettings(activeLevel, language, userGender, subLevel, characterGender);`,
      },
      {
        name: 'C) getVoiceConfigDynamic subLevel aliyor',
        find: `  async function getVoiceConfigDynamic(personality: number, gender: string = "female") {`,
        replace: `  async function getVoiceConfigDynamic(personality: number, gender: string = "female", subLevel: number = 1) {`,
      },
      {
        name: 'C) /api/tts/elevenlabs cagrisina subLevel',
        find: `      // Get personality-specific config based on user gender preference (with admin settings support)
      const config = await getVoiceConfigDynamic(personality, gender);

      const response = await fetch(\`https://api.elevenlabs.io/v1/text-to-speech/\${config.voiceId}\`, {`,
        replace: `      // Ses: karakter + cinsiyet + mod. subLevel gecirilmezse iki mod
      // ayni tonda duyulur.
      const config = await getVoiceConfigDynamic(personality, gender, subLevel);

      const response = await fetch(\`https://api.elevenlabs.io/v1/text-to-speech/\${config.voiceId}\`, {`,
      },
      {
        name: 'C) /api/tts/stream cagrisina subLevel',
        find: `      // Get personality-specific config based on user gender preference (with admin settings support)
      const config = await getVoiceConfigDynamic(personality, gender);

      // Use streaming endpoint with optimize_streaming_latency=4 (maximum optimization)`,
        replace: `      // Ses: karakter + cinsiyet + mod.
      const config = await getVoiceConfigDynamic(personality, gender, subLevel);

      // Use streaming endpoint with optimize_streaming_latency=4 (maximum optimization)`,
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

    await fs.writeFile(`${file}.sf.bak`, source, 'utf8');
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
    console.log('\nGeri al: ilgili .sf.bak dosyasini geri kopyalayin.');
    process.exit(1);
  }
  console.log('Sonraki adim: npm run build');
}

main();
