import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

/* ============================================================
   Avatar kayıt defteri

   Görseller client/public/avatars/ altında duruyor ve build'de
   dist/public/avatars/ içine kopyalanıyor. Tarayıcıya /avatars/
   yolundan servis ediliyorlar.

   İsimlendirme: {karakter}[-male]-{avatar-1|avatar-2|character}.webp
   Karakter: angel | bestie | snake        → toplam 18 dosya

   character = tür kartı (800x1200)
   avatar-1  = kart görselindeki kişi (512x512)  → subLevel 1
   avatar-2  = aynı tür, farklı kişi (512x512)   → subLevel 2

   ÖNEMLİ: Avatar seçimi aynı zamanda kişilik seviyesi seçimidir.
   Kullanıcı avatar-2'yi seçtiğinde subLevel 2 olur ve sunucu o
   kişiliğin sistem promptunu kullanır. Ayrı bir seviye düğmesi yok.

   Akış: cinsiyet → tür (characterCards) → avatar (= seviye) → chat
   ============================================================ */

export type Personality = 1 | 2 | 3; // 1=Angel 2=Bestie 3=Snake
export type Gender = "male" | "female";

/**
 * ElevenLabs ses ayarları.
 * voiceId değerleri ElevenLabs'in hazır kütüphanesinden seçildi.
 * Kendi hesabındaki sesleri kullanmak istersen sadece aşağıdaki
 * VOICES bloğunu değiştir, başka yere dokunmana gerek yok.
 *
 * stability: düşük = daha duygusal/değişken, yüksek = daha sabit
 * style:     yüksek = daha abartılı tonlama
 */
export interface VoiceConfig {
  voiceId: string;
  stability: number;
  style: number;
}

export interface AvatarOption {
  id: string;
  /** Tür içindeki seçenek sırası — sunucuya subLevel olarak gider */
  subLevel: 1 | 2;
  nameTr: string;
  nameEn: string;
  /** Seçim ekranında gösterilen tek satırlık tanım */
  blurbTr: string;
  blurbEn: string;
  image: string;
  voice: VoiceConfig;
}

const img = (name: string) => `/avatars/${name}.webp`;

/* Tür ve cinsiyet başına bir taban ses; seviye farkı stability/style ile */
const VOICES = {
  angelFemale: "EXAVITQu4vr4xnSDxMaL",
  angelMale: "ErXwobaYiN019PkySvjV",
  bestieFemale: "MF3mGyEYCl7XYWbV9V6O",
  bestieMale: "TxGEqnHWrfWFTfGW9XjX",
  snakeFemale: "AZnzlk1XvdvUeBnXmlld",
  snakeMale: "VR6AewLTigWG4xSOukaG",
} as const;

const femaleAvatars: Record<Personality, AvatarOption[]> = {
  1: [
    {
      id: "angel-1",
      subLevel: 1,
      nameTr: "Sığınak",
      nameEn: "Sanctuary",
      blurbTr: "Sakin, bilge, yatıştırıcı",
      blurbEn: "Calm, wise, grounding",
      image: img("angel-avatar-1"),
      voice: { voiceId: VOICES.angelFemale, stability: 0.75, style: 0.15 },
    },
    {
      id: "angel-2",
      subLevel: 2,
      nameTr: "Sıcaklık",
      nameEn: "Warmth",
      blurbTr: "Şefkatli, cesaret veren, yakın",
      blurbEn: "Caring, encouraging, close",
      image: img("angel-avatar-2"),
      voice: { voiceId: VOICES.angelFemale, stability: 0.5, style: 0.4 },
    },
  ],
  2: [
    {
      id: "bestie-1",
      subLevel: 1,
      nameTr: "Kanka",
      nameEn: "Bestie",
      blurbTr: "Dedikoducu, sırdaş, hep yanında",
      blurbEn: "Gossipy, loyal, always there",
      image: img("bestie-avatar-1"),
      voice: { voiceId: VOICES.bestieFemale, stability: 0.4, style: 0.55 },
    },
    {
      id: "bestie-2",
      subLevel: 2,
      nameTr: "Yol Arkadaşı",
      nameEn: "Wingwoman",
      blurbTr: "Aynı kafada, ama yön gösteren",
      blurbEn: "On your side, but points the way",
      image: img("bestie-avatar-2"),
      voice: { voiceId: VOICES.bestieFemale, stability: 0.6, style: 0.35 },
    },
  ],
  3: [
    {
      id: "snake-1",
      subLevel: 1,
      nameTr: "Keskin Dil",
      nameEn: "Sharp Tongue",
      blurbTr: "Otoriter, sarsıcı, tavizsiz",
      blurbEn: "Commanding, blunt, unsparing",
      image: img("snake-avatar-1"),
      voice: { voiceId: VOICES.snakeFemale, stability: 0.8, style: 0.2 },
    },
    {
      id: "snake-2",
      subLevel: 2,
      nameTr: "Alaycı",
      nameEn: "Sardonic",
      blurbTr: "Oyuncu yılan, karanlık mizah",
      blurbEn: "Playful venom, dark humour",
      image: img("snake-avatar-2"),
      voice: { voiceId: VOICES.snakeFemale, stability: 0.45, style: 0.6 },
    },
  ],
};

const maleAvatars: Record<Personality, AvatarOption[]> = {
  1: [
    {
      id: "angel-male-1",
      subLevel: 1,
      nameTr: "Sığınak",
      nameEn: "Sanctuary",
      blurbTr: "Sakin, bilge, yatıştırıcı",
      blurbEn: "Calm, wise, grounding",
      image: img("angel-male-avatar-1"),
      voice: { voiceId: VOICES.angelMale, stability: 0.75, style: 0.15 },
    },
    {
      id: "angel-male-2",
      subLevel: 2,
      nameTr: "Sıcaklık",
      nameEn: "Warmth",
      blurbTr: "Şefkatli, cesaret veren, yakın",
      blurbEn: "Caring, encouraging, close",
      image: img("angel-male-avatar-2"),
      voice: { voiceId: VOICES.angelMale, stability: 0.5, style: 0.4 },
    },
  ],
  2: [
    {
      id: "bestie-male-1",
      subLevel: 1,
      nameTr: "Kanka",
      nameEn: "Bestie",
      blurbTr: "Dedikoducu, sırdaş, hep yanında",
      blurbEn: "Gossipy, loyal, always there",
      image: img("bestie-male-avatar-1"),
      voice: { voiceId: VOICES.bestieMale, stability: 0.4, style: 0.55 },
    },
    {
      id: "bestie-male-2",
      subLevel: 2,
      nameTr: "Yol Arkadaşı",
      nameEn: "Wingman",
      blurbTr: "Aynı kafada, ama yön gösteren",
      blurbEn: "On your side, but points the way",
      image: img("bestie-male-avatar-2"),
      voice: { voiceId: VOICES.bestieMale, stability: 0.6, style: 0.35 },
    },
  ],
  3: [
    {
      id: "snake-male-1",
      subLevel: 1,
      nameTr: "Keskin Dil",
      nameEn: "Sharp Tongue",
      blurbTr: "Soğuk, mesafeli, iğneleyici",
      blurbEn: "Cold, distant, cutting",
      image: img("snake-male-avatar-1"),
      voice: { voiceId: VOICES.snakeMale, stability: 0.85, style: 0.15 },
    },
    {
      id: "snake-male-2",
      subLevel: 2,
      nameTr: "Alaycı",
      nameEn: "Sardonic",
      blurbTr: "Oyuncu yılan, karanlık mizah",
      blurbEn: "Playful venom, dark humour",
      image: img("snake-male-avatar-2"),
      voice: { voiceId: VOICES.snakeMale, stability: 0.5, style: 0.55 },
    },
  ],
};

/** Tür seçim ekranındaki büyük dikey kartlar (800x1200) */
export const characterCards: Record<Gender, Record<Personality, string>> = {
  female: {
    1: img("angel-character"),
    2: img("bestie-character"),
    3: img("snake-character"),
  },
  male: {
    1: img("angel-male-character"),
    2: img("bestie-male-character"),
    3: img("snake-male-character"),
  },
};

export function getAvatarsByGender(gender: Gender): Record<Personality, AvatarOption[]> {
  return gender === "male" ? maleAvatars : femaleAvatars;
}

interface AvatarContextValue {
  /** Seçim yoksa o türün ilk seçeneğine düşer — asla undefined dönmez */
  getAvatar: (personality: Personality) => AvatarOption;
  setAvatar: (personality: Personality, avatarId: string) => void;
  selected: Record<Personality, string | undefined>;
  gender: Gender;
  setGender: (gender: Gender) => void;
  /**
   * Giriş yapan kullanıcının hesabındaki cinsiyeti bağlama taşır.
   * Kullanıcı bu cihazda henüz seçim yapmadıysa hesaptaki değer uygulanır;
   * seçim yaptıysa yerel tercihi ezilmez.
   */
  syncGenderFromAccount: (gender?: string | null) => void;
  /** Cinsiyet daha önce seçildi mi — onboarding adımı için */
  genderChosen: boolean;
}

const AvatarContext = createContext<AvatarContextValue | null>(null);

const STORAGE_KEY = "xoxo_avatar_selection";
const GENDER_KEY = "xoxo_avatar_gender";

export function AvatarProvider({ children }: { children: ReactNode }) {
  const [genderChosen, setGenderChosen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(GENDER_KEY) !== null;
  });

  const [gender, setGenderState] = useState<Gender>(() => {
    const saved = typeof window !== "undefined" && window.localStorage.getItem(GENDER_KEY);
    return saved === "male" ? "male" : "female";
  });

  const [selected, setSelected] = useState<Record<Personality, string | undefined>>(() => {
    if (typeof window === "undefined") return { 1: undefined, 2: undefined, 3: undefined };
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : { 1: undefined, 2: undefined, 3: undefined };
    } catch {
      return { 1: undefined, 2: undefined, 3: undefined };
    }
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selected));
  }, [selected]);

  useEffect(() => {
    if (genderChosen) window.localStorage.setItem(GENDER_KEY, gender);
  }, [gender, genderChosen]);

  const setGender = (next: Gender) => {
    setGenderState(next);
    setGenderChosen(true);
  };

  const syncGenderFromAccount = (accountGender?: string | null) => {
    if (genderChosen) return; // yerel seçim önceliklidir
    if (accountGender !== "male" && accountGender !== "female") return;
    setGenderState(accountGender);
    setGenderChosen(true);
  };

  const getAvatar = (personality: Personality): AvatarOption => {
    const list = getAvatarsByGender(gender)[personality];
    const id = selected[personality];
    return list.find((a) => a.id === id) ?? list[0];
  };

  const setAvatar = (personality: Personality, avatarId: string) =>
    setSelected((prev) => ({ ...prev, [personality]: avatarId }));

  return (
    <AvatarContext.Provider
      value={{
        getAvatar,
        setAvatar,
        selected,
        gender,
        setGender,
        syncGenderFromAccount,
        genderChosen,
      }}
    >
      {children}
    </AvatarContext.Provider>
  );
}

export function useAvatar() {
  const ctx = useContext(AvatarContext);
  if (!ctx) throw new Error("useAvatar, AvatarProvider içinde kullanılmalı");
  return ctx;
}
