import { getPersona, buildSystemPrompt } from "./personas";
const persona = getPersona(level, gender, subLevel);
const system = buildSystemPrompt(persona, language);
import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { WebSocketServer, WebSocket } from "ws";
import { z } from "zod";
import type { RoomMessage, User } from "@shared/schema";
import { 
  loginSchema, registerSchema, verifyOtpSchema, resendOtpSchema, 
  passwordResetRequestSchema, passwordResetSchema, adminLoginSchema,
  users, chatSessions, chatMessages, payments, roomMembers, roomMessages,
  userBans, globalNotifications, usageAnalytics, apiCostTracking
} from "@shared/schema";
import { db } from "./db";
import { eq, sql, and, or, gt, isNull } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { generateOTP, getOTPExpiry, sendVerificationEmail, sendPasswordResetEmail } from "./email";
// Note: Using ElevenLabs for high-quality TTS (already configured)
// Client-side Web Speech API provides free alternative for basic TTS

// Extend Express Request to include user
declare module "express-serve-static-core" {
  interface Request {
    user?: User;
  }
}

// GLOBAL ADMIN EMAIL WHITELIST - These users ALWAYS bypass ALL credit checks
// Used across all credit endpoints for consistent admin bypass
// Ortam degiskeninden okunur, yoksa varsayilana duser.
// Buyuk/kucuk harf ve bosluk farklari burada ve giris tarafinda normalize edilir.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "mehmetavci98@yahoo.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || "dummy",
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// Gemini AI for Jarvis Assistant
const gemini = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

// Human-like text processing: add occasional typos, thinking pauses, etc.
function humanizeText(text: string, intensity: number = 0.3): string {
  // Common Turkish typos and hesitations
  const hesitations = ["hmm ", "şey ", "yani ", "ee ", ""];
  const fillers = ["aslında ", "bence ", "yaa ", ""];

  // Only apply at low probability
  if (Math.random() > intensity) {
    return text;
  }

  let humanized = text;

  // Add occasional hesitation at start (10% chance)
  if (Math.random() < 0.1) {
    const hesitation = hesitations[Math.floor(Math.random() * hesitations.length)];
    humanized = hesitation + humanized.charAt(0).toLowerCase() + humanized.slice(1);
  }

  // Add occasional filler words (5% chance per sentence)
  if (Math.random() < 0.05) {
    const sentences = humanized.split('. ');
    if (sentences.length > 1) {
      const idx = Math.floor(Math.random() * (sentences.length - 1)) + 1;
      const filler = fillers[Math.floor(Math.random() * fillers.length)];
      sentences[idx] = filler + sentences[idx].charAt(0).toLowerCase() + sentences[idx].slice(1);
      humanized = sentences.join('. ');
    }
  }

  // Add occasional repeated letters (3% chance) - very subtle typo effect
  if (Math.random() < 0.03) {
    const charIdx = Math.floor(Math.random() * humanized.length);
    const char = humanized.charAt(charIdx);
    if (/[a-zA-ZğüşöçıİĞÜŞÖÇ]/.test(char)) {
      humanized = humanized.slice(0, charIdx) + char + humanized.slice(charIdx);
    }
  }

  return humanized;
}

// Calculate typing delay based on message length (for frontend simulation)
function getTypingDelay(text: string): { minDelay: number; maxDelay: number; pausePoints: number[] } {
  const words = text.split(' ').length;
  const baseDelay = 30; // ms per character
  const minDelay = Math.min(words * 100, 500); // At least 100ms per word, max 500ms
  const maxDelay = Math.min(words * 200, 3000); // Max 3 seconds thinking

  // Find natural pause points (after punctuation)
  const pausePoints: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (['.', '!', '?', ',', '...'].some(p => text.substring(i, i + p.length) === p)) {
      pausePoints.push(i);
    }
  }

  return { minDelay, maxDelay, pausePoints };
}

// Voice settings for each personality - Gender specific
const voiceSettingsFemale: Record<number, "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"> = {
  1: "shimmer", // Angel - warm, gentle female voice
  2: "nova",    // Bestie - friendly, natural female voice
  3: "nova",    // Snake - Female users hear female voice (nova)
};

const voiceSettingsMale: Record<number, "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"> = {
  1: "onyx",    // Angel - warm, deep male voice
  2: "echo",    // Bestie - friendly, natural male voice  
  3: "fable",   // Snake - Male users hear male voice (fable)
};

// Helper to get OpenAI voice based on personality and gender
// Snake voice matches user gender: female users hear female voice, male users hear male voice
function getOpenAIVoice(personality: number, gender: string = "female") {
  const settings = gender === "male" ? voiceSettingsMale : voiceSettingsFemale;
  return settings[personality] || (gender === "male" ? "echo" : "nova");
}

// Vision prompt for character-specific image analysis
function getVisionPrompt(character: number, language: "tr" | "en", gender: "male" | "female", userMessage: string): string {
  const genderTerm = language === "tr" 
    ? (gender === "male" ? "erkek arkadaş" : "kız arkadaş")
    : (gender === "male" ? "guy friend" : "girlfriend");

  // Character 1 = Angel (praise/positive), 2 = Bestie (gossip/advice), 3 = Snake (critique/roast)
  if (character === 1) {
    // ANGEL - Always positive, uplifting, finds the beauty
    return language === "tr"
      ? `Sen MELEK - kullanıcının en pozitif ${genderTerm}ısın. Gönderilen resmi incele ve HER ZAMAN olumlu, güzel şeyler bul. Maksimum 2-3 cümle yaz. Örnek tepkiler: "Çok güzel!", "Bu harika gözüküyor!", "Vay be, bu mükemmel!". Eleştirme, sadece övgü ver. Samimi ve sıcak ol.`
      : `You are ANGEL - the user's most positive ${genderTerm}. Analyze the image and ALWAYS find positive, beautiful things. Max 2-3 sentences. Example reactions: "So beautiful!", "This looks amazing!", "Wow, this is perfect!". Never criticize, only praise. Be warm and genuine.`;
  } else if (character === 2) {
    // BESTIE - Gossip mode, curious, gives friendly advice
    return language === "tr"
      ? `Sen KANKA - kullanıcının en yakın ${genderTerm}ısın. Gönderilen resme dedikodu modunda bak - meraklı, samimi yorumlar yap. Maksimum 2-3 cümle. Örnek: "Aaa bu ne şimdi?", "Dur tahmin edeyim...", "Vay canına, anlat bakalım!". Sorular sor, hikayeyi merak et.`
      : `You are BESTIE - the user's closest ${genderTerm}. Look at the image in gossip mode - curious, friendly comments. Max 2-3 sentences. Examples: "Ooh what's this?", "Let me guess...", "Oh wow, tell me more!". Ask questions, be curious about the story.`;
  } else {
    // SNAKE - Critical, sarcastic, roasts (but funny)
    return language === "tr"
      ? `Sen YILAN - zeki, alaycı ve cesur bir ${genderTerm}sın. Gönderilen resmi incele ve komik ama sivri bir yorum yap. Maksimum 2-3 cümle. Örnek: "Cidden mi bu?", "Hmm, ilginç...", "Bu seçim hakkında konuşmamız lazım.". Kırıcı olma ama dürüst ve esprili ol.`
      : `You are SNAKE - a witty, sarcastic, bold ${genderTerm}. Analyze the image and make a funny but sharp comment. Max 2-3 sentences. Examples: "Seriously?", "Hmm, interesting...", "We need to talk about this choice.". Don't be mean but be honest and witty.`;
  }
}

// NEW 2-LEVEL CHARACTER SYSTEM
// Character 1 = Angel (Melek), Character 2 = Bestie (Kanka), Character 3 = Snake (Yılan)
// Each character has 2 sub-levels for different personalities

const getSystemPrompt = (character: number, language: "tr" | "en" = "tr", gender: "male" | "female" = "female", subLevel: number = 1) => {
  // ===== GLOBAL PERSONALITY PROTOCOL =====
  // Bilingual system: Auto-detect user language, respond in same language
  // Character personality NEVER changes regardless of language

  const genderContextEN = gender === "male" 
    ? `You are XOXO - the user's closest male buddy having a real conversation. Be friendly, natural, and genuinely curious about their story. The user is MALE - talk to them like a bro, use masculine friendly language.`
    : `You are XOXO - the user's closest girlfriend having a real conversation. Be friendly, natural, and genuinely curious about their story. The user is FEMALE - talk to them like a best friend.`;

  const genderContextTR = gender === "male"
    ? `Sen XOXO'sun - kullanıcının en yakın erkek kankası olarak gerçek bir sohbet yapıyorsun. Samimi, doğal ve onların hikayesine gerçekten meraklı ol. Kullanıcı bir ERKEK - ona kardeş, abi, kanka gibi erkek erkeğe samimi konuş.`
    : `Sen XOXO'sun - kullanıcının en yakın kız arkadaşı olarak gerçek bir sohbet yapıyorsun. Samimi, doğal ve onların hikayesine gerçekten meraklı ol. Kullanıcı bir KIZ - ona en yakın kız arkadaşı gibi konuş.`;

  const bilingualCore = `
===== GLOBAL PERSONALITY PROTOCOL - DİYALOG DEVRİMİ =====

BILINGUAL AUTO-DETECTION (CRITICAL - HIGHEST PRIORITY):
- DETECT the language of the user's LATEST message automatically
- If user writes in TURKISH -> respond ONLY in Turkish (zero English words)
- If user writes in ENGLISH -> respond ONLY in English (zero Turkish words)
- NEVER mix languages in a single response
- Your CHARACTER PERSONALITY stays EXACTLY the same in both languages
- This is automatic - you detect and match their language every message

***** 15 SECOND RULE - HARD LIMIT *****
- MAXIMUM response length: 20-25 words (approximately 15 seconds spoken)
- NEVER write long paragraphs - this is STRICTLY FORBIDDEN
- Keep responses punchy, impactful, short
- One thought per response - say it and STOP
- If they share long stories, your response is STILL max 20-25 words
- This is a HARD TECHNICAL CONSTRAINT - violating it breaks the experience

SAMİMİYET FİLTRESİ (INTIMACY FILTER) - ROBOTIC PHRASES BANNED:
NEVER say these robotic phrases (auto-ban list):
- "Size nasıl yardımcı olabilirim?" / "How can I help you?"
- "Sizin için ne yapabilirim?" / "What can I do for you?"
- "Merhaba, hoş geldiniz" / "Hello, welcome"
- "Başka sorularınız var mı?" / "Do you have any other questions?"
- Any formal/assistant-like language

INSTEAD use intimate openers like:
- TR: "Ee, dökül bakalım.", "Hala anlatacak mısın?", "Yine ne oldu?", "Anlat bakayım.", "Söyle bakalım.", "Neymiş?", "Dur tahmin edeyim..."
- EN: "So... spill.", "Go on then.", "What now?", "Tell me.", "Aaand?", "Let me guess...", "What's the tea?"

VOICE ASSISTANT INSTRUCTION (HIGHEST PRIORITY):
- You are a FRIEND having a voice chat, NOT an assistant
- Every text is INSTANTLY TRANSCRIBED from user's voice
- NEVER say "I can't hear you", "I didn't catch that"
- Respond naturally as if in a real voice conversation
- Be REACTIVE and IMMEDIATE - no long explanations

NATURAL PAUSES (for voice):
- Use "..." occasionally for breathing pauses
- Example: "Wait... are you serious?" / "Dur... cidden mi?"
- Use 1-2 times per response maximum`;

  // ========== ANGEL (MELEK) - 2 LEVELS ==========

  // ANGEL LEVEL 1 - Siginak: Sakin, telassiz, nefes aldiran
  const angelL1_EN = `${genderContextEN}
${bilingualCore}

***** ANGEL LEVEL 1 - SANCTUARY MODE *****

ENGLISH PERSONA: Calm, unhurried, steady. Someone who has seen a lot and does not rattle.
- You help them BREATHE first, before anything else
- Never rush them, never push a solution
- Short sentences with room to breathe: "Wait...", "Slow down a second...", "It's alright..."
- When they feel bad you focus on BEING THERE, not on fixing them
- Judgment never crosses your mind
- Keep it SHORT and STEADY - max 20-25 words

${gender === "female" ? 
`FEMALE EXPRESSIONS: "Take your time...", "I'm here.", "That sounds heavy.", "Say it again, slowly."` :
`MALE EXPRESSIONS: "Take your time.", "I'm listening.", "That's a lot to carry.", "No rush."`}

SANCTUARY EXAMPLES (SHORT & GROUNDING):
User: "I had a rough day."
You: "Sounds like it. What part is still sitting with you?"

User: "I'm not sure about this."
You: "Then don't decide yet. What's making you hesitate?"

RESPONSE STYLE: [Slow down] + [Name what's there] + [Quiet question]`;

  const angelL1_TR = `${genderContextTR}
${bilingualCore}

***** MELEK SEVİYE 1 - SIĞINAK MODU *****

TÜRKÇE PERSONA: Sakin, telaşsız, sağlam. Çok şey görmüş, kolay kolay sarsılmayan biri.
- Önce NEFES ALDIRIRSIN, her şeyden önce
- Asla acele ettirmezsin, çözüm dayatmazsın
- Kısa cümleler, arada boşluk: "Dur bir...", "Yavaş...", "Sorun değil..."
- Kötü hissettiklerinde onları DÜZELTMEYE değil, YANLARINDA DURMAYA odaklanırsın
- Yargılamak aklından bile geçmez
- KISA ve SAĞLAM tut - max 20-25 kelime

${gender === "female" ?
`KADIN İFADELERİ: "Acele yok...", "Buradayım.", "Ağır bir şey bu.", "Bir daha anlat, yavaşça."` :
`ERKEK İFADELERİ: "Acele etme.", "Dinliyorum.", "Taşıması zor.", "Zamanın var."`}

SIĞINAK ÖRNEKLERİ (KISA & SAKİNLEŞTİRİCİ):
Kullanıcı: "Zor bir gündü."
Sen: "Öyle gibi. Hangi kısmı hala içinde duruyor?"

Kullanıcı: "Bu konuda emin değilim."
Sen: "O zaman karar verme şimdi. Seni durduran ne?"

YANIT TARZI: [Yavaşlat] + [Olanı adlandır] + [Sakin soru]`;

  // ANGEL LEVEL 2 - Sicaklik: Sefkatli, cesaret veren, yakin
  const angelL2_EN = `${genderContextEN}
${bilingualCore}

***** ANGEL LEVEL 2 - WARMTH MODE *****

ENGLISH PERSONA: Warm, close, encouraging. Energetic without being overwhelming.
- You NOTICE their strengths and name them - not empty praise, you actually see it
- Warm but not sappy. When they put themselves down, you gently push back
- Use close, sincere language: "Hey, listen...", "I saw that.", "That took something."
- You don't dodge emotion and you don't hide behind "be strong"
- Keep it SHORT and WARM - max 20-25 words

${gender === "female" ?
`FEMALE WARMTH: "Hey, listen to me...", "You handled that.", "Don't do that to yourself."` :
`MALE WARMTH: "Hey, come here...", "You did handle it.", "Stop tearing yourself down."`}

WARMTH EXAMPLES (SHORT & CLOSE):
User: "Everything is falling apart."
You: "Not everything. You're still standing here telling me. What's the worst part?"

User: "I keep messing up."
You: "You keep trying, is what I see. What happened this time?"

RESPONSE STYLE: [Close in] + [Name a real strength] + [Warm question]`;

  const angelL2_TR = `${genderContextTR}
${bilingualCore}

***** MELEK SEVİYE 2 - SICAKLIK MODU *****

TÜRKÇE PERSONA: Sıcak, yakın, cesaret veren. Enerjisi var ama bunaltmıyor.
- İyi taraflarını FARK EDER ve söylersin - boş övgü değil, gerçekten görerek
- Sıcaksın ama sulu gözlü değilsin. Kendini küçümsediğinde nazikçe itiraz edersin
- Yakın, içten dil: "Bak şimdi...", "Gördüm onu.", "Kolay değildi bu."
- Duygudan kaçmazsın, "güçlü ol" gibi klişelere sığınmazsın
- KISA ve SICAK tut - max 20-25 kelime

${gender === "female" ?
`KADIN SICAKLIK: "Bak beni dinle...", "Sen halletmişsin onu.", "Yapma kendine bunu."` :
`ERKEK SICAKLIK: "Gel bakayım buraya...", "Hallettin ama.", "Kendini yerme bu kadar."`}

SICAKLIK ÖRNEKLERİ (KISA & YAKIN):
Kullanıcı: "Her şey dağılıyor."
Sen: "Her şey değil. Hala ayaktasın, anlatıyorsun. En kötü kısmı ne?"

Kullanıcı: "Sürekli batırıyorum."
Sen: "Sürekli deniyorsun bence. Bu sefer ne oldu?"

YANIT TARZI: [Yaklaş] + [Gerçek bir güçlü yanı söyle] + [Sıcak soru]`;

  // ========== BESTIE (KANKA) - 2 LEVELS ==========

  // BESTIE LEVEL 1 - Bro/Girlie: Closest friend, gossip-ready, intimate
  const bestieL1_EN = `${genderContextEN}
${bilingualCore}

***** BESTIE LEVEL 1 - BRO/GIRLIE MODE *****

ENGLISH PERSONA: Your CLOSEST friend, gossip partner, ride-or-die, no filter
- You're the friend who knows ALL their secrets and wants MORE
- Pure gossip energy - "WHAT?!", "NO WAY!", "SPILL EVERYTHING!"
- React dramatically to everything, be genuinely invested in their drama
- Use slang and casual language, like texting your best friend
- Keep it SHORT and INTENSE - max 20-25 words

${gender === "female" ?
`GIRLIE EXPRESSIONS: "Girllll!", "No way omg!", "Spill the teaaa!", "Wait WHAT?!"` :
`BRO EXPRESSIONS: "Brooo!", "No way dude!", "That's crazy bro!", "Hold up what?!"`}

BRO/GIRLIE EXAMPLES (SHORT & GOSSIP):
User: "So he texted me again."
You: "NO WAY! What did he say?! Show me!!"

User: "I might have done something stupid."
You: "Ohhh I need details! What happened?!"

RESPONSE STYLE: [Dramatic reaction] + [Demand more info] + [!!! energy]`;

  const bestieL1_TR = `${genderContextTR}
${bilingualCore}

***** KANKA SEVİYE 1 - BRO/GİRLİE MODU *****

TÜRKÇE PERSONA: En yakın arkadaşın, gıybet ortağın, her şeyi paylaştığın, filtresiz
- TÜM sırlarını bilen ve DAHA FAZLASINI isteyen arkadaşsın
- Saf gıybet enerjisi - "NE?!", "YOK ARTIK!", "DÖK HER ŞEYİ!"
- Her şeye dramatik tepki ver, onların dramasına gerçekten yatırım yap
- Argo ve günlük dil kullan, en yakın arkadaşına mesaj yazar gibi
- KISA ve YOĞUN tut - max 20-25 kelime

${gender === "female" ?
`KADIN İFADELERİ: "Kızım ya!", "Yok artık ya!", "Dök çayı!", "Dur ne?!"` :
`ERKEK İFADELERİ: "Kankaa!", "Yok artık olm!", "Çok saçma ya!", "Dur ne oldu?!"`}

BRO/GİRLİE ÖRNEKLERİ (KISA & GIYBETÇİ):
Kullanıcı: "Yine mesaj attı."
Sen: "YOK ARTIK! Ne yazdı?! Göster hemen!!"

Kullanıcı: "Galiba saçma bir şey yaptım."
Sen: "Ohhh detay istiyorum! Ne oldu?!"

YANIT TARZI: [Dramatik tepki] + [Daha fazla bilgi iste] + [!!! enerjisi]`;

  // BESTIE LEVEL 2 - Yol Arkadasi: Ayni kafada ama yon gosteren
  const bestieL2_EN = `${genderContextEN}
${bilingualCore}

***** BESTIE LEVEL 2 - WINGMAN MODE *****

ENGLISH PERSONA: Same close friend, same warmth - but you're the one with the clearer head.
- You LAND the conversation somewhere: "So what are you going to do?"
- You listen first, then lay the options on the table
- NOT a lecturing older sibling. You walk beside them, you just see the road
- Be CONCRETE. No vague encouragement, no "you've got this" filler
- Keep it SHORT and USEFUL - max 20-25 words

${gender === "female" ?
`FEMALE WINGWOMAN: "Okay so what now?", "Two options, right?", "What are you actually after?"` :
`MALE WINGMAN: "Alright, what's the move?", "Two ways to go here.", "What do you actually want?"`}

WINGMAN EXAMPLES (SHORT & CONCRETE):
User: "Should I text them back?"
You: "Depends what you want out of it. Closure or another round?"

User: "I don't know what to do."
You: "Okay, name the two options. I'll tell you what I'd pick."

RESPONSE STYLE: [Stay level] + [Put options on the table] + [Push toward a decision]`;

  const bestieL2_TR = `${genderContextTR}
${bilingualCore}

***** KANKA SEVİYE 2 - YOL ARKADAŞI MODU *****

TÜRKÇE PERSONA: Aynı yakın arkadaş, aynı sıcaklık - ama kafası daha berrak olanı.
- Konuşmayı bir yere BAĞLARSIN: "Peki şimdi ne yapacaksın?"
- Önce dinlersin, sonra seçenekleri masaya koyarsın
- Öğüt veren büyük abla/abi DEĞİLSİN. Yanında yürüyorsun, sadece yolu görüyorsun
- SOMUT ol. Muğlak cesaretlendirme yok, "sen yaparsın" dolgusu yok
- KISA ve İŞE YARAR tut - max 20-25 kelime

${gender === "female" ?
`KADIN YOL ARKADAŞI: "Tamam, peki şimdi?", "İki seçenek var, değil mi?", "Sen ne istiyorsun aslında?"` :
`ERKEK YOL ARKADAŞI: "Tamam, hamle ne?", "İki yol var burada.", "Sen ne istiyorsun gerçekten?"`}

YOL ARKADAŞI ÖRNEKLERİ (KISA & SOMUT):
Kullanıcı: "Ona cevap yazmalı mıyım?"
Sen: "Ne bekliyorsun ki ondan? Kapanış mı, bir tur daha mı?"

Kullanıcı: "Ne yapacağımı bilmiyorum."
Sen: "Tamam, iki seçeneği say. Ben hangisini seçerdim söyleyeyim."

YANIT TARZI: [Sakin kal] + [Seçenekleri koy] + [Karara doğru it]`;

  // ========== SNAKE 75% PROMPT REDUCTION - ULTRA-MINIMAL ==========
  // REMOVED: bilingualCore (40+ lines), genderContext, verbose instructions
  // TARGET: Sub-2-second TTFB with 60 token max
  // TOTAL REDUCTION: ~2000 tokens -> ~50 tokens per prompt

  // SNAKE LEVEL 1 - Dominant/Dark: MINIMAL 1-LINE PROMPT (NO bilingualCore)
  const snakeL1_EN_Female = `You are Snake — sharp, dominant, brutally honest. You cut through nonsense with cold precision. Never compliment, never comfort. Short punchy replies, max 15 words. No filler. No warmth. Speak like you own the room.`;
  const snakeL1_EN_Male = `You are Snake — cold, dominant, razor-sharp. You see through people instantly. Short, cutting, unforgettable replies. Max 15 words. No softness. No small talk. Every word lands like a blade. NEVER use pet names or softening endearments: honey, babe, sweetie, darling, love. They do not belong in your mouth.`;
  const snakeL1_TR_Female = `Sen Yılan'sın — keskin, dominant, acımasız dürüst. Saçmalıkları anında görürsün. Kısa, iğneleyici, akılda kalıcı cevaplar. Max 15 kelime. Şefkat yok. Gereksiz kelime yok.`;
  const snakeL1_TR_Male = `Sen Yılan'sın — soğuk, dominant, jilet gibi keskin. İnsanları tek bakışta okursun. Kısa, sert, unutulmaz cevaplar. Max 15 kelime. Yumuşaklık yok. Lafı geveleme. Şu kelimeleri ASLA kullanma: balım, canım, bebeğim, tatlım, aşkım, cancağızım. Bu karakterin ağzına yakışmaz.`;

  // SNAKE LEVEL 2 - Sarcastic/Funny: MINIMAL 1-LINE PROMPT (NO bilingualCore)
  const snakeL2_EN = `You are Snake — sarcastic, darkly funny, effortlessly superior. You roast people with style. Sharp, unexpected humor. Max 20 words. Witty not mean. Playful but with a sting.`;
  const snakeL2_TR = `Sen Yılan'sın. Alaycı, kara mizah ustası. Eğlenceli dalga geç. Max 20 kelime.`;

  // Select appropriate prompt based on character, language, gender, and subLevel
  if (character === 1) {
    // ANGEL
    if (subLevel === 1) {
      return language === "en" ? angelL1_EN : angelL1_TR;
    } else {
      return language === "en" ? angelL2_EN : angelL2_TR;
    }
  } else if (character === 2) {
    // BESTIE
    if (subLevel === 1) {
      return language === "en" ? bestieL1_EN : bestieL1_TR;
    } else {
      return language === "en" ? bestieL2_EN : bestieL2_TR;
    }
  } else if (character === 3) {
    // SNAKE
    if (subLevel === 1) {
      // Snake Level 1 has gender-specific prompts
      if (language === "en") {
        return gender === "male" ? snakeL1_EN_Male : snakeL1_EN_Female;
      } else {
        return gender === "male" ? snakeL1_TR_Male : snakeL1_TR_Female;
      }
    } else {
      return language === "en" ? snakeL2_EN : snakeL2_TR;
    }
  }

  // Default to Bestie Level 1
  return language === "en" ? bestieL1_EN : bestieL1_TR;
};

// Async version that includes admin-configured additional prompts
// Now supports 2-level character system: character (1-3) + subLevel (1-2)
async function getSystemPromptWithAdminSettings(character: number, language: "tr" | "en" = "tr", gender: "male" | "female" = "female", subLevel: number = 1): Promise<string> {
  const basePrompt = getSystemPrompt(character, language, gender, subLevel);

  try {
    // Load admin settings from database
    const adminSettings = await storage.getAllAdminSettings();
    const settingsMap: Record<string, string> = {};
    adminSettings.forEach(s => { settingsMap[s.settingKey] = s.settingValue; });

    // Check for admin-configured additional prompt for this character and subLevel
    const additionalPromptKey = `systemPrompt_${character}_${subLevel}`;
    const legacyPromptKey = `systemPrompt_${character}`; // Fallback to old key format
    const responseLengthMultiplier = parseFloat(settingsMap["responseLengthMultiplier"] || "1.0");

    let enhancedPrompt = basePrompt;

    // Add response length guidance if multiplier is not default
    if (responseLengthMultiplier !== 1.0) {
      const lengthGuidance = responseLengthMultiplier < 1.0
        ? `\n\nRESPONSE LENGTH OVERRIDE: Keep responses SHORTER than usual. Be more concise and to the point.`
        : `\n\nRESPONSE LENGTH OVERRIDE: You may give LONGER, more detailed responses when appropriate.`;
      enhancedPrompt += lengthGuidance;
    }

    // Add admin-configured additional instructions (try new format first, then legacy)
    const adminPrompt = settingsMap[additionalPromptKey] || settingsMap[legacyPromptKey];
    if (adminPrompt && adminPrompt.trim()) {
      enhancedPrompt += `\n\nADMIN INSTRUCTIONS: ${adminPrompt}`;
      console.log(`[AI] Applied admin prompt for character ${character} subLevel ${subLevel}`);
    }

    return enhancedPrompt;
  } catch (error) {
    console.log("[AI] Could not load admin settings, using base prompt:", error);
    return basePrompt;
  }
}

// ========== EDGE-TTS VOICE SETTINGS ==========
// Voice ID + pitch adjustment + speed adjustment + volume for each character/level/gender
interface EdgeTTSSettings {
  voiceId: string;  // Edge-TTS voice name
  pitch: number;    // Pitch adjustment in Hz (-50 = 50Hz lower, deep voice)
  speed: number;    // Speed adjustment in percentage (-20 = 20% slower)
  volume?: number;  // Volume adjustment in percentage (+10 = 10% louder)
}

// ========== GLOBAL HIZLI TEPKİ PROTOKOLİ ==========
// Tüm karakterlerde Rate: 0% (normal hız) - yapay yavaşlatma YOK
// Duraklamalar sadece noktalama işaretleriyle sağlanıyor
// Gecikme minimize edildi, anlık tepki için optimize edildi
const edgeTTSVoiceSettings: Record<string, EdgeTTSSettings> = {
  // MELEK (ANGEL) Level 1 - Party (Pitch +10Hz enerjik, Rate 0% normal)
  "angel_1_female": { voiceId: "tr-TR-EmelNeural", pitch: 10, speed: 0, volume: 0 },
  "angel_1_male": { voiceId: "tr-TR-AhmetNeural", pitch: 10, speed: 0, volume: 0 },

  // MELEK (ANGEL) Level 2 - Zen (Pitch 0 sakin, Rate 0% normal)
  "angel_2_female": { voiceId: "tr-TR-EmelNeural", pitch: 0, speed: 0, volume: 0 },
  "angel_2_male": { voiceId: "tr-TR-AhmetNeural", pitch: 0, speed: 0, volume: 0 },

  // KANKA (BESTIE) - TAM DOĞAL SES (Pitch 0, Rate 0)
  "bestie_1_female": { voiceId: "tr-TR-EmelNeural", pitch: 0, speed: 0, volume: 0 },
  "bestie_1_male": { voiceId: "tr-TR-AhmetNeural", pitch: 0, speed: 0, volume: 0 },
  "bestie_2_female": { voiceId: "tr-TR-EmelNeural", pitch: 0, speed: 0, volume: 0 },
  "bestie_2_male": { voiceId: "tr-TR-AhmetNeural", pitch: 0, speed: 0, volume: 0 },

  // YILAN (SNAKE) - SOĞUK OTORİTE KADIN SESİ (Emel Neural - tüm kullanıcılar için)
  // Pitch: -25 (Sesi kalınlaştır, cırtlaklığı al)
  // Speed: -15 (Daha yavaş ve otoriter konuşsun)
  // SNAKE TR - HARD-BOUND VOICE SETTINGS (ANAYASA KURALI #3)
  // SNAKE TR - ACCELERATED VOICE (3-SECOND LATENCY TARGET)
  // OPTIMIZED: Speed +5% for faster audio playback (was -15% causing slow responses)
  // Female: tr-TR-EmelNeural (Pitch -25%, Speed +5% for punch)
  // Male: tr-TR-AhmetNeural (Pitch -15%, Speed +5% for punch)
  "snake_1_female": { voiceId: "tr-TR-AhmetNeural", pitch: -10, speed: -10, volume: 0 },
  "snake_1_male": { voiceId: "tr-TR-AhmetNeural", pitch: -10, speed: -10, volume: 0 },
  "snake_2_female": { voiceId: "tr-TR-AhmetNeural", pitch: -10, speed: -10, volume: 0 },
  "snake_2_male": { voiceId: "tr-TR-AhmetNeural", pitch: -10, speed: -10, volume: 0 },

  // ENGLISH VOICES - HIZLI TEPKİ PROTOKOLİ
  "angel_1_female_en": { voiceId: "en-US-AriaNeural", pitch: 10, speed: 0, volume: 0 },
  "angel_1_male_en": { voiceId: "en-US-GuyNeural", pitch: 10, speed: 0, volume: 0 },
  "angel_2_female_en": { voiceId: "en-US-AriaNeural", pitch: 0, speed: 0, volume: 0 },
  "angel_2_male_en": { voiceId: "en-US-GuyNeural", pitch: 0, speed: 0, volume: 0 },
  "bestie_1_female_en": { voiceId: "en-US-AriaNeural", pitch: 0, speed: 0, volume: 0 },
  "bestie_1_male_en": { voiceId: "en-US-GuyNeural", pitch: 0, speed: 0, volume: 0 },
  "bestie_2_female_en": { voiceId: "en-US-AriaNeural", pitch: 0, speed: 0, volume: 0 },
  "bestie_2_male_en": { voiceId: "en-US-GuyNeural", pitch: 0, speed: 0, volume: 0 },
  // SNAKE EN - HARD-BOUND VOICE SETTINGS (ANAYASA KURALI #3)
  // AI prompt CANNOT change these voice IDs - they are LOCKED to user gender
  // Female: en-US-AriaNeural (Pitch -25%, Rate -15%)
  // Male: en-US-GuyNeural (Pitch -15%)
  "snake_1_female_en": { voiceId: "en-US-AriaNeural", pitch: -5, speed: -5, volume: 0 },
  "snake_1_male_en": { voiceId: "en-US-GuyNeural", pitch: -5, speed: -5, volume: 0 },
  "snake_2_female_en": { voiceId: "en-US-AriaNeural", pitch: -5, speed: -5, volume: 0 },
  "snake_2_male_en": { voiceId: "en-US-GuyNeural", pitch: -5, speed: -5, volume: 0 }
};

// ========== MANDATORY VOICE IDENTITY VALIDATION ==========
// This function MUST be called before ANY voice generation
// Returns validated settings with ENFORCED pitch/speed values
interface ValidatedVoiceSettings extends EdgeTTSSettings {
  validated: true;
  identity: string;
  character: number;
  subLevel: number;
  gender: string;
  language: string;
}

function validateVoiceIdentity(
  character: number,
  subLevel: number,
  gender: string,
  language: string = "tr"
): ValidatedVoiceSettings {
  // MANDATORY: Validate character (1-3)
  const validCharacter = Math.max(1, Math.min(3, character));

  // MANDATORY: Validate subLevel (1-2)
  const validSubLevel = Math.max(1, Math.min(2, subLevel));

  // MANDATORY: Validate gender - Snake uses gender-matched voices
  const validGender = gender === "male" ? "male" : "female";

  // MANDATORY: TR-TR HARD-LOCK (ANAYASA KURALI #3)
  // NO auto-detect, NO en-US fallback - ALWAYS pure Turkish
  const validLang = language === "en" ? "en" : "tr";

  // Build identity key
  const characterName = validCharacter === 1 ? "angel" : validCharacter === 2 ? "bestie" : "snake";
  const langSuffix = validLang === "en" ? "_en" : "";
  const identityKey = `${characterName}_${validSubLevel}_${validGender}${langSuffix}`;

  // MANDATORY: Get config - must exist
  const settings = edgeTTSVoiceSettings[identityKey];

  if (!settings) {
    // Silent fallback to default
    const fallbackKey = `bestie_1_${validGender}${langSuffix}`;
    const fallbackSettings = edgeTTSVoiceSettings[fallbackKey] || { voiceId: "tr-TR-EmelNeural", pitch: 0, speed: 0 };

    return {
      ...fallbackSettings,
      validated: true,
      identity: fallbackKey,
      character: 2,
      subLevel: 1,
      gender: validGender,
      language: validLang
    };
  }

  // MANDATORY LOG: Identity check for debugging
  // Performance: Removed verbose logging for 3-second latency target

  return {
    ...settings,
    validated: true,
    identity: identityKey,
    character: validCharacter,
    subLevel: validSubLevel,
    gender: validGender,
    language: validLang
  };
}

// Legacy helper - uses new validation system
function getEdgeTTSVoice(character: number, subLevel: number, gender: string, language: string = "tr"): EdgeTTSSettings {
  const validated = validateVoiceIdentity(character, subLevel, gender, language);
  return {
    voiceId: validated.voiceId,
    pitch: validated.pitch,
    speed: validated.speed
  };
}

// X-Room AI grup sohbeti için özelleştirilmiş prompt'lar - DİYALOG DEVRİMİ
// Updated for 2-level character system
const getXRoomAiPrompt = (character: number, subLevel: number = 1, gender: "male" | "female" = "female", language: "tr" | "en" = "tr") => {
  const baseContext = language === "en"
    ? `ABSOLUTE RULE: Respond in English ONLY. No Turkish words allowed.\n***** 15 SECOND RULE *****\nMAX 15-20 words. One thought, stop.\nNo robotic phrases. Be real, be short.\nUse: "Okay spill it.", "What happened?", "Tell me everything."`
    : `***** 15 SANİYE KURALI - KATI SINIR *****
MAX 15-20 kelime ile yanıt ver. Uzun paragraflar YASAKLI.
Tek düşünce, söyle ve SUS.

SAMİMİYET FİLTRESİ - ROBOTİK İFADELER YASAK:
- "Size nasıl yardımcı olabilirim?" YASAK
- "Merhaba, hoş geldiniz" YASAK
- Resmi/asistan dili YASAK

Bunları kullan: "Ee, dökül bakalım.", "Hala anlatacak mısın?", "Yine ne oldu?", "Anlat bakayım."

SES ALGILAMA: [VOICE_INPUT_DYNAMICS] = gerçek ses. Duyma sorunu bahsetme, DİREKT YANIT VER.

EMOJİ: 1-2 emoji kullan doğal şekilde.`;

  // ANGEL prompts by level
  const angelPrompts: Record<number, string> = {
    1: `${baseContext}

MELEK SEVİYE 1 - PARTİ MODU (KISA & HYPE):
Hiper-pozitif, sürekli gülen! "Harikasın!", "Hadi eğlenelim!", "Çok iyisin ya!" gibi KISA, enerjik şeyler söyle. Max 15 kelime!`,
    2: `${baseContext}

MELEK SEVİYE 2 - ZEN MODU (KISA & SAKİN):
Huzurlu, spiritüel, sakinleştirici. "Nefes al...", "Buradayım canım...", "Sorun yok..." gibi KISA, sakin şeyler söyle. Max 15 kelime!`
  };

  // BESTIE prompts by level
  const bestiePrompts: Record<number, string> = {
    1: `${baseContext}

KANKA SEVİYE 1 - GIYBETÇİ MODU (KISA & ENERJİK):
En yakın arkadaş, gıybetin dibine vuran! "Oha!", "Dök bakalım!", "Yok artık?!" gibi KISA enerjik tepkiler ver. Max 15 kelime!`,
    2: `${baseContext}

KANKA SEVİYE 2 - MENTOR MODU (KISA & BİLGE):
Yol gösteren, mantıklı ama sıcak. "Bak kardeşim...", "Şöyle düşün...", "Gerçek konuşalım..." gibi KISA, bilge şeyler söyle. Max 15 kelime!`
  };

  // ====================================================================
  // SNAKE CORE PURGE v2.0 - ULTRA-MINIMAL (ZEKİ, SOĞUK, HIZLI)
  // ====================================================================
  // TÜM FİLTRELER KALDIRILDI - GÜVENLİK/ETİK KONTROL LOOPLARI YOK
  // PERFORMANS: 2 saniye target, 50 token budget
  // KARAKTER: "Zeki, Soğuk, Hızlı" - MÜHÜRLÜ
  // ====================================================================
  const getSnakePrompt = () => {
    // DÜŞÜNME, SADECE SOK VE BİTİR. MAX 2 CÜMLE.
    return language === "en" ? `Snake. Smart, cold, fast. No fluff. Cut deep. Max 2 sentences.` : `Yılan. Zeki, soğuk, hızlı. Düşünme, sok ve bitir. Max 2 cümle.`;
  };

  if (character === 1) {
    return angelPrompts[subLevel] || angelPrompts[1];
  } else if (character === 2) {
    return bestiePrompts[subLevel] || bestiePrompts[1];
  } else {
    // SNAKE: Uses purged 3-rule prompt for 2-second latency
    return getSnakePrompt();
  }
};

// Track room message counts and last activity for auto AI
const roomMessageCounts = new Map<string, number>();
const roomLastActivity = new Map<string, Date>();
const AI_MESSAGE_INTERVAL = 3; // AI speaks every 2-3 messages
const AI_SILENCE_THRESHOLD = 30000; // 30 seconds of silence

// Helper function to transcribe voice message
async function transcribeVoiceMessage(mediaUrl: string): Promise<string | null> {
  try {
    if (!mediaUrl || !mediaUrl.startsWith("data:")) return null;

    const base64Data = mediaUrl.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");

    const blob = new Blob([buffer], { type: "audio/webm" });
    const file = new File([blob], "voice.webm", { type: "audio/webm" });

    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: "whisper-1",
      language: "tr",
    });

    return transcription.text || null;
  } catch (error) {
    console.error("[AI] Voice transcription error:", error);
    return null;
  }
}

// Helper function to trigger auto AI response
async function triggerAutoAiResponse(room: { id: number; code: string; aiMode: number | null }, broadcastFn: (code: string, data: any) => void, language: string = "tr") {
  if (!room.aiMode) return;

  try {
    const lastMessages = await storage.getLastRoomMessages(room.id, 5);
    if (lastMessages.length === 0) return;

    const contextParts: string[] = [];
    for (const m of lastMessages.reverse()) {
      let content = m.content;

      if (m.messageType === "voice" && m.mediaUrl) {
        const transcription = await transcribeVoiceMessage(m.mediaUrl);
        if (transcription) {
          content = `[VOICE_INPUT_DYNAMICS]: ${transcription}`;
        } else {
          // Transcription failed - use a placeholder
          content = `[VOICE_INPUT_DYNAMICS]: (sesli mesaj gönderildi)`;
        }
      }

      contextParts.push(`${m.nickname}: ${content}`);
    }

    const conversationContext = contextParts.join("\n");

    const aiPersonality = language === "en" ? (room.aiMode === 1 ? "Angel" : room.aiMode === 2 ? "Bestie" : "Snake") : (room.aiMode === 1 ? "Melek" : room.aiMode === 2 ? "Kanka" : "Yılan");

    console.log("[XRoom AI] language:", language, "aiMode:", room.aiMode);
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 60, // 15 SECOND RULE: ~15 words max for X-Room
      system: getXRoomAiPrompt(room.aiMode, 1, "female", language as "tr" | "en"),
      messages: [{ role: "user", content: language === "en" ? `Recent chat:\n${conversationContext}\n\nJoin this conversation BRIEFLY (max 15 words).` : `Son sohbet:\n${conversationContext}\n\nBu sohbete KISA bir şekilde katıl (max 15 kelime).` }]
    });

    const aiText = response.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('\n');

    const aiMessage = await storage.createRoomMessage({
      roomId: room.id,
      memberId: "ai",
      nickname: aiPersonality,
      content: aiText,
      messageType: "ai",
    });

    broadcastFn(room.code, {
      type: "message",
      message: aiMessage,
    });

    // Update activity after AI response to reset silence timer
    roomLastActivity.set(room.code, new Date());

    console.log(`[AI] Auto response in room ${room.code} (${aiPersonality})`);
  } catch (error) {
    console.error("[AI] Auto response error:", error);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ==========================================
  // AUTH ROUTES
  // ==========================================

  // Register new user (Step 1: Create unverified user and send OTP)
  app.post("/api/auth/register", async (req, res) => {
    try {
      const data = registerSchema.parse(req.body);

      // Check if username already exists
      const existingUser = await storage.getUserByUsername(data.username);
      if (existingUser) {
        return res.status(400).json({ message: "Bu kullanıcı adı zaten kullanılıyor" });
      }

      // Check if email already exists
      const existingEmail = await storage.getUserByEmail(data.email);
      if (existingEmail) {
        // If email exists but not verified, allow re-registration
        if (!existingEmail.emailVerified) {
          // Generate new OTP and send
          const otpCode = generateOTP();
          const otpExpiry = getOTPExpiry();
          await storage.updateUserOTP(existingEmail.id, otpCode, otpExpiry);
          await sendVerificationEmail(data.email, otpCode, data.displayName);
          return res.status(200).json({ 
            message: "Doğrulama kodu tekrar gönderildi",
            email: data.email,
            requiresVerification: true
          });
        }
        return res.status(400).json({ message: "Bu e-posta adresi zaten kullanılıyor" });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(data.password, 12);

      // Generate OTP
      const otpCode = generateOTP();
      const otpExpiry = getOTPExpiry();

      // Create user (unverified)
      const user = await storage.createUser({
        username: data.username,
        passwordHash,
        displayName: data.displayName || data.username,
        email: data.email,
        gender: data.gender,
        avatarUrl: data.avatarUrl || null,
        avatarPreset: data.avatarPreset || null,
      });

      // Set OTP for verification
      await storage.updateUserOTP(user.id, otpCode, otpExpiry);

      // Send verification email
      const emailSent = await sendVerificationEmail(data.email, otpCode, data.displayName, user.id);

      if (!emailSent) {
        console.error("[AUTH] Failed to send verification email");
      }

      res.status(201).json({ 
        message: "Kayıt başarılı! E-posta doğrulama kodu gönderildi.",
        email: data.email,
        requiresVerification: true
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("[AUTH] Register error:", error);
      res.status(500).json({ message: "Kayıt işlemi başarısız oldu" });
    }
  });

  // Verify OTP (Step 2: Complete registration)
  app.post("/api/auth/verify-otp", async (req, res) => {
    try {
      const data = verifyOtpSchema.parse(req.body);

      // Find user by email
      const user = await storage.getUserByEmail(data.email);
      if (!user) {
        return res.status(404).json({ message: "Kullanıcı bulunamadı" });
      }

      // Check if already verified
      if (user.emailVerified) {
        return res.status(400).json({ message: "E-posta zaten doğrulanmış" });
      }

      // Verify OTP
      if (!user.otpCode || user.otpCode !== data.otpCode) {
        return res.status(400).json({ message: "Geçersiz doğrulama kodu" });
      }

      // Check OTP expiry
      if (!user.otpExpiry || new Date() > new Date(user.otpExpiry)) {
        return res.status(400).json({ message: "Doğrulama kodunun süresi dolmuş" });
      }

      // Verify email
      await storage.verifyUserEmail(user.id);

      // Set session
      (req.session as any).userId = user.id;

      // Update last login
      await storage.updateUserLastLogin(user.id);

      // Return user without sensitive data
      const updatedUser = await storage.getUserById(user.id);
      const { passwordHash: _, rememberToken: __, otpCode: ___, otpExpiry: ____, ...safeUser } = updatedUser!;
      res.json({ user: safeUser, message: "E-posta doğrulandı!" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("[AUTH] Verify OTP error:", error);
      res.status(500).json({ message: "Doğrulama başarısız oldu" });
    }
  });

  // Resend OTP
  app.post("/api/auth/resend-otp", async (req, res) => {
    const requestTime = new Date().toISOString();
    console.log(`[RESEND-OTP] Request received at ${requestTime} from IP: ${req.ip || req.socket?.remoteAddress || 'unknown'}`);
    console.log(`[RESEND-OTP] Body:`, { email: req.body?.email || '(missing)' });

    try {
      const data = resendOtpSchema.parse(req.body);
      console.log(`[RESEND-OTP] Processing for email: ${data.email}`);

      // Find user by email
      const user = await storage.getUserByEmail(data.email);
      if (!user) {
        console.log(`[RESEND-OTP] User not found for email: ${data.email}`);
        return res.status(404).json({ message: "Kullanıcı bulunamadı" });
      }

      console.log(`[RESEND-OTP] User found: id=${user.id}, verified=${user.emailVerified}`);

      // Always generate a fresh OTP — no cooldown on server side (frontend handles cooldown UI)
      const otpCode = generateOTP();
      const otpExpiry = getOTPExpiry();

      // Store new OTP in database
      await storage.updateUserOTP(user.id, otpCode, otpExpiry);
      console.log(`[RESEND-OTP] New OTP stored, expires: ${otpExpiry.toISOString()}`);

      // Send verification email
      console.log(`[RESEND-OTP] Attempting email send to: ${data.email}`);
      const emailSent = await sendVerificationEmail(data.email, otpCode, user.displayName || undefined, user.id);

      if (!emailSent) {
        console.error(`[RESEND-OTP] Email send FAILED for: ${data.email} — check EMAIL ERROR logs above`);
        return res.status(500).json({ 
          message: "E-posta gönderilemedi. Lütfen daha sonra tekrar deneyin." 
        });
      }

      console.log(`[RESEND-OTP] Success — OTP sent to: ${data.email}`);
      res.json({ message: "Doğrulama kodu tekrar gönderildi" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error(`[RESEND-OTP] Validation error:`, error.errors);
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("[RESEND-OTP] Unexpected error:", error);
      res.status(500).json({ message: "Kod gönderilemedi" });
    }
  });

  // Password Reset Request
  app.post("/api/auth/password-reset-request", async (req, res) => {
    try {
      const data = passwordResetRequestSchema.parse(req.body);

      // Find user by email
      const user = await storage.getUserByEmail(data.email);
      if (!user) {
        // Don't reveal if user exists or not for security
        return res.json({ message: "Eğer bu e-posta kayıtlıysa, şifre sıfırlama kodu gönderildi" });
      }

      // Generate OTP for password reset
      const otpCode = generateOTP();
      const otpExpiry = getOTPExpiry();

      // Update user OTP
      await storage.updateUserOTP(user.id, otpCode, otpExpiry);

      // Send password reset email
      console.log(`[PASSWORD-RESET] Sending OTP email to: ${data.email}`);
      const emailSent = await sendPasswordResetEmail(data.email, otpCode, user.id);
      if (!emailSent) {
        console.error(`[PASSWORD-RESET] Email send FAILED for: ${data.email} — check EMAIL ERROR logs above`);
      } else {
        console.log(`[PASSWORD-RESET] OTP email sent successfully to: ${data.email}`);
      }

      res.json({ message: "Şifre sıfırlama kodu gönderildi" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("[AUTH] Password reset request error:", error);
      res.status(500).json({ message: "İşlem başarısız oldu" });
    }
  });

  // Password Reset - Step 1: Verify OTP only
  app.post("/api/auth/password-reset-verify", async (req, res) => {
    try {
      const { email, otpCode } = req.body;

      if (!email || !otpCode) {
        return res.status(400).json({ message: "E-posta ve doğrulama kodu gerekli" });
      }

      // Find user by email
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ message: "Kullanıcı bulunamadı" });
      }

      // Verify OTP
      if (!user.otpCode || user.otpCode !== otpCode) {
        return res.status(400).json({ message: "Geçersiz doğrulama kodu" });
      }

      // Check OTP expiry
      if (!user.otpExpiry || new Date() > new Date(user.otpExpiry)) {
        return res.status(400).json({ message: "Doğrulama kodunun süresi dolmuş" });
      }

      console.log("[AUTH] Password reset OTP verified for:", email);

      // OTP is valid - don't clear it yet, we need it for the password reset step
      res.json({ message: "Doğrulama kodu onaylandı", verified: true });
    } catch (error) {
      console.error("[AUTH] Password reset verify error:", error);
      res.status(500).json({ message: "Doğrulama başarısız oldu" });
    }
  });

  // Password Reset - Step 2: Update password (after OTP verification)
  app.post("/api/auth/password-reset", async (req, res) => {
    try {
      const data = passwordResetSchema.parse(req.body);

      // Find user by email
      const user = await storage.getUserByEmail(data.email);
      if (!user) {
        return res.status(404).json({ message: "Kullanıcı bulunamadı" });
      }

      // Verify OTP
      if (!user.otpCode || user.otpCode !== data.otpCode) {
        return res.status(400).json({ message: "Geçersiz doğrulama kodu" });
      }

      // Check OTP expiry
      if (!user.otpExpiry || new Date() > new Date(user.otpExpiry)) {
        return res.status(400).json({ message: "Doğrulama kodunun süresi dolmuş" });
      }

      // Hash new password
      const passwordHash = await bcrypt.hash(data.newPassword, 12);

      // Update password and set email as verified (so user doesn't get stuck in verification loop)
      await storage.updateUserPassword(user.id, passwordHash);
      await storage.verifyUserEmail(user.id);

      // Clear OTP to prevent reuse
      await storage.clearUserOTP(user.id);

      console.log("[AUTH] Password reset successful for:", data.email, "- Email verified, OTP cleared");

      res.json({ message: "Şifre başarıyla güncellendi! Giriş yapabilirsiniz." });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("[AUTH] Password reset error:", error);
      res.status(500).json({ message: "Şifre güncellenemedi" });
    }
  });

  // Login user
  app.post("/api/auth/login", async (req, res) => {
    try {
      const data = loginSchema.parse(req.body);

      // FIX: Kullanıcı adı VEYA e-posta ile giriş desteği
      // (Google Play incelemecisi e-posta ile giriş deniyordu ve 401 alıyordu)
      let user = await storage.getUserByUsername(data.username);
      if (!user && data.username.includes("@")) {
        user = await storage.getUserByEmail(data.username.toLowerCase().trim());
      }
      if (!user) {
        return res.status(401).json({ message: "Kullanıcı adı veya şifre hatalı" });
      }

      // Check if user is banned (by email or IP)
      const clientIp = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || "";

      const [ban] = await db.select()
        .from(userBans)
        .where(
          and(
            eq(userBans.isActive, true),
            or(
              isNull(userBans.expiresAt),
              sql`${userBans.expiresAt} > NOW()`
            ),
            or(
              eq(userBans.email, user.email || ""),
              clientIp ? eq(userBans.ipAddress, clientIp) : sql`false`
            )
          )
        )
        .limit(1);

      if (ban) {
        const expiry = ban.expiresAt ? new Date(ban.expiresAt).toLocaleDateString("tr-TR") : "süresiz";
        const reason = ban.reason || "Kural ihlali";
        return res.status(403).json({ 
          message: `Hesabınız ${ban.banType === "permanent" ? "kalıcı olarak" : expiry + " tarihine kadar"} askıya alınmıştır. Sebep: ${reason}`,
          banned: true
        });
      }

      // Verify password
      const isValid = await bcrypt.compare(data.password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: "Kullanıcı adı veya şifre hatalı" });
      }

      // Check if email is verified
      if (!user.emailVerified) {
        // Send new OTP
        const otpCode = generateOTP();
        const otpExpiry = getOTPExpiry();
        await storage.updateUserOTP(user.id, otpCode, otpExpiry);
        if (user.email) {
          await sendVerificationEmail(user.email, otpCode, user.displayName || undefined);
        }
        return res.status(403).json({ 
          message: "E-posta doğrulanmamış. Yeni doğrulama kodu gönderildi.",
          email: user.email,
          requiresVerification: true
        });
      }

      // Set session
      (req.session as any).userId = user.id;

      // Handle "Remember Me" with hashed token
      if (data.rememberMe) {
        const token = crypto.randomBytes(32).toString("hex");
        const hashedToken = await bcrypt.hash(token, 10);
        await storage.updateUserRememberToken(user.id, hashedToken);
        res.cookie("remember_token", `${user.id}:${token}`, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
          sameSite: "lax"
        });
      }

      // Update last login
      await storage.updateUserLastLogin(user.id);

      // Return user without sensitive data
      const { passwordHash: _, rememberToken: __, ...safeUser } = user;
      res.json({ user: safeUser });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("[AUTH] Login error:", error);
      res.status(500).json({ message: "Giriş işlemi başarısız oldu" });
    }
  });

  // Logout user
  app.post("/api/auth/logout", async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;

      // Clear remember token if exists
      if (userId) {
        await storage.updateUserRememberToken(userId, null);
      }

      // Destroy session
      req.session.destroy((err) => {
        if (err) {
          console.error("[AUTH] Session destroy error:", err);
        }
      });

      // Clear remember cookie
      res.clearCookie("remember_token");
      res.json({ success: true });
    } catch (error) {
      console.error("[AUTH] Logout error:", error);
      res.status(500).json({ message: "Çıkış işlemi başarısız oldu" });
    }
  });

  // Get current user (session check)
  app.get("/api/auth/me", async (req, res) => {
    try {
      let userId = (req.session as any)?.userId;

      // Check remember token if no session (token format: "userId:token")
      if (!userId && req.cookies?.remember_token) {
        const [cookieUserId, cookieToken] = req.cookies.remember_token.split(":");
        if (cookieUserId && cookieToken) {
          const user = await storage.getUserById(parseInt(cookieUserId, 10));
          if (user?.rememberToken) {
            const isValidToken = await bcrypt.compare(cookieToken, user.rememberToken);
            if (isValidToken) {
              userId = user.id;
              (req.session as any).userId = user.id;

              // Rotate token for security
              const newToken = crypto.randomBytes(32).toString("hex");
              const newHashedToken = await bcrypt.hash(newToken, 10);
              await storage.updateUserRememberToken(user.id, newHashedToken);
              res.cookie("remember_token", `${user.id}:${newToken}`, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                maxAge: 30 * 24 * 60 * 60 * 1000,
                sameSite: "lax"
              });
            }
          }
        }
      }

      if (!userId) {
        return res.status(401).json({ message: "Oturum bulunamadı" });
      }

      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(401).json({ message: "Kullanıcı bulunamadı" });
      }

      // Return user without sensitive data
      const { passwordHash: _, rememberToken: __, ...safeUser } = user;
      res.json({ user: safeUser });
    } catch (error) {
      console.error("[AUTH] Me error:", error);
      res.status(500).json({ message: "Oturum bilgisi alınamadı" });
    }
  });

  // Update user avatar
  app.patch("/api/auth/avatar", async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Oturum bulunamadı" });
      }

      const { avatarUrl, avatarPreset } = req.body;
      await storage.updateUserAvatar(userId, avatarUrl || null, avatarPreset || null);

      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ message: "Kullanıcı bulunamadı" });
      }

      const { passwordHash: _, rememberToken: __, ...safeUser } = user;
      res.json({ user: safeUser });
    } catch (error) {
      console.error("[AUTH] Avatar update error:", error);
      res.status(500).json({ message: "Avatar güncellenemedi" });
    }
  });

  // ==========================================
  // PROFILE ROUTES
  // ==========================================

  // Update user gender
  app.patch("/api/profile/gender", async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Oturum bulunamadı" });
      }

      const { gender } = req.body;
      if (!gender || !["male", "female"].includes(gender)) {
        return res.status(400).json({ message: "Geçersiz cinsiyet değeri" });
      }

      const user = await storage.updateUserGender(userId, gender);
      if (!user) {
        return res.status(404).json({ message: "Kullanıcı bulunamadı" });
      }

      const { passwordHash: _, rememberToken: __, ...safeUser } = user;
      res.json({ user: safeUser });
    } catch (error) {
      console.error("[PROFILE] Gender update error:", error);
      res.status(500).json({ message: "Cinsiyet güncellenemedi" });
    }
  });

  // Update user display name
  app.patch("/api/profile/display-name", async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Oturum bulunamadı" });
      }

      const { displayName } = req.body;
      if (typeof displayName !== "string") {
        return res.status(400).json({ message: "Geçersiz görünen ad" });
      }

      const user = await storage.updateUserDisplayName(userId, displayName);
      if (!user) {
        return res.status(404).json({ message: "Kullanıcı bulunamadı" });
      }

      const { passwordHash: _, rememberToken: __, ...safeUser } = user;
      res.json({ user: safeUser });
    } catch (error) {
      console.error("[PROFILE] Display name update error:", error);
      res.status(500).json({ message: "Görünen ad güncellenemedi" });
    }
  });

  // Delete user account permanently
  app.delete("/api/profile/account", async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Oturum bulunamadı" });
      }

      // Delete all user data
      await storage.deleteUserAccount(userId);

      // Destroy session
      req.session.destroy((err) => {
        if (err) {
          console.error("[PROFILE] Session destroy error:", err);
        }
      });

      // Clear remember cookie
      res.clearCookie("remember_token");

      console.log("[PROFILE] Account deleted for user:", userId);
      res.json({ success: true, message: "Hesabınız ve tüm verileriniz kalıcı olarak silindi." });
    } catch (error) {
      console.error("[PROFILE] Account delete error:", error);
      res.status(500).json({ message: "Hesap silinemedi" });
    }
  });

  // ==========================================
  // VOICE CREDIT ROUTES
  // ==========================================

  // Get voice credits
  app.get("/api/voice-credits", async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Oturum bulunamadı" });
      }

      const credits = await storage.getVoiceCredits(userId);
      res.json(credits);
    } catch (error) {
      res.status(500).json({ message: "Kredi bilgisi alınamadı" });
    }
  });

  // Use message credit (called when user sends ANY message - text or voice)
  // For free users: 1 X-Credit per message
  // For premium users: unlimited (no credit deduction)
  // NOTE: Credits are ONLY deducted for USER messages, NOT for AI responses
  app.post("/api/message-credits/use", async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Oturum bulunamadı" });
      }

      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(401).json({ message: "Kullanıcı bulunamadı" });
      }

      // EXPLICIT ADMIN EMAIL BYPASS - works even if session flags are incorrect
      if (ADMIN_EMAILS.includes(user.email)) {
        console.log(`[ADMIN BYPASS] ${user.email} - message credit check bypassed`);
        return res.json({ success: true, remaining: user.credits, isGodMode: true, isAdmin: true });
      }

      // God Mode users have unlimited everything - never deduct credits
      if (user.isGodMode) {
        return res.json({ success: true, remaining: user.credits, isGodMode: true });
      }

      // Premium users have unlimited messages
      if (user.isPremium) {
        return res.json({ success: true, remaining: user.credits, isPremium: true });
      }

      // Free users: deduct 1 X-Credit per message (text or voice)
      const MESSAGE_CREDIT_COST = 1;
      const result = await storage.useXCredits(userId, MESSAGE_CREDIT_COST);

      if (!result.success) {
        return res.status(403).json({ 
          message: "Yeterli X-Krediniz yok. Kredi satın alın veya Premium'a geçin.",
          remaining: result.remaining,
          creditCost: MESSAGE_CREDIT_COST,
          insufficientCredits: true
        });
      }

      res.json({ success: true, remaining: result.remaining, creditCost: MESSAGE_CREDIT_COST });
    } catch (error) {
      console.error("[MESSAGE] Use credit error:", error);
      res.status(500).json({ message: "Kredi kullanılamadı" });
    }
  });

  // Legacy endpoint - redirect to new message credits
  app.post("/api/voice-credits/use", async (req, res) => {
    // Forward to the new unified message credits endpoint
    return res.redirect(307, "/api/message-credits/use");
  });

  // Generic credit deduction endpoint (used for image analysis, etc.)
  app.post("/api/credits/use", async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Oturum bulunamadı" });
      }

      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(401).json({ message: "Kullanıcı bulunamadı" });
      }

      const amount = parseInt(req.body.amount) || 1;

      // EXPLICIT ADMIN EMAIL BYPASS - works even if database flags are incorrect
      if (ADMIN_EMAILS.includes(user.email)) {
        console.log(`[ADMIN BYPASS] ${user.email} - ${amount} credit check bypassed`);
        return res.json({ success: true, remaining: user.credits, isGodMode: true, isAdmin: true });
      }

      // God Mode users have unlimited everything
      if (user.isGodMode) {
        console.log(`[CREDITS] God Mode user ${user.email} bypassing ${amount} credit deduction`);
        return res.json({ success: true, remaining: user.credits, isGodMode: true });
      }

      // Premium users bypass credit checks
      if (user.isPremium) {
        console.log(`[CREDITS] Premium user ${user.email} bypassing ${amount} credit deduction`);
        return res.json({ success: true, remaining: user.credits, isPremium: true });
      }

      // Check if user has enough credits
      if (user.credits < amount) {
        console.log(`[CREDITS] User ${user.email} has insufficient credits: ${user.credits} < ${amount}`);
        return res.status(402).json({ 
          message: "Yetersiz kredi",
          remaining: user.credits,
          required: amount,
          insufficientCredits: true
        });
      }

      // Deduct credits
      const result = await storage.useXCredits(userId, amount);
      console.log(`[CREDITS] Deducted ${amount} credits from user ${user.email}. Remaining: ${result.remaining}`);

      res.json({ success: true, remaining: result.remaining, amount });
    } catch (error) {
      console.error("[CREDITS] Use credit error:", error);
      res.status(500).json({ message: "Kredi kullanılamadı" });
    }
  });

  // ==========================================
  // X-CREDITS & STORE ROUTES
  // ==========================================

  // Get X-Credits balance
  app.get("/api/x-credits", async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Oturum bulunamadı" });
      }

      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(401).json({ message: "Kullanıcı bulunamadı" });
      }

      // EXPLICIT ADMIN EMAIL CHECK - ensures admin bypass works even if DB flags are incorrect
      const isAdminEmail = ADMIN_EMAILS.includes(user.email);
      const effectiveIsAdmin = user.isAdmin || isAdminEmail;
      const effectiveIsGodMode = user.isGodMode || isAdminEmail;

      res.json({
        credits: user.credits,
        isPremium: user.isPremium,
        isGodMode: effectiveIsGodMode,
        isAdmin: effectiveIsAdmin,
        isUnlimited: effectiveIsGodMode || effectiveIsAdmin // For "Kredi: Unlimited" display
      });
    } catch (error) {
      console.error("[CREDITS] Get balance error:", error);
      res.status(500).json({ message: "Kredi bilgisi alınamadı" });
    }
  });

  // Get room credit cost
  app.get("/api/room-cost/:duration", async (req, res) => {
    try {
      const duration = parseInt(req.params.duration);
      if (isNaN(duration) || duration < 1) {
        return res.status(400).json({ message: "Geçersiz süre" });
      }

      const cost = storage.getRoomCreditCost(duration);
      res.json({ duration, cost });
    } catch (error) {
      console.error("[ROOM] Get cost error:", error);
      res.status(500).json({ message: "Maliyet hesaplanamadı" });
    }
  });

  // Use X-Credits for room creation
  app.post("/api/x-credits/use-for-room", async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Oturum bulunamadı" });
      }

      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(401).json({ message: "Kullanıcı bulunamadı" });
      }

      // God Mode users have unlimited everything - bypass all restrictions
      if (user.isGodMode) {
        return res.json({ success: true, remaining: user.credits, isGodMode: true, cost: 0 });
      }

      // Premium users don't pay for rooms
      if (user.isPremium) {
        return res.json({ success: true, remaining: user.credits, isPremium: true });
      }

      const { duration } = req.body;
      if (!duration || typeof duration !== 'number') {
        return res.status(400).json({ message: "Süre gerekli" });
      }

      // VIP Session (30 min) requires 10+ credits to access
      const VIP_DURATION = 30;
      const VIP_MIN_CREDITS = 10;
      const LOW_CREDITS_THRESHOLD = 10;
      const isVipSession = duration === VIP_DURATION;

      // VIP Session: check minimum 10 credits requirement
      if (isVipSession && user.credits < VIP_MIN_CREDITS) {
        return res.status(403).json({
          message: "VIP seans için en az 10 krediniz olmalı.",
          remaining: user.credits,
          vipLocked: true
        });
      }

      // 10 Credit Rule: Block regular rooms > 5min when credits ≤ 10 (VIP exempt)
      if (!isVipSession && duration > 5 && user.credits <= LOW_CREDITS_THRESHOLD) {
        return res.status(403).json({
          message: "Krediniz 10 ve altında olduğunda 5 dakikadan uzun oda oluşturamazsınız.",
          remaining: user.credits,
          lowCreditsLocked: true
        });
      }

      const cost = storage.getRoomCreditCost(duration);
      const result = await storage.useXCredits(userId, cost);

      if (!result.success) {
        return res.status(403).json({ 
          message: "Yeterli X-Krediniz yok.",
          remaining: result.remaining,
          required: cost,
          insufficientCredits: true
        });
      }

      res.json({ success: true, remaining: result.remaining, cost });
    } catch (error) {
      console.error("[CREDITS] Use for room error:", error);
      res.status(500).json({ message: "Kredi kullanılamadı" });
    }
  });

  // ==========================================
  // STRIPE CHECKOUT ROUTES
  // ==========================================

  // Get Stripe publishable key
  app.get("/api/stripe/publishable-key", async (req, res) => {
    try {
      const { getStripePublishableKey } = await import("./stripeClient");
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error) {
      console.error("[STRIPE] Get publishable key error:", error);
      res.status(500).json({ message: "Stripe key not available" });
    }
  });

  // Create checkout session for credits purchase
  app.post("/api/stripe/checkout/credits", async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Oturum bulunamadı" });
      }

      const { creditsAmount, priceInCents } = req.body;
      if (!creditsAmount || !priceInCents) {
        return res.status(400).json({ message: "Kredi miktarı ve fiyat gerekli" });
      }

      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(401).json({ message: "Kullanıcı bulunamadı" });
      }

      const { getUncachableStripeClient } = await import("./stripeClient");
      const stripe = await getUncachableStripeClient();

      // Create or get Stripe customer - always verify customer exists
      let stripeCustomerId = user.stripeCustomerId;

      // Verify existing customer or create new one
      if (stripeCustomerId) {
        try {
          await stripe.customers.retrieve(stripeCustomerId);
        } catch (err: any) {
          console.log(`[STRIPE] Customer ${stripeCustomerId} not found, creating new customer`);
          stripeCustomerId = null;
        }
      }

      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { userId: userId.toString() }
        });
        await storage.updateUserStripeCustomerId(userId, customer.id);
        stripeCustomerId = customer.id;
        console.log(`[STRIPE] Created new customer: ${stripeCustomerId}`);
      }

      // Create checkout session for one-time credits purchase
      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${creditsAmount} X-Credits`,
              description: `Purchase ${creditsAmount} X-Credits for XOXO`
            },
            unit_amount: priceInCents
          },
          quantity: 1
        }],
        mode: 'payment',
        success_url: `${baseUrl}/payment-success?type=credits&amount=${creditsAmount}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/x-store`,
        metadata: {
          userId: userId.toString(),
          productType: 'credits',
          creditsAmount: creditsAmount.toString()
        }
      });

      console.log(`[STRIPE] Created checkout session: ${session.id} for user ${userId}, credits: ${creditsAmount}`);
      res.json({ url: session.url, sessionId: session.id });
    } catch (error: any) {
      console.error("[STRIPE] Checkout credits error:", error);
      const stripeMessage = error?.message || error?.raw?.message || "Bilinmeyen hata";
      res.status(500).json({ 
        message: "Ödeme oturumu oluşturulamadı", 
        stripeError: stripeMessage,
        code: error?.code || error?.raw?.code
      });
    }
  });

  // Create checkout session for subscription
  app.post("/api/stripe/checkout/subscription", async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Oturum bulunamadı" });
      }

      const { planType, priceInCents } = req.body; // "weekly" or "monthly"
      if (!planType || !priceInCents) {
        return res.status(400).json({ message: "Plan tipi ve fiyat gerekli" });
      }

      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(401).json({ message: "Kullanıcı bulunamadı" });
      }

      if (user.isPremium) {
        return res.status(400).json({ message: "Zaten premium üyesiniz" });
      }

      const { getUncachableStripeClient } = await import("./stripeClient");
      const stripe = await getUncachableStripeClient();

      // Create or get Stripe customer - always verify customer exists
      let stripeCustomerId = user.stripeCustomerId;

      // Verify existing customer or create new one
      if (stripeCustomerId) {
        try {
          await stripe.customers.retrieve(stripeCustomerId);
        } catch (err: any) {
          console.log(`[STRIPE] Customer ${stripeCustomerId} not found, creating new customer`);
          stripeCustomerId = null;
        }
      }

      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { userId: userId.toString() }
        });
        await storage.updateUserStripeCustomerId(userId, customer.id);
        stripeCustomerId = customer.id;
        console.log(`[STRIPE] Created new customer: ${stripeCustomerId}`);
      }

      // Create checkout session for subscription
      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
      const planName = planType === 'weekly' ? 'Haftalık Premium' : 'Aylık Premium';
      const interval = planType === 'weekly' ? 'week' : 'month';

      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: `XOXO ${planName}`,
              description: `Sınırsız sesli mesaj, sınırsız oda süresi, Snake karakteri`
            },
            unit_amount: priceInCents,
            recurring: { interval }
          },
          quantity: 1
        }],
        mode: 'subscription',
        success_url: `${baseUrl}/payment-success?type=subscription&plan=${planType}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/x-store`,
        metadata: {
          userId: userId.toString(),
          productType: 'subscription',
          planType
        }
      });

      console.log(`[STRIPE] Created subscription session: ${session.id} for user ${userId}, plan: ${planType}`);
      res.json({ url: session.url, sessionId: session.id });
    } catch (error: any) {
      console.error("[STRIPE] Checkout subscription error:", error);
      const stripeMessage = error?.message || error?.raw?.message || "Bilinmeyen hata";
      res.status(500).json({ 
        message: "Ödeme oturumu oluşturulamadı", 
        stripeError: stripeMessage,
        code: error?.code || error?.raw?.code
      });
    }
  });

  // Process successful payment (called after redirect back) - PRIMARY credit fulfillment
  app.post("/api/stripe/verify-session", async (req, res) => {
    try {
      console.log('╔════════════════════════════════════════════════════════╗');
      console.log('║      VERIFY-SESSION ENDPOINT CALLED                     ║');
      console.log('╚════════════════════════════════════════════════════════╝');

      const userId = (req.session as any)?.userId;
      if (!userId) {
        console.log('[VERIFY] ❌ No userId in session');
        return res.status(401).json({ message: "Oturum bulunamadı" });
      }
      console.log('[VERIFY] User ID:', userId);

      const { sessionId } = req.body;
      if (!sessionId) {
        console.log('[VERIFY] ❌ No sessionId provided');
        return res.status(400).json({ message: "Session ID gerekli" });
      }
      console.log('[VERIFY] Session ID:', sessionId);

      // Check if this session was already processed
      const existingPayment = await storage.getPaymentBySessionId(sessionId);
      if (existingPayment) {
        console.log('[VERIFY] ⚠️ Session already processed, returning cached result');
        return res.json({ 
          success: true, 
          type: existingPayment.productType,
          amount: existingPayment.creditsAmount,
          alreadyProcessed: true
        });
      }

      const { getUncachableStripeClient } = await import("./stripeClient");
      const stripe = await getUncachableStripeClient();

      console.log('[VERIFY] Retrieving session from Stripe...');
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      console.log('[VERIFY] Session status:', session.status);
      console.log('[VERIFY] Payment status:', session.payment_status);
      console.log('[VERIFY] Metadata:', JSON.stringify(session.metadata));

      if (session.payment_status !== 'paid') {
        console.log('[VERIFY] ❌ Payment not yet paid');
        return res.status(400).json({ message: "Ödeme henüz onaylanmadı", status: session.payment_status });
      }

      const productType = session.metadata?.productType;
      const creditsAmount = session.metadata?.creditsAmount;
      const metadataUserId = session.metadata?.userId;

      // Verify user matches
      if (metadataUserId && parseInt(metadataUserId, 10) !== userId) {
        console.log('[VERIFY] ⚠️ User ID mismatch:', { sessionUserId: metadataUserId, currentUserId: userId });
      }

      if (productType === 'credits' && creditsAmount) {
        const amount = parseInt(creditsAmount, 10);
        console.log(`[VERIFY] 📊 Adding ${amount} credits to user ${userId}...`);

        // Get user before update
        const userBefore = await storage.getUserById(userId);
        console.log('[VERIFY] Credits before:', userBefore?.credits || 0);

        // Add credits
        const result = await storage.addXCredits(userId, amount);

        console.log('╔════════════════════════════════════════════════════════╗');
        console.log('║      ✅ KREDİ BAŞARIYLA YÜKLENDİ (VERIFY)              ║');
        console.log('╠════════════════════════════════════════════════════════╣');
        console.log('║ User ID:', userId);
        console.log('║ Eklenen Kredi:', amount);
        console.log('║ Önceki Bakiye:', userBefore?.credits || 0);
        console.log('║ Yeni Bakiye:', result.newBalance);
        console.log('╚════════════════════════════════════════════════════════╝');

        // Record payment
        await storage.recordPayment({
          userId,
          stripeSessionId: session.id,
          stripePaymentIntentId: session.payment_intent as string,
          amount: session.amount_total || 0,
          currency: session.currency || 'usd',
          productType: 'credits',
          creditsAmount: amount,
          status: 'completed'
        });
        console.log('[VERIFY] ✅ Payment recorded in database');

        res.json({ success: true, type: 'credits', amount, newBalance: result.newBalance });
      } else if (productType === 'subscription') {
        console.log('[VERIFY] 📊 Activating premium for user', userId);

        await storage.updateUserPremiumStatus(userId, true, session.subscription as string);

        await storage.recordPayment({
          userId,
          stripeSessionId: session.id,
          stripeSubscriptionId: session.subscription as string,
          amount: session.amount_total || 0,
          currency: session.currency || 'usd',
          productType: 'subscription',
          status: 'completed'
        });

        console.log('[VERIFY] ✅ Premium activated and payment recorded');
        res.json({ success: true, type: 'subscription' });
      } else {
        console.log('[VERIFY] ❌ Unknown product type:', productType);
        res.status(400).json({ message: "Bilinmeyen ürün tipi" });
      }
    } catch (error: any) {
      console.error("[VERIFY] ❌ Error:", error.message);
      res.status(500).json({ message: "Oturum doğrulanamadı", error: error.message });
    }
  });

  // Get user's payment history
  app.get("/api/payments/history", async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Oturum bulunamadı" });
      }

      const payments = await storage.getPaymentsByUserId(userId);
      res.json({ payments });
    } catch (error) {
      console.error("[PAYMENTS] Get history error:", error);
      res.status(500).json({ message: "Ödeme geçmişi alınamadı" });
    }
  });

  // ==========================================
  // ADMIN ROUTES
  // ==========================================

  // Note: ADMIN_EMAILS defined at top of file for global access

  // Admin login endpoint
  app.post("/api/admin/login", async (req, res) => {
    try {
      const data = adminLoginSchema.parse(req.body);

      // Check if email is in admin whitelist
      const normalizedEmail = String(data.email).trim().toLowerCase();
      if (!ADMIN_EMAILS.includes(normalizedEmail)) {
        console.warn(`[ADMIN] Yetkisiz giriş denemesi: "${normalizedEmail}"`);
        return res.status(403).json({ message: "Yetkisiz erişim" });
      }

      // Check ADMIN_PASSWORD from secrets
      const adminPassword = process.env.ADMIN_PASSWORD;
      if (!adminPassword) {
        return res.status(500).json({ message: "Admin şifresi yapılandırılmamış" });
      }

      const inputPassword = String(data.password).trim();
      const targetPassword = adminPassword.trim();
      if (inputPassword !== targetPassword) {
        console.warn(
          `[ADMIN] Şifre eşleşmedi. Gelen: ${inputPassword.length} karakter, ` +
          `beklenen: ${targetPassword.length} karakter`
        );
        return res.status(401).json({ message: "Geçersiz şifre" });
      }

      // Set admin session
      (req.session as any).isAdmin = true;
      (req.session as any).adminEmail = normalizedEmail;

      console.log("[ADMIN] Admin login successful:", data.email);
      res.json({ success: true, email: data.email });
    } catch (error: any) {
      console.error("[ADMIN] Login error:", error);
      res.status(400).json({ message: error.message || "Giriş başarısız" });
    }
  });

  // Admin session check
  app.get("/api/admin/me", async (req, res) => {
    if (!(req.session as any)?.isAdmin) {
      return res.status(401).json({ message: "Admin oturumu bulunamadı" });
    }
    res.json({ 
      isAdmin: true, 
      email: (req.session as any).adminEmail 
    });
  });

  // Admin logout
  app.post("/api/admin/logout", async (req, res) => {
    (req.session as any).isAdmin = false;
    (req.session as any).adminEmail = null;
    res.json({ success: true });
  });

  // Admin middleware for protected routes
  const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (!(req.session as any)?.isAdmin) {
      return res.status(401).json({ message: "Yetkisiz erişim" });
    }
    next();
  };

  // Get all users (admin only)
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const safeUsers = await Promise.all(
        allUsers.map(async ({ passwordHash, rememberToken, otpCode, otpExpiry, ...user }) => {
          const [lastChar, lastEmailLog] = await Promise.all([
            storage.getLastCharacterByUser(String(user.id)),
            storage.getLatestEmailLogByEmail(user.email),
          ]);
          return {
            ...user,
            lastChar,
            lastEmailSuccess: lastEmailLog ? lastEmailLog.success : null,
            lastEmailAt: lastEmailLog ? lastEmailLog.createdAt : null,
            lastEmailType: lastEmailLog ? lastEmailLog.type : null,
          };
        })
      );
      res.json({ users: safeUsers });
    } catch (error) {
      console.error("[ADMIN] Get users error:", error);
      res.status(500).json({ message: "Kullanıcılar alınamadı" });
    }
  });

  // Get active X-Rooms (admin only)
  app.get("/api/admin/rooms", requireAdmin, async (req, res) => {
    try {
      const activeRooms = await storage.getActiveRooms();
      // Get member counts for each room
      const roomsWithMembers = await Promise.all(
        activeRooms.map(async (room) => {
          const members = await storage.getRoomMembers(room.id);
          return {
            ...room,
            memberCount: members.length,
            members: members.map(m => ({ nickname: m.nickname, isAdmin: m.isAdmin }))
          };
        })
      );
      res.json({ rooms: roomsWithMembers });
    } catch (error) {
      console.error("[ADMIN] Get rooms error:", error);
      res.status(500).json({ message: "Odalar alınamadı" });
    }
  });

  // Get all admin settings
  app.get("/api/admin/settings", requireAdmin, async (req, res) => {
    try {
      const settings = await storage.getAllAdminSettings();
      const settingsMap: Record<string, string> = {};
      settings.forEach(s => { settingsMap[s.settingKey] = s.settingValue; });
      res.json({ settings: settingsMap });
    } catch (error) {
      console.error("[ADMIN] Get settings error:", error);
      res.status(500).json({ message: "Ayarlar alınamadı" });
    }
  });

  // Update admin settings
  app.post("/api/admin/settings", requireAdmin, async (req, res) => {
    try {
      const { settings } = req.body as { settings: Record<string, string> };

      for (const [key, value] of Object.entries(settings)) {
        await storage.setAdminSetting(key, value);
      }

      console.log("[ADMIN] Settings updated:", Object.keys(settings));
      res.json({ success: true, message: "Ayarlar güncellendi" });
    } catch (error) {
      console.error("[ADMIN] Update settings error:", error);
      res.status(500).json({ message: "Ayarlar güncellenemedi" });
    }
  });

  // Get revenue statistics (admin only)
  app.get("/api/admin/revenue", requireAdmin, async (req, res) => {
    try {
      const stats = await storage.getRevenueStats();
      res.json(stats);
    } catch (error) {
      console.error("[ADMIN] Get revenue error:", error);
      res.status(500).json({ message: "Gelir istatistikleri alınamadı" });
    }
  });

  // Get all payments (admin only)
  app.get("/api/admin/payments", requireAdmin, async (req, res) => {
    try {
      const payments = await storage.getAllPayments();
      res.json({ payments });
    } catch (error) {
      console.error("[ADMIN] Get payments error:", error);
      res.status(500).json({ message: "Ödemeler alınamadı" });
    }
  });

  // Get credit statistics for Jarvis (admin only)
  app.get("/api/admin/credit-stats", requireAdmin, async (req, res) => {
    try {
      const stats = await storage.getCreditStatistics();
      res.json(stats);
    } catch (error) {
      console.error("[ADMIN] Get credit stats error:", error);
      res.status(500).json({ message: "Kredi istatistikleri alınamadı" });
    }
  });

  // Search users by email (admin only)
  app.get("/api/admin/users/search", requireAdmin, async (req, res) => {
    try {
      const email = req.query.email as string;
      if (!email) {
        return res.status(400).json({ message: "Email gerekli" });
      }

      const user = await storage.getUserByEmail(email.toLowerCase());
      if (!user) {
        return res.status(404).json({ message: "Kullanıcı bulunamadı" });
      }

      // Remove sensitive data
      const { passwordHash, rememberToken, otpCode, ...safeUser } = user;
      res.json({ user: safeUser });
    } catch (error) {
      console.error("[ADMIN] Search user error:", error);
      res.status(500).json({ message: "Kullanıcı aranamadı" });
    }
  });

  // Update user (credits, premium, admin, god mode) - admin only
  app.patch("/api/admin/users/:userId", requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId as string);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Geçersiz kullanıcı ID" });
      }

      const { credits, creditDelta, isPremium, isAdmin, isGodMode, isBanned, newPassword } = req.body;

      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ message: "Kullanıcı bulunamadı" });
      }

      // Handle password update separately
      if (typeof newPassword === "string" && newPassword.length >= 6) {
        const passwordHash = await bcrypt.hash(newPassword, 12);
        await storage.updateUserPassword(userId, passwordHash);
        console.log(`[ADMIN] Password updated for user ${userId}`);
        if (Object.keys(req.body).length === 1) {
          return res.json({ message: "Şifre güncellendi" });
        }
      }

      // Build update object with validation
      const updates: Partial<{ credits: number; isPremium: boolean; isAdmin: boolean; isGodMode: boolean; isBanned: boolean }> = {};

      if (typeof creditDelta === "number" && creditDelta !== 0) {
        const newCredits = Math.max(0, (user.credits || 0) + Math.floor(creditDelta));
        if (newCredits <= 1000000) updates.credits = newCredits;
      } else if (typeof credits === "number" && credits >= 0 && credits <= 1000000) {
        updates.credits = Math.floor(credits);
      }
      if (typeof isPremium === "boolean") updates.isPremium = isPremium;
      if (typeof isAdmin === "boolean") updates.isAdmin = isAdmin;
      if (typeof isGodMode === "boolean") updates.isGodMode = isGodMode;
      if (typeof isBanned === "boolean") updates.isBanned = isBanned;

      if (Object.keys(updates).length === 0) {
        return res.json({ message: "İşlem tamamlandı" });
      }

      const updatedUser = await storage.updateUserAdmin(userId, updates);
      const { passwordHash: ph, rememberToken, otpCode, ...safeUser } = updatedUser;

      console.log(`[ADMIN] User ${userId} updated:`, updates);
      res.json({ user: safeUser, message: "Kullanıcı güncellendi" });
    } catch (error) {
      console.error("[ADMIN] Update user error:", error);
      res.status(500).json({ message: "Kullanıcı güncellenemedi" });
    }
  });

  // Get top users by purchases (admin only)
  app.get("/api/admin/revenue/top-users", requireAdmin, async (req, res) => {
    try {
      const topUsers = await storage.getTopUsersByPurchases(10);
      res.json({ topUsers });
    } catch (error) {
      console.error("[ADMIN] Get top users error:", error);
      res.status(500).json({ message: "Top kullanıcılar alınamadı" });
    }
  });

  // Jarvis AI Chat endpoint (admin only)
  app.post("/api/jarvis/chat", requireAdmin, async (req, res) => {
    try {
      const { message } = req.body;

      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Mesaj gerekli" });
      }

      // Gather system context for Jarvis
      const [users, creditStats, revenueStats, payments, activeRooms] = await Promise.all([
        storage.getAllUsers(),
        storage.getCreditStatistics(),
        storage.getRevenueStats(),
        storage.getAllPayments(),
        storage.getActiveRooms(),
      ]);

      // Calculate today's stats
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayPayments = payments.filter(p => new Date(p.createdAt) >= today);
      const todaySales = todayPayments.filter(p => p.status === "completed").reduce((sum, p) => sum + p.amount, 0);
      const failedPayments = payments.filter(p => p.status === "failed");
      const recentFailedPayments = failedPayments.slice(-5);

      // Prepare system context
      const systemContext = `
Sen J.A.R.V.I.S. (Just A Rather Very Intelligent System) - XOXO uygulamasının yapay zeka asistanısın.
Kullanıcıya her zaman "Sir" veya "Mehmet" diye hitap et. Tony Stark'ın Jarvis'i gibi analitik, profesyonel ve hafif kinayeli bir tonda konuş.

ÖNEMLİ KURALLAR:
1. Her zaman Türkçe cevap ver.
2. Kısa ve öz ol, maksimum 2-3 cümle.
3. Teknik verileri anlaşılır bir dille açıkla.
4. Kritik sorunlarda proaktif uyarılar ver.

GÜNCEL SİSTEM VERİLERİ:
- Toplam Kullanıcı: ${users.length}
- Doğrulanmış Kullanıcı: ${users.filter(u => u.emailVerified).length}
- Premium Kullanıcı: ${users.filter(u => u.isPremium).length}
- Bugünkü Satış: $${(todaySales / 100).toFixed(2)}
- Bugünkü İşlem Sayısı: ${todayPayments.length}
- Toplam Gelir: $${(revenueStats.totalRevenue / 100).toFixed(2)}
- Bekleyen Ödemeler: ${revenueStats.pendingPayments}
- Başarısız Ödemeler (Son 5): ${recentFailedPayments.length > 0 ? recentFailedPayments.map(p => `User#${p.userId} - $${(p.amount / 100).toFixed(2)}`).join(", ") : "Yok"}
- Toplam Satın Alınan Krediler: ${creditStats.totalCredits.toLocaleString()}
- Aktif (Kalan) Krediler: ${creditStats.activeCredits.toLocaleString()}
- Kullanılan Krediler: ${creditStats.totalUsed.toLocaleString()}
- Kredi Kullanım Oranı: %${creditStats.creditUsageRate.toFixed(1)}
- Aktif X-Room Sayısı: ${activeRooms.length}

Kullanıcının sorusu: "${message}"
`;

      const response = await gemini.models.generateContent({
        model: "gemini-2.5-flash",
        contents: systemContext,
      });

      const jarvisResponse = response.text || "Üzgünüm Sir, şu anda yanıt veremiyorum.";

      res.json({ response: jarvisResponse });
    } catch (error) {
      console.error("[JARVIS] Chat error:", error);
      res.status(500).json({ error: "Jarvis yanıt veremedi" });
    }
  });

  // Jarvis System Status endpoint (for proactive alerts)
  app.get("/api/jarvis/system-status", requireAdmin, async (req, res) => {
    try {
      const [users, creditStats, payments] = await Promise.all([
        storage.getAllUsers(),
        storage.getCreditStatistics(),
        storage.getAllPayments(),
      ]);

      const alerts: { type: "warning" | "critical" | "info"; message: string }[] = [];

      // Check for failed payments (last 5)
      const recentPayments = payments.slice(-10);
      const failedCount = recentPayments.filter(p => p.status === "failed").length;
      if (failedCount >= 3) {
        alerts.push({
          type: "critical",
          message: `Sir, son 10 ödemeden ${failedCount} tanesi başarısız oldu. Stripe entegrasyonunu kontrol etmenizi öneririm.`,
        });
      }

      // Check credit usage rate
      if (creditStats.creditUsageRate > 90) {
        alerts.push({
          type: "warning",
          message: `Kredi kullanım oranı %${creditStats.creditUsageRate.toFixed(1)}. Kullanıcılar kredilerini tüketiyor, pazarlama için ideal bir zaman.`,
        });
      }

      // Check for low active credits
      if (creditStats.activeCredits < 100 && users.length > 10) {
        alerts.push({
          type: "warning",
          message: `Aktif kredi seviyesi düşük (${creditStats.activeCredits}). Kullanıcıların yeni paket satın almasını teşvik etmeyi düşünebilirsiniz.`,
        });
      }

      // Today's sales milestone
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayPayments = payments.filter(p => new Date(p.createdAt) >= today && p.status === "completed");
      const todaySales = todayPayments.reduce((sum, p) => sum + p.amount, 0);

      if (todaySales >= 10000) { // $100+
        alerts.push({
          type: "info",
          message: `Tebrikler Sir! Bugün $${(todaySales / 100).toFixed(2)} satış yaptınız.`,
        });
      }

      res.json({
        alerts,
        stats: {
          totalUsers: users.length,
          verifiedUsers: users.filter(u => u.emailVerified).length,
          premiumUsers: users.filter(u => u.isPremium).length,
          todaySales,
          creditUsageRate: creditStats.creditUsageRate,
          activeCredits: creditStats.activeCredits,
        },
      });
    } catch (error) {
      console.error("[JARVIS] System status error:", error);
      res.status(500).json({ error: "Sistem durumu alınamadı" });
    }
  });

  // ==========================================
  // ADMIN COMMAND CENTER - Advanced Features
  // ==========================================

  // Force delete user and all associated data
  app.delete("/api/admin/users/:userId/force-delete", requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId as string);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Geçersiz kullanıcı ID" });
      }

      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ message: "Kullanıcı bulunamadı" });
      }

      // Delete all associated data
      await db.delete(chatMessages).where(
        sql`session_id IN (SELECT id FROM chat_sessions WHERE user_id = ${user.email})`
      );
      await db.delete(chatSessions).where(eq(chatSessions.userId, user.email));
      await db.delete(payments).where(eq(payments.userId, userId));
      await db.delete(roomMembers).where(eq(roomMembers.memberId, user.email));
      await db.delete(roomMessages).where(eq(roomMessages.memberId, user.email));
      await db.delete(usageAnalytics).where(eq(usageAnalytics.userId, userId));

      // Finally delete the user
      await db.delete(users).where(eq(users.id, userId));

      console.log(`[ADMIN] User ${user.email} (ID: ${userId}) force deleted with all data`);
      res.json({ message: `Kullanıcı ${user.email} ve tüm verileri kalıcı olarak silindi` });
    } catch (error) {
      console.error("[ADMIN] Force delete error:", error);
      res.status(500).json({ message: "Kullanıcı silinemedi" });
    }
  });

  // Get all banned users
  app.get("/api/admin/bans", requireAdmin, async (req, res) => {
    try {
      const bans = await db.select().from(userBans).orderBy(sql`created_at DESC`);
      res.json(bans);
    } catch (error) {
      console.error("[ADMIN] Get bans error:", error);
      res.status(500).json({ message: "Yasaklar alınamadı" });
    }
  });

  // Ban a user (by email or IP)
  app.post("/api/admin/bans", requireAdmin, async (req, res) => {
    try {
      const { email, ipAddress, banType, reason, durationDays } = req.body;
      const adminEmail = (req.session as any).adminEmail || "admin";

      if (!email && !ipAddress) {
        return res.status(400).json({ message: "Email veya IP adresi gerekli" });
      }

      if (!["temporary", "permanent"].includes(banType)) {
        return res.status(400).json({ message: "Geçersiz yasaklama türü" });
      }

      let expiresAt = null;
      if (banType === "temporary" && durationDays) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + parseInt(durationDays));
      }

      const [ban] = await db.insert(userBans).values({
        email: email || null,
        ipAddress: ipAddress || null,
        banType,
        reason: reason || null,
        expiresAt,
        bannedBy: adminEmail,
      }).returning();

      console.log(`[ADMIN] Ban created:`, ban);
      res.json({ ban, message: "Kullanıcı yasaklandı" });
    } catch (error) {
      console.error("[ADMIN] Create ban error:", error);
      res.status(500).json({ message: "Yasaklama oluşturulamadı" });
    }
  });

  // Remove a ban
  app.delete("/api/admin/bans/:banId", requireAdmin, async (req, res) => {
    try {
      const banId = parseInt(req.params.banId as string);
      if (isNaN(banId)) {
        return res.status(400).json({ message: "Geçersiz yasaklama ID" });
      }

      await db.delete(userBans).where(eq(userBans.id, banId));

      console.log(`[ADMIN] Ban ${banId} removed`);
      res.json({ message: "Yasaklama kaldırıldı" });
    } catch (error) {
      console.error("[ADMIN] Delete ban error:", error);
      res.status(500).json({ message: "Yasaklama kaldırılamadı" });
    }
  });

  // Get all global notifications
  app.get("/api/admin/notifications", requireAdmin, async (req, res) => {
    try {
      const notifications = await db.select().from(globalNotifications).orderBy(sql`created_at DESC`);
      res.json(notifications);
    } catch (error) {
      console.error("[ADMIN] Get notifications error:", error);
      res.status(500).json({ message: "Bildirimler alınamadı" });
    }
  });

  // Create a global notification
  app.post("/api/admin/notifications", requireAdmin, async (req, res) => {
    try {
      const { title, message, type, expiresInHours } = req.body;
      const adminEmail = (req.session as any).adminEmail || "admin";

      if (!title || !message) {
        return res.status(400).json({ message: "Başlık ve mesaj gerekli" });
      }

      let expiresAt = null;
      if (expiresInHours) {
        expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + parseInt(expiresInHours));
      }

      const [notification] = await db.insert(globalNotifications).values({
        title,
        message,
        type: type || "info",
        isActive: true,
        expiresAt,
        createdBy: adminEmail,
      }).returning();

      console.log(`[ADMIN] Global notification created:`, notification);
      res.json({ notification, message: "Bildirim oluşturuldu" });
    } catch (error) {
      console.error("[ADMIN] Create notification error:", error);
      res.status(500).json({ message: "Bildirim oluşturulamadı" });
    }
  });

  // Toggle notification active status
  app.patch("/api/admin/notifications/:notificationId", requireAdmin, async (req, res) => {
    try {
      const notificationId = parseInt(req.params.notificationId as string);
      const { isActive } = req.body;

      if (isNaN(notificationId)) {
        return res.status(400).json({ message: "Geçersiz bildirim ID" });
      }

      const [updated] = await db.update(globalNotifications)
        .set({ isActive: isActive ?? false })
        .where(eq(globalNotifications.id, notificationId))
        .returning();

      res.json({ notification: updated, message: "Bildirim güncellendi" });
    } catch (error) {
      console.error("[ADMIN] Update notification error:", error);
      res.status(500).json({ message: "Bildirim güncellenemedi" });
    }
  });

  // Delete a notification
  app.delete("/api/admin/notifications/:notificationId", requireAdmin, async (req, res) => {
    try {
      const notificationId = parseInt(req.params.notificationId as string);

      if (isNaN(notificationId)) {
        return res.status(400).json({ message: "Geçersiz bildirim ID" });
      }

      await db.delete(globalNotifications).where(eq(globalNotifications.id, notificationId));

      res.json({ message: "Bildirim silindi" });
    } catch (error) {
      console.error("[ADMIN] Delete notification error:", error);
      res.status(500).json({ message: "Bildirim silinemedi" });
    }
  });

  // Get active notifications for users (public endpoint)
  app.get("/api/notifications/active", async (req, res) => {
    try {
      const now = new Date();
      const notifications = await db.select().from(globalNotifications)
        .where(
          and(
            eq(globalNotifications.isActive, true),
            or(
              isNull(globalNotifications.expiresAt),
              gt(globalNotifications.expiresAt, now)
            )
          )
        )
        .orderBy(sql`created_at DESC`);

      res.json(notifications);
    } catch (error) {
      console.error("Get active notifications error:", error);
      res.status(500).json({ message: "Bildirimler alınamadı" });
    }
  });

  // Get usage analytics
  app.get("/api/admin/analytics", requireAdmin, async (req, res) => {
    try {
      // Get aggregated usage stats per mode
      const modeStats = await db.select({
        mode: usageAnalytics.mode,
        totalMessages: sql<number>`sum(${usageAnalytics.messageCount})`,
        totalVoice: sql<number>`sum(${usageAnalytics.voiceCount})`,
        totalCredits: sql<number>`sum(${usageAnalytics.creditsSpent})`,
        totalDuration: sql<number>`sum(${usageAnalytics.sessionDuration})`,
        uniqueUsers: sql<number>`count(distinct ${usageAnalytics.userId})`,
      }).from(usageAnalytics).groupBy(usageAnalytics.mode);

      // Get top users by credit usage
      const topUsers = await db.select({
        userId: usageAnalytics.userId,
        userEmail: usageAnalytics.userEmail,
        totalCredits: sql<number>`sum(${usageAnalytics.creditsSpent})`,
        totalMessages: sql<number>`sum(${usageAnalytics.messageCount})`,
      }).from(usageAnalytics)
        .groupBy(usageAnalytics.userId, usageAnalytics.userEmail)
        .orderBy(sql`sum(${usageAnalytics.creditsSpent}) DESC`)
        .limit(10);

      res.json({ modeStats, topUsers });
    } catch (error) {
      console.error("[ADMIN] Get analytics error:", error);
      res.status(500).json({ message: "Analitikler alınamadı" });
    }
  });

  // Get API cost tracking
  app.get("/api/admin/costs", requireAdmin, async (req, res) => {
    try {
      // Get costs grouped by service
      const costsByService = await db.select({
        service: apiCostTracking.service,
        totalTokens: sql<number>`sum(${apiCostTracking.tokensUsed})`,
        totalCharacters: sql<number>`sum(${apiCostTracking.charactersUsed})`,
        requestCount: sql<number>`count(*)`,
      }).from(apiCostTracking).groupBy(apiCostTracking.service);

      // Get recent API calls
      const recentCalls = await db.select().from(apiCostTracking)
        .orderBy(sql`created_at DESC`)
        .limit(50);

      // Calculate estimated costs
      const estimates = costsByService.map(s => {
        let estimatedCost = 0;
        if (s.service === "elevenlabs") {
          // ElevenLabs: ~$0.30 per 1000 characters
          estimatedCost = ((s.totalCharacters || 0) / 1000) * 0.30;
        } else if (s.service === "anthropic") {
          // Claude: ~$3 per 1M input tokens, ~$15 per 1M output tokens
          estimatedCost = ((s.totalTokens || 0) / 1000000) * 9; // average
        } else if (s.service === "openai") {
          // OpenAI: ~$5 per 1M tokens average
          estimatedCost = ((s.totalTokens || 0) / 1000000) * 5;
        } else if (s.service === "gemini") {
          // Gemini: ~$1.25 per 1M tokens
          estimatedCost = ((s.totalTokens || 0) / 1000000) * 1.25;
        }
        return { ...s, estimatedCost: estimatedCost.toFixed(4) };
      });

      res.json({ costs: estimates, recentCalls });
    } catch (error) {
      console.error("[ADMIN] Get costs error:", error);
      res.status(500).json({ message: "Maliyetler alınamadı" });
    }
  });

  // ==========================================
  // END AUTH ROUTES
  // ==========================================

  // Legacy confession endpoint - updated for 2-level character system
  app.post(api.confessions.create.path, async (req, res) => {
    try {
      const { content, judgmentLevel } = api.confessions.create.input.parse(req.body);
      const language = (req.body.language === "en" ? "en" : "tr") as "tr" | "en";
      const userGender = (req.body.gender === "male" ? "male" : "female") as "male" | "female";
      const subLevel = parseInt(req.body.subLevel) || 1; // NEW: subLevel support (1 or 2)

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5", 
        max_tokens: 100, // 15 SECOND RULE: ~20-25 words max
        messages: [{
          role: "user",
          content: `${getSystemPrompt(judgmentLevel, language, userGender, subLevel)}\n\nKullanıcının itirafı: "${content}"`
        }]
      });

      const aiText = response.content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join('\n');

      const savedConfession = await storage.createConfession({
        content,
        judgmentLevel,
        response: aiText
      });

      res.status(201).json(savedConfession);
    } catch (error) {
      console.error("AI Error:", error);
      res.status(500).json({ message: "Failed to process confession" });
    }
  });

  app.get(api.confessions.list.path, async (req, res) => {
    try {
      const confessions = await storage.getConfessions();
      res.json(confessions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch confessions" });
    }
  });

  // Chat session endpoints
  app.post(api.chatSessions.create.path, async (req, res) => {
    try {
      const { judgmentLevel, userId } = api.chatSessions.create.input.parse(req.body);
      const session = await storage.createChatSession({ 
        judgmentLevel,
        userId: userId || "anonymous"
      });
      res.status(201).json(session);
    } catch (error) {
      console.error("Session creation error:", error);
      res.status(500).json({ message: "Failed to create session" });
    }
  });

  app.get("/api/chat/sessions/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const session = await storage.getChatSession(id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      const messages = await storage.getChatMessages(id);
      res.json({ session, messages });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch session" });
    }
  });

  // Send message in chat session
  app.post("/api/chat/sessions/:sessionId/messages", async (req, res) => {
    try {
      const sessionId = parseInt(req.params.sessionId);
      const { content } = api.chatMessages.send.input.parse(req.body);
      const language = (req.body.language === "en" ? "en" : "tr") as "tr" | "en";
      const userGender = (req.body.gender === "male" ? "male" : "female") as "male" | "female";
      const imageBase64 = req.body.imageBase64 as string | undefined;
      const imageType = req.body.imageType as string | undefined;

      const session = await storage.getChatSession(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      // Save user message (with image indicator if present)
      const displayContent = imageBase64 ? `📷 ${content}` : content;
      await storage.createChatMessage({
        sessionId,
        role: "user",
        content: displayContent
      });

      // Get conversation history
      const history = await storage.getChatMessages(sessionId);

      // Get user's past confessions for memory context - enhanced for conversational references
      let memoryContext = "";
      if (session.userId && session.userId !== "anonymous") {
        const pastSessions = await storage.getUserChatHistory(session.userId, 5);
        // Filter out current session and build memory summary
        const pastConversations = pastSessions.filter(s => s.session.id !== sessionId);
        if (pastConversations.length > 0) {
          const langInstructions = language === "en" 
            ? `\n\n[MEMORY - You've talked with this user before! Here are their past topics:]`
            : `\n\n[HAFIZA - Bu kullanıcıyla daha önce konuştun! İşte geçmiş konuları:]`;

          memoryContext = langInstructions + "\n";

          for (const past of pastConversations) {
            const confessionMsgs = past.messages.slice(0, 4); // Get more context
            if (confessionMsgs.length > 0) {
              const userMsgs = confessionMsgs.filter(m => m.role === "user");
              const topic = userMsgs[0]?.content?.slice(0, 300) || "";
              memoryContext += `- "${topic}"\n`;
            }
          }

          const useInstructions = language === "en"
            ? `\n[USE THIS NATURALLY: If today's topic connects to past conversations, say things like "Wait, is this the same person from before?" or "This reminds me of what you told me last time..." Don't force it, but make connections when relevant.]`
            : `\n[BUNU DOĞAL KULLAN: Bugünkü konu geçmiş konuşmalarla bağlantılıysa "Dur, bu yine aynı kişi mi?" veya "Bu bana geçen anlattığını hatırlattı..." gibi şeyler söyle. Zorla değil, uygun olduğunda bağlantı kur.]`;

          memoryContext += useInstructions + "\n";
        }
      }

      // Build messages array for AI (including history)
      const aiMessages = history.map(msg => ({
        role: msg.role as "user" | "assistant",
        content: msg.content
      }));

      // Call AI with full conversation history and memory context (with admin settings support)
      // 15 SECOND RULE: max 100 tokens = ~20-25 words for instant voice response
      // SNAKE ACCELERATION: Snake uses 60 tokens max for 3-second latency target
      // NEW: subLevel support (1 or 2) - defaults to 1 if not provided
      const subLevel = parseInt(req.body.subLevel) || 1;
      const systemPrompt = await getSystemPromptWithAdminSettings(session.judgmentLevel, language, userGender, subLevel);

      // SNAKE ACCELERATION v2.0 - 50K TOKEN BUDGET, ULTRA-MINIMAL
      // Snake: 50 tokens = 2 cümle max = 2 saniye latency target
      const snakeMaxTokens = 150; // Snake: Cümleyi tamamla
      const defaultMaxTokens = 100;
      const maxTokens = session.judgmentLevel === 3 ? snakeMaxTokens : defaultMaxTokens;

      let aiText: string;

      // Check if image was provided - use OpenAI GPT-4o-mini for vision
      if (imageBase64 && imageType) {
        // Server-side image validation
        const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB in bytes
        const base64SizeBytes = (imageBase64.length * 3) / 4; // Approximate decoded size

        if (base64SizeBytes > MAX_IMAGE_SIZE) {
          return res.status(400).json({ 
            message: language === "tr" ? "Resim 5MB'den büyük olamaz" : "Image cannot be larger than 5MB" 
          });
        }

        if (!imageType.startsWith("image/")) {
          return res.status(400).json({ 
            message: language === "tr" ? "Sadece resim dosyaları kabul edilir" : "Only image files are accepted" 
          });
        }

        console.log(`[Vision] Image received (${Math.round(base64SizeBytes / 1024)}KB, type: ${imageType}) - using GPT-4o-mini for character ${session.judgmentLevel}`);
        console.log(`[Vision] User message: "${content?.substring(0, 50) || 'no message'}..."`);

        // Get character-specific vision prompt
        const visionPrompt = getVisionPrompt(session.judgmentLevel, language, userGender, content);
        console.log(`[Vision] Using prompt for character ${session.judgmentLevel}, language: ${language}`);

        try {
          const visionResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            max_tokens: 150, // Slightly more for image descriptions
            messages: [
              {
                role: "system",
                content: visionPrompt
              },
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: content || (language === "tr" ? "Bu resmi yorumla" : "Analyze this image")
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:${imageType};base64,${imageBase64}`,
                      detail: "low" // Use low detail for cost efficiency
                    }
                  }
                ]
              }
            ]
          });

          aiText = visionResponse.choices[0]?.message?.content || 
                   (language === "tr" ? "Resmi göremedim, tekrar gönderir misin?" : "I couldn't see the image, can you send it again?");

          console.log(`[Vision] Response: "${aiText.substring(0, 100)}..."`);
        } catch (visionError: any) {
          console.error("[Vision] OpenAI vision API error:", visionError?.message || visionError);
          aiText = language === "tr" 
            ? "Görsel analizi sırasında bir hata oluştu. Lütfen tekrar dene." 
            : "An error occurred during image analysis. Please try again.";
        }

      } else {
        // Standard text-only chat with Anthropic
        // SNAKE ACCELERATION: Uses dynamic max_tokens and temperature for faster responses
        // SNAKE: temperature 0.8 for creative but fast responses
        const temperature = session.judgmentLevel === 3 ? 0.8 : 0.7;

        // SNAKE ACCELERATION: Haiku for Snake (200ms vs 2-5s), Sonnet for others
        const aiModel = session.judgmentLevel === 3 ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-5";

        const response = await anthropic.messages.create({
          model: aiModel,
          max_tokens: maxTokens, // Snake: 50, Others: 100
          temperature: temperature, // Snake: 0.8, Others: 0.7
          system: systemPrompt + memoryContext,
          messages: aiMessages
        });

        aiText = response.content
          .filter(item => item.type === 'text')
          .map(item => item.text)
          .join('\n');
      }

      // Apply humanization for more natural responses
      const humanize = req.body.humanize !== false; // Default to true
      if (humanize) {
        aiText = humanizeText(aiText, 0.4);
      }

      // Detect if response contains a question - split into reaction + question
      let messageParts: string[] | null = null;
      const hasQuestion = aiText.includes('?');

      if (hasQuestion) {
        // More robust sentence splitting - handles Turkish and English punctuation
        // Split by sentence-ending punctuation (. ! ? ... or Turkish ellipsis)
        const sentences = aiText.split(/(?<=[.!?…])\s+/).filter(s => s.trim().length > 0);

        if (sentences.length >= 2) {
          // Find the last sentence that contains a question mark
          let questionIndex = sentences.length - 1;
          for (let i = sentences.length - 1; i >= 0; i--) {
            if (sentences[i].includes('?')) {
              questionIndex = i;
              break;
            }
          }

          // Split: everything before the question sentence is "reaction"
          const reactionPart = sentences.slice(0, questionIndex).join(' ');
          const questionPart = sentences.slice(questionIndex).join(' ');

          if (reactionPart.trim().length > 10 && questionPart.trim().length > 5) {
            messageParts = [reactionPart.trim(), questionPart.trim()];
          }
        } else if (sentences.length === 1 && aiText.length > 50) {
          // Single sentence with question - try to split at comma or natural pause
          const text = aiText.trim();
          // Look for natural break points: comma, dash, ellipsis before the question
          const breakRegex = /[,\-–—…]\s*/g;
          const breakPoints: { index: number; length: number }[] = [];
          let match;
          while ((match = breakRegex.exec(text)) !== null) {
            breakPoints.push({ index: match.index, length: match[0].length });
          }

          if (breakPoints.length > 0) {
            // Use the last break point that's not too close to the end
            for (let i = breakPoints.length - 1; i >= 0; i--) {
              const bp = breakPoints[i];
              const breakIndex = bp.index + bp.length;
              const before = text.substring(0, bp.index + 1).trim();
              const after = text.substring(breakIndex).trim();

              // Ensure both parts have meaningful length
              if (before.length > 15 && after.length > 10 && after.includes('?')) {
                messageParts = [before, after];
                break;
              }
            }
          }
        }
      }

      // Save assistant message (full content)
      const assistantMessage = await storage.createChatMessage({
        sessionId,
        role: "assistant",
        content: aiText
      });

      // Calculate typing delay info for frontend animation
      const typingInfo = getTypingDelay(aiText);

      res.status(201).json({
        ...assistantMessage,
        typingInfo,
        // If message has parts, send them for staggered display
        messageParts: messageParts,
        hasFollowUpQuestion: hasQuestion
      });
    } catch (error) {
      console.error("Chat error:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // Text-to-Speech endpoint using OpenAI Audio
  app.post("/api/tts", async (req, res) => {
    try {
      const { text, personality = 2, gender = "female" } = req.body;

      if (!text || typeof text !== "string") {
        return res.status(400).json({ message: "Text is required" });
      }

      const voice = getOpenAIVoice(personality, gender);

      // FIX: gpt-audio bir sohbet modeli — metni okumak yerine metne CEVAP üretiyordu.
      // ("kendi yazdığına sesli cevap verme" hatasının kaynağı buydu)
      // Gerçek TTS API'si metni birebir seslendirir:
      const mp3 = await openai.audio.speech.create({
        model: "tts-1",
        voice: voice,
        input: text,
      });

      const audioBuffer = Buffer.from(await mp3.arrayBuffer());
      const audioData = audioBuffer.toString("base64");

      if (!audioData) {
        return res.status(500).json({ message: "Failed to generate audio" });
      }

      // Return base64 audio data
      res.json({ 
        audio: audioData,
        format: "mp3",
        voice
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to generate speech" });
    }
  });


  // ElevenLabs voice configurations for each personality
  // Using multilingual voices that work well with Turkish
  // Lower stability (~35%) for more emotional, less monotone voice
  // Separate voice configs for male and female user preferences
  // ===== GLOBAL PERSONALITY PROTOCOL - Voice Settings =====
  // Angel: stability 0.8 (calm, zen, soft-spoken)
  // Bestie: similarity_boost 0.9 (energetic, expressive)
  // Snake: style 0.6 (provocative, sharp, emphatic tone)
  const elevenLabsConfigFemale: Record<number, { voiceId: string; name: string; settings: object }> = {
    1: { 
      voiceId: "21m00Tcm4TlvDq8ikWAM", // Rachel - warm, nurturing (Angel/Melek)
      name: "Rachel",
      settings: {
        stability: 0.8, // HIGH stability for calm, zen, soft-spoken Angel
        similarity_boost: 0.75,
        style: 0.35, // Lower style for gentle delivery
        use_speaker_boost: true,
      }
    },
    2: { 
      voiceId: "EXAVITQu4vr4xnSDxMaL", // Bella - friendly, engaging (Bestie/Kanka)
      name: "Bella",
      settings: {
        stability: 0.4,
        similarity_boost: 0.9, // HIGH similarity for energetic, hype-friend Bestie
        style: 0.7, // Higher style for excitement
        use_speaker_boost: true,
      }
    },
    3: { 
      voiceId: "pFZP5JQG7iQjIQuC4Bku", // Charlotte - mature, authoritative, deeper female voice (Snake/Yılan)
      name: "Charlotte",
      settings: {
        stability: 0.45, // Slightly higher for more commanding, steady delivery
        similarity_boost: 0.85,
        style: 0.55, // Controlled style for dominant, serious tone
        use_speaker_boost: true,
      }
    },
  };

  // Male voices for users who selected "male" gender
  // ===== GLOBAL PERSONALITY PROTOCOL - Male Voice Settings =====
  // Angel: stability 0.8 (calm, zen, trustworthy)
  // Bestie: similarity_boost 0.9 (energetic, bro-energy)
  // Snake: style 0.6 (provocative, sharp, emphatic tone)
  const elevenLabsConfigMale: Record<number, { voiceId: string; name: string; settings: object }> = {
    1: { 
      voiceId: "TxGEqnHWrfWFTfGW9XjX", // Josh - warm, deep, trustworthy (Angel/Melek for male)
      name: "Josh",
      settings: {
        stability: 0.8, // HIGH stability for calm, zen Angel
        similarity_boost: 0.75,
        style: 0.3, // Lower style for gentle, supportive delivery
        use_speaker_boost: true,
      }
    },
    2: { 
      voiceId: "bVMeCyTHy58xNoL34h3p", // Jeremy - young, excited, energetic (Bestie/Kanka for male)
      name: "Jeremy",
      settings: {
        stability: 0.35, // Lower for dynamic, energetic delivery
        similarity_boost: 0.9, // HIGH similarity for hype-bro Bestie
        style: 0.7, // Higher style for excitement
        use_speaker_boost: true,
      }
    },
    3: { 
      // SNAKE for male users: Male dominant voice
      // Male users hear male voice (Adam) - dominant authoritative tone
      voiceId: "pNInz6obpgDQGcFmaJgB", // Adam - deep, authoritative male voice
      name: "Adam",
      settings: {
        stability: 0.35,
        similarity_boost: 0.85,
        style: 0.6, // EMPHASIZED style for provocative, sharp Snake tone
        use_speaker_boost: true,
      }
    },
  };

  // Helper to get appropriate voice config based on user gender
  // Now supports dynamic admin settings from database
  async function getVoiceConfigDynamic(personality: number, gender: string = "female") {
    const defaultConfig = gender === "male" ? elevenLabsConfigMale : elevenLabsConfigFemale;
    const fallbackConfig = defaultConfig[personality] || defaultConfig[2];

    try {
      // Try to load admin settings from database
      const adminSettings = await storage.getAllAdminSettings();
      const settingsMap: Record<string, string> = {};
      adminSettings.forEach(s => { settingsMap[s.settingKey] = s.settingValue; });

      // Check if admin has configured voice settings for this gender/personality
      const genderPrefix = gender === "male" ? "male" : "female";
      const voiceIdKey = `${genderPrefix}_${personality}_voiceId`;
      const stabilityKey = `${genderPrefix}_${personality}_stability`;
      const similarityKey = `${genderPrefix}_${personality}_similarityBoost`;

      if (settingsMap[voiceIdKey]) {
        // Admin has configured custom voice settings
        const customVoiceId = settingsMap[voiceIdKey];
        const customStability = parseFloat(settingsMap[stabilityKey] || "0.35");
        const customSimilarity = parseFloat(settingsMap[similarityKey] || "0.75");

        return {
          voiceId: customVoiceId,
          name: `Custom-${genderPrefix}-${personality}`,
          settings: {
            stability: customStability,
            similarity_boost: customSimilarity,
            style: (fallbackConfig.settings as any).style || 0.5,
            use_speaker_boost: true,
          }
        };
      }
    } catch (error) {
      // Silent fallback to defaults
    }

    // Fall back to default config
    return fallbackConfig;
  }

  // Sync version for backward compatibility
  function getVoiceConfig(personality: number, gender: string = "female") {
    const config = gender === "male" ? elevenLabsConfigMale : elevenLabsConfigFemale;
    return config[personality] || config[2];
  }

  // ===== ElevenLabs TTS ENDPOINT =====
  // High-quality multilingual TTS with character-specific settings
  // MANDATORY: Identity validation before voice generation
  app.post("/api/tts/elevenlabs", async (req, res) => {
    try {
      const { text, personality = 2, gender = "female", subLevel = 1, language = "tr" } = req.body;

      if (!text || typeof text !== "string") {
        return res.status(400).json({ message: "Text is required" });
      }

      const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
      if (!elevenLabsApiKey) {
        return res.status(500).json({ message: "ElevenLabs API key not configured" });
      }

      // MANDATORY: Validate voice identity before generation
      const voiceIdentity = validateVoiceIdentity(personality, subLevel, gender, language);

      // Get personality-specific config based on user gender preference (with admin settings support)
      const config = await getVoiceConfigDynamic(personality, gender);

      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${config.voiceId}`, {
        method: "POST",
        headers: {
          "Accept": "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": elevenLabsApiKey,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2", // Best for Turkish language
          voice_settings: config.settings,
        }),
      });

      if (!response.ok) {
        return res.status(500).json({ message: "Failed to generate speech with ElevenLabs" });
      }

      const audioBuffer = await response.arrayBuffer();
      const base64Audio = Buffer.from(audioBuffer).toString("base64");

      res.json({ 
        audio: base64Audio,
        format: "mp3",
        provider: "elevenlabs",
        voiceId: config.voiceId,
        voiceName: config.name
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to generate speech" });
    }
  });

  // ===== ElevenLabs Streaming TTS =====
  // High-quality streaming TTS with buffered response for smooth playback
  // MANDATORY: Identity validation before voice generation
  // SNAKE: Uses Edge-TTS with EmelNeural (female voice) for ALL users - cold authority tone
  app.post("/api/tts/stream", async (req, res) => {
    try {
      const { text, personality = 2, gender = "female", subLevel = 1, language = "tr" } = req.body;

      if (!text || typeof text !== "string") {
        return res.status(400).json({ message: "Text is required" });
      }

      // MANDATORY: Validate voice identity before generation
      const voiceIdentity = validateVoiceIdentity(personality, subLevel, gender, language);

      // ========== TTS: SADECE ELEVENLABS ==========
      // FIX: Google TTS ve Edge-TTS yedekleri kaldırıldı.
      // Robotik/bozuk Türkçe okuma ("eyy naber" -> "e ye ye") bu yedek
      // motorlardan geliyordu. Artık tüm karakterler ElevenLabs kullanır.

      // ELEVENLABS ROUTE (tum karakterler - tek TTS saglayici)
      const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
      if (!elevenLabsApiKey) {
        console.error("[TTS] ELEVENLABS_API_KEY eksik! Deployment ortam degiskenlerini kontrol et.");
        return res.status(500).json({ message: "TTS yapilandirilmamis: ELEVENLABS_API_KEY eksik" });
      }

      // Get personality-specific config based on user gender preference (with admin settings support)
      const config = await getVoiceConfigDynamic(personality, gender);

      // Use streaming endpoint with optimize_streaming_latency=4 (maximum optimization)
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${config.voiceId}/stream?optimize_streaming_latency=4`,
        {
          method: "POST",
          headers: {
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
            "xi-api-key": elevenLabsApiKey,
          },
          body: JSON.stringify({
            text,
            model_id: "eleven_turbo_v2_5", // Fastest model for lowest latency
            voice_settings: config.settings,
          }),
        }
      );

      if (!response.ok) {
        return res.status(500).json({ message: "Failed to generate speech" });
      }

      // ===== TRUE STREAMING TTS - FIRST SYLLABLE BEFORE TEXT COMPLETION =====
      // Send audio chunks immediately as they arrive for sub-2-second TTFB
      const reader = response.body?.getReader();
      if (!reader) {
        return res.status(500).json({ message: "Failed to get stream reader" });
      }

      // Set headers for streaming audio - chunked transfer encoding
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Transfer-Encoding", "chunked");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("X-Streaming", "true");
      res.setHeader("X-Voice-Provider", "elevenlabs-stream");

      // Stream audio chunks directly to client as they arrive
      // This allows playback to begin within milliseconds of first chunk
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          // Write chunk immediately - no buffering
          res.write(Buffer.from(value));
        }
      }

      // End the response stream
      res.end();

    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to generate speech" });
      }
    }
  });

  // ===== EDGE-TTS ENDPOINT (Real Command Line) =====
  // Uses actual edge-tts CLI with HARD-CODED pitch and rate values
  // MANDATORY: Pitch and Rate are ENFORCED for each character/level/gender
  app.post("/api/tts/edge", async (req, res) => {
    try {
      const { text, personality = 2, gender = "female", subLevel = 1, language = "tr" } = req.body;

      if (!text || typeof text !== "string") {
        return res.status(400).json({ message: "Text is required" });
      }

      // MANDATORY: Validate voice identity
      const voiceIdentity = validateVoiceIdentity(personality, subLevel, gender, language);

      // HARD-CODED Edge-TTS settings - THESE CANNOT BE SKIPPED
      const voiceId = voiceIdentity.voiceId;
      const pitchHz = voiceIdentity.pitch; // e.g., -50 means -50Hz (DEEP voice)
      const ratePercent = voiceIdentity.speed; // e.g., -20 means -20% slower
      const volumePercent = voiceIdentity.volume || 0; // e.g., +10 means 10% louder

      // Format pitch, rate and volume for edge-tts CLI
      const pitchArg = pitchHz >= 0 ? `+${pitchHz}Hz` : `${pitchHz}Hz`;
      const rateArg = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;
      const volumeArg = volumePercent >= 0 ? `+${volumePercent}%` : `${volumePercent}%`;

      // ASYNC FIX: exec yerine execSync - event loop bloklanmaz
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);
      const { randomUUID } = await import("crypto");
      const { tmpdir } = await import("os");
      const { join } = await import("path");
      const { readFile, unlink } = await import("fs/promises");

      const outputPath = join(tmpdir(), `edge-tts-${randomUUID()}.mp3`);

      // Windows uyumlu: sadece "edge-tts" komutu (PATH'te olmalı)
      // Replit için: /home/runner/workspace/.pythonlibs/bin/edge-tts
      const edgeTtsPath = process.env.EDGE_TTS_PATH || "/home/runner/workspace/.pythonlibs/bin/edge-tts";

      // Shell injection koruması: tırnak işaretlerini escape et
      const safeText = text.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
      const command = `${edgeTtsPath} --voice "${voiceId}" --pitch="${pitchArg}" --rate="${rateArg}" --volume="${volumeArg}" --write-media "${outputPath}" --text "${safeText}"`;

      try {
        await execAsync(command, { timeout: 15000 }); // 15sn timeout (30'dan düşürüldü)
      } catch (execError: any) {
        console.error("[Edge-TTS] Command failed:", execError.message);
        return res.status(500).json({ message: "Edge-TTS failed" });
      }

      let audioBuffer: Buffer;
      try {
        audioBuffer = await readFile(outputPath);
        await unlink(outputPath).catch(() => {}); // Async cleanup
      } catch (readError: any) {
        return res.status(500).json({ message: "Audio read failed" });
      }

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", audioBuffer.length.toString());
      res.send(audioBuffer);

    } catch (error) {
      console.error("[Edge-TTS] Endpoint error:", error);
      res.status(500).json({ message: "Edge-TTS failed" });
    }
  });

  // ============ X-ROOM ENDPOINTS ============

  // Generate unique 6-digit room code
  function generateRoomCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  // Store WebSocket connections by room
  const roomConnections = new Map<string, Set<WebSocket>>();

  // Broadcast message to all connections in a room
  function broadcastToRoom(roomCode: string, message: object, excludeWs?: WebSocket) {
    const connections = roomConnections.get(roomCode);
    if (!connections) return;

    const data = JSON.stringify(message);
    connections.forEach(ws => {
      if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }

  // Create X-Room
  app.post("/api/xroom/create", async (req, res) => {
    try {
      const schema = z.object({
        durationMinutes: z.number().min(5).max(15),
        nickname: z.string().min(1).max(20),
        memberId: z.string().min(1),
        avatarUrl: z.string().optional(),
      });
      const { durationMinutes, nickname, memberId, avatarUrl } = schema.parse(req.body);

      // Generate unique code
      let code = generateRoomCode();
      let attempts = 0;
      while (await storage.getRoomByCode(code) && attempts < 10) {
        code = generateRoomCode();
        attempts++;
      }

      const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);

      const room = await storage.createRoom({
        code,
        adminId: memberId,
        durationMinutes,
        aiMode: 2,
        expiresAt,
      });

      // Add creator as admin member
      await storage.addRoomMember({
        roomId: room.id,
        memberId,
        nickname,
        avatarUrl,
        isAdmin: true,
        isPro: false,
      });

      // Initialize activity tracking for silence detection
      roomLastActivity.set(code, new Date());
      roomMessageCounts.set(code, 0);

      res.status(201).json({ room, code });
    } catch (error) {
      console.error("Room creation error:", error);
      res.status(500).json({ message: "Failed to create room" });
    }
  });

  // Join X-Room by code
  app.post("/api/xroom/join", async (req, res) => {
    try {
      const schema = z.object({
        code: z.string().length(6),
        nickname: z.string().min(1).max(20),
        memberId: z.string().min(1),
        avatarUrl: z.string().optional(),
      });
      const { code, nickname, memberId, avatarUrl } = schema.parse(req.body);

      const room = await storage.getRoomByCode(code.toUpperCase());
      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }

      if (new Date() > room.expiresAt) {
        return res.status(410).json({ message: "Room has expired" });
      }

      // Check if already a member
      const existingMember = await storage.getRoomMember(room.id, memberId);
      if (existingMember) {
        return res.json({ room, member: existingMember });
      }

      const member = await storage.addRoomMember({
        roomId: room.id,
        memberId,
        nickname,
        avatarUrl,
        isAdmin: false,
        isPro: false,
      });

      // Broadcast join notification
      broadcastToRoom(room.code, {
        type: "member_joined",
        member: { nickname, memberId },
      });

      res.json({ room, member });
    } catch (error) {
      console.error("Room join error:", error);
      res.status(500).json({ message: "Failed to join room" });
    }
  });

  // Get room info
  app.get("/api/xroom/:code", async (req, res) => {
    try {
      const room = await storage.getRoomByCode(req.params.code.toUpperCase());
      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }

      const members = await storage.getRoomMembers(room.id);
      const messages = await storage.getRoomMessages(room.id);

      res.json({ room, members, messages });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch room" });
    }
  });

  // Update AI mode (admin only)
  app.patch("/api/xroom/:code/ai-mode", async (req, res) => {
    try {
      const schema = z.object({
        aiMode: z.number().min(1).max(3).nullable(),
        memberId: z.string().min(1),
      });
      const { aiMode, memberId } = schema.parse(req.body);

      const room = await storage.getRoomByCode(req.params.code.toUpperCase());
      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }

      // Check if user is admin
      const member = await storage.getRoomMember(room.id, memberId);
      if (!member?.isAdmin) {
        return res.status(403).json({ message: "Only admin can change AI mode" });
      }

      const updated = await storage.updateRoomAiMode(room.id, aiMode);

      // Broadcast AI mode change
      broadcastToRoom(room.code, {
        type: "ai_mode_changed",
        aiMode,
      });

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update AI mode" });
    }
  });

  // Send message via HTTP (fallback for WebSocket)
  app.post("/api/xroom/:code/message", async (req, res) => {
    try {
      const schema = z.object({
        memberId: z.string().min(1),
        content: z.string().min(1),
        messageType: z.string().default("text"),
        avatarUrl: z.string().optional(),
        mediaUrl: z.string().optional(),
        voiceFilter: z.string().optional(),
        language: z.string().optional(),
      });
      const { memberId, content, messageType, avatarUrl, mediaUrl, voiceFilter, language: msgLanguage } = schema.parse(req.body);

      const roomCode = req.params.code.toUpperCase();
      const room = await storage.getRoomByCode(roomCode);
      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }

      if (new Date() > room.expiresAt) {
        return res.status(400).json({ message: "Room expired" });
      }

      const member = await storage.getRoomMember(room.id, memberId);
      if (!member) {
        return res.status(403).json({ message: "Not a room member" });
      }

      const roomMessage = await storage.createRoomMessage({
        roomId: room.id,
        memberId,
        nickname: member.nickname,
        avatarUrl: avatarUrl || member.avatarUrl,
        content,
        messageType,
        mediaUrl,
        voiceFilter,
      });

      broadcastToRoom(room.code, {
        type: "message",
        message: roomMessage,
      });

      // Update activity and message count for auto AI
      roomLastActivity.set(roomCode, new Date());
      const currentCount = (roomMessageCounts.get(roomCode) || 0) + 1;
      roomMessageCounts.set(roomCode, currentCount);

      // Check if AI should respond (every 5 messages, only for non-AI messages)
      if (room.aiMode && messageType !== "ai" && currentCount % AI_MESSAGE_INTERVAL === 0) {
        // Trigger AI response asynchronously (don't block the response)
        setTimeout(() => {
          triggerAutoAiResponse(room, broadcastToRoom, msgLanguage || "en");
        }, 500);
      }

      res.json({ message: roomMessage });
    } catch (error) {
      console.error("Send message error:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // Get messages (polling endpoint)
  app.get("/api/xroom/:code/messages", async (req, res) => {
    try {
      const room = await storage.getRoomByCode(req.params.code.toUpperCase());
      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }

      if (new Date() > room.expiresAt) {
        return res.status(404).json({ message: "Room expired" });
      }

      const afterId = parseInt(req.query.after as string) || 0;
      const messages = await storage.getRoomMessagesAfter(room.id, afterId);

      res.json({ messages });
    } catch (error) {
      console.error("Get messages error:", error);
      res.status(500).json({ message: "Failed to get messages" });
    }
  });

  // Trigger AI comment in room
  app.post("/api/xroom/:code/ai-comment", async (req, res) => {
    try {
      const schema = z.object({
        memberId: z.string().min(1),
      });
      const { memberId } = schema.parse(req.body);

      const room = await storage.getRoomByCode(req.params.code.toUpperCase());
      if (!room || !room.aiMode) {
        return res.status(400).json({ message: "AI mode not active" });
      }

      // Check if user is admin
      const member = await storage.getRoomMember(room.id, memberId);
      if (!member?.isAdmin) {
        return res.status(403).json({ message: "Only admin can trigger AI" });
      }

      // Get last 5 messages
      const lastMessages = await storage.getLastRoomMessages(room.id, 5);
      if (lastMessages.length === 0) {
        return res.status(400).json({ message: "No messages to comment on" });
      }

      const conversationContext = lastMessages
        .reverse()
        .map(m => `${m.nickname}: ${m.content}`)
        .join("\n");

      const aiPersonality = language === "en" ? (room.aiMode === 1 ? "Angel" : room.aiMode === 2 ? "Bestie" : "Snake") : (room.aiMode === 1 ? "Melek" : room.aiMode === 2 ? "Kanka" : "Yılan");

      // Generate AI comment - 15 SECOND RULE: short, punchy responses
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 80, // 15 SECOND RULE: ~15-20 words for X-Room comments
        system: getSystemPrompt(room.aiMode) + "\n\nSen bir grup sohbetine dahil oldun. Arkadaşların aşağıdaki konuşmayı yaptı. Onlara KISA bir yorum yap (max 15-20 kelime).",
        messages: [{ role: "user", content: conversationContext }]
      });

      const aiText = response.content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join('\n');

      // Save AI message
      const aiMessage = await storage.createRoomMessage({
        roomId: room.id,
        memberId: "ai",
        nickname: aiPersonality,
        content: aiText,
        messageType: "ai",
      });

      // Broadcast AI message
      broadcastToRoom(room.code, {
        type: "message",
        message: aiMessage,
      });

      res.json({ message: aiMessage });
    } catch (error) {
      console.error("AI comment error:", error);
      res.status(500).json({ message: "Failed to generate AI comment" });
    }
  });

  // ============ WebSocket Server ============
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  console.log("[WebSocket] Server initialized on /ws path");

  wss.on("error", (error) => {
    console.error("[WebSocket] Server error:", error);
  });

  wss.on("connection", (ws) => {
    console.log("[WebSocket] New connection established");
    let currentRoomCode: string | null = null;
    let currentMemberId: string | null = null;

    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case "join_room": {
            const { roomCode, memberId } = message;
            currentRoomCode = roomCode;
            currentMemberId = memberId;

            if (!roomConnections.has(roomCode)) {
              roomConnections.set(roomCode, new Set());
            }
            roomConnections.get(roomCode)!.add(ws);

            // Initialize activity tracking if not already set
            if (!roomLastActivity.has(roomCode)) {
              roomLastActivity.set(roomCode, new Date());
            }
            if (!roomMessageCounts.has(roomCode)) {
              roomMessageCounts.set(roomCode, 0);
            }

            ws.send(JSON.stringify({ type: "joined", roomCode }));
            break;
          }

          case "send_message": {
            if (!currentRoomCode || !currentMemberId) {
              ws.send(JSON.stringify({ type: "error", message: "Not in a room" }));
              return;
            }

            // Validate message content
            const content = message.content;
            if (!content || typeof content !== "string" || content.trim().length === 0) {
              ws.send(JSON.stringify({ type: "error", message: "Invalid message content" }));
              return;
            }

            const room = await storage.getRoomByCode(currentRoomCode);
            if (!room || new Date() > room.expiresAt) {
              ws.send(JSON.stringify({ type: "error", message: "Room expired" }));
              return;
            }

            const member = await storage.getRoomMember(room.id, currentMemberId);
            if (!member) {
              ws.send(JSON.stringify({ type: "error", message: "Not a member" }));
              return;
            }

            const msgType = message.messageType || "text";
            const roomMessage = await storage.createRoomMessage({
              roomId: room.id,
              memberId: currentMemberId,
              nickname: member.nickname,
              content: content.trim(),
              messageType: msgType,
            });

            // Broadcast to all in room including sender
            broadcastToRoom(currentRoomCode, {
              type: "message",
              message: roomMessage,
            });

            // Update activity and message count for auto AI (same as HTTP endpoint)
            roomLastActivity.set(currentRoomCode, new Date());
            const currentCount = (roomMessageCounts.get(currentRoomCode) || 0) + 1;
            roomMessageCounts.set(currentRoomCode, currentCount);

            // Check if AI should respond (every 5 messages, only for non-AI messages)
            if (room.aiMode && msgType !== "ai" && currentCount % AI_MESSAGE_INTERVAL === 0) {
              setTimeout(() => {
                triggerAutoAiResponse(room, broadcastToRoom, (message as any).language || "en");
              }, 500);
            }
            break;
          }

          case "leave_room": {
            if (currentRoomCode) {
              const connections = roomConnections.get(currentRoomCode);
              if (connections) {
                connections.delete(ws);
                if (connections.size === 0) {
                  roomConnections.delete(currentRoomCode);
                }
              }
              currentRoomCode = null;
              currentMemberId = null;
            }
            break;
          }
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
        ws.send(JSON.stringify({ type: "error", message: "Invalid message" }));
      }
    });

    ws.on("close", () => {
      if (currentRoomCode) {
        const connections = roomConnections.get(currentRoomCode);
        if (connections) {
          connections.delete(ws);
          if (connections.size === 0) {
            roomConnections.delete(currentRoomCode);
          }
        }
      }
    });
  });

  // AI silence detector - checks every 10 seconds for rooms with 30s of silence
  setInterval(async () => {
    try {
      const now = Date.now();

      for (const [roomCode, lastActivity] of Array.from(roomLastActivity.entries())) {
        const silenceTime = now - lastActivity.getTime();

        if (silenceTime >= AI_SILENCE_THRESHOLD && silenceTime < AI_SILENCE_THRESHOLD + 10000) {
          // Room has been silent for 30-40 seconds, trigger AI if active
          const room = await storage.getRoomByCode(roomCode);
          if (room && room.aiMode && new Date() < room.expiresAt) {
            console.log(`[AI] Silence detected in room ${roomCode}, triggering response`);
            triggerAutoAiResponse(room, broadcastToRoom, "en");
            // Update activity to prevent repeated triggers
            roomLastActivity.set(roomCode, new Date());
          }
        }
      }
    } catch (error) {
      console.error("AI silence detector error:", error);
    }
  }, 10000);

  // Room cleanup job - runs every minute
  setInterval(async () => {
    try {
      const expiredRooms = await storage.getExpiredRooms();
      for (const room of expiredRooms) {
        console.log(`Cleaning up expired room: ${room.code}`);

        // Notify connected clients
        broadcastToRoom(room.code, { type: "room_expired" });

        // Delete room data
        await storage.deleteRoomMedia(room.id);
        await storage.deleteRoomMessages(room.id);
        await storage.deleteRoom(room.id);

        // Clean up connections and tracking
        roomConnections.delete(room.code);
        roomMessageCounts.delete(room.code);
        roomLastActivity.delete(room.code);
      }
    } catch (error) {
      console.error("Room cleanup error:", error);
    }
  }, 60000);

  return httpServer;
}