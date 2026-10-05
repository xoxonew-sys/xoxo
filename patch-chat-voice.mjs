// Proje kokunden calistir: node patch-chat-voice.mjs
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";

const file = "client/src/pages/Chat.tsx";
let src = readFileSync(file, "utf8");
if (src.includes("stopAndTranscribe")) {
  console.log("Zaten uygulanmis, bir sey yapilmadi.");
  process.exit(0);
}
const eol = src.includes("\r\n") ? "\r\n" : "\n";
const steps = [
  [
    "    startListening, \n    stopListening,\n    resetTranscript \n  } = useSpeechRecognition(language);",
    "    startListening, \n    stopListening,\n    stopAndTranscribe,\n    isTranscribing,\n    resetTranscript \n  } = useSpeechRecognition(language);"
  ],
  [
    "    stopListening();\n    \n    // FIX: Konuşma tanıma sonuçları buton bırakıldıktan SONRA gelir.\n    // Eski kod 150ms bekleyip bayat \"content\" state'ine bakıyordu ->\n    // transkript henüz gelmemiş oluyordu ve mesaj hiç gönderilmiyordu.\n    // Yeni: 500ms bekle + her zaman güncel olan contentRef'ten oku.\n    setTimeout(() => {\n      const finalText = contentRef.current.trim();\n      if (finalText) {\n        handleSubmit(true, finalText); // Mark as voice input + güncel metni geçir\n      }\n    }, 500);\n  };",
    "    // Kayit basar basmaz basladi; birakinca sunucu yaziya ceviriyor.\n    const text = await stopAndTranscribe();\n    if (text) {\n      handleSubmit(true, text);\n    }\n  };"
  ],
  [
    "    if (isListening) {\n      stopListening();\n      // FIX: bayat state yerine ref'ten oku, süreyi artır\n      setTimeout(() => {\n        const finalText = contentRef.current.trim();\n        if (finalText) {\n          handleSubmit(true, finalText);\n        }\n      }, 500);\n    } else {",
    "    if (isListening) {\n      const text = await stopAndTranscribe();\n      if (text) {\n        handleSubmit(true, text);\n      }\n    } else {"
  ],
  [
    "placeholder={isListening ? t(\"chat.listening\") : \"Mesaj\"}",
    "placeholder={isListening ? t(\"chat.listening\") : isTranscribing ? \"…\" : t(\"chat.placeholder\")}"
  ]
];

for (const [rawNeedle, rawReplacement] of steps) {
  const needle = rawNeedle.split("\n").join(eol);
  const replacement = rawReplacement.split("\n").join(eol);
  const count = src.split(needle).length - 1;
  if (count !== 1) {
    console.error("Eslesme sayisi " + count + " (beklenen 1). Durduruldu:\n" + rawNeedle.slice(0, 120));
    process.exit(1);
  }
  src = src.replace(needle, () => replacement);
}

copyFileSync(file, file + ".bak");
writeFileSync(file, src, "utf8");
console.log("Tamam: Chat.tsx guncellendi. Yedek: Chat.tsx.bak");
