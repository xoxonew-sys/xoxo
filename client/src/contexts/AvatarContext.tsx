import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

/* ============================================================
   Avatar kayıt defteri
   Dosya adları orijinal projedeki isimlendirmeyle birebir aynı:
   client/src/assets/images/{karakter}[-male]-{avatar-1|avatar-2|character}.webp
   ============================================================ */

export type Personality = 1 | 2 | 3; // 1=Angel 2=Bestie 3=Snake
export type Gender = "male" | "female";

export interface AvatarOption {
  id: string;
  /** Alt kişilik seviyesi — routes.ts'teki subLevel ile eşleşir */
  subLevel: 1 | 2;
  nameTr: string;
  nameEn: string;
  image: string;
}

/**
 * Görseller client/public/avatars/ altında duruyor.
 * Bundler'a bağlı çözümleme yerine düz statik yol kullanıyoruz:
 * dosya eksikse build patlamaz, sadece o görsel yüklenmez.
 */
const img = (name: string) => `/avatars/${name}.webp`;

const femaleAvatars: Record<Personality, AvatarOption[]> = {
  1: [
    { id: "angel-1", subLevel: 1, nameTr: "Koruyucu", nameEn: "Guardian", image: img("angel-avatar-1") },
    { id: "angel-2", subLevel: 2, nameTr: "Anlayışlı", nameEn: "Understanding", image: img("angel-avatar-2") },
  ],
  2: [
    { id: "bestie-1", subLevel: 1, nameTr: "Sadık Dost", nameEn: "Loyal Friend", image: img("bestie-avatar-1") },
    { id: "bestie-2", subLevel: 2, nameTr: "Sırdaş", nameEn: "Confidant", image: img("bestie-avatar-2") },
  ],
  3: [
    { id: "snake-1", subLevel: 1, nameTr: "Keskin Dil", nameEn: "Sharp Tongue", image: img("snake-avatar-1") },
    { id: "snake-2", subLevel: 2, nameTr: "Acı Gerçekçi", nameEn: "Bitter Realist", image: img("snake-avatar-2") },
  ],
};

const maleAvatars: Record<Personality, AvatarOption[]> = {
  1: [
    { id: "angel-male-1", subLevel: 1, nameTr: "Koruyucu", nameEn: "Guardian", image: img("angel-male-avatar-1") },
    { id: "angel-male-2", subLevel: 2, nameTr: "Anlayışlı", nameEn: "Understanding", image: img("angel-male-avatar-2") },
  ],
  2: [
    { id: "bestie-male-1", subLevel: 1, nameTr: "Sadık Dost", nameEn: "Loyal Friend", image: img("bestie-male-avatar-1") },
    { id: "bestie-male-2", subLevel: 2, nameTr: "Sırdaş", nameEn: "Confidant", image: img("bestie-male-avatar-2") },
  ],
  3: [
    { id: "snake-male-1", subLevel: 1, nameTr: "Keskin Dil", nameEn: "Sharp Tongue", image: img("snake-male-avatar-1") },
    { id: "snake-male-2", subLevel: 2, nameTr: "Acı Gerçekçi", nameEn: "Bitter Realist", image: img("snake-male-avatar-2") },
  ],
};

/** Karakter seçim ekranındaki büyük kart görselleri */
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

/** Chat.tsx bunu doğrudan import ediyor. */
export function getAvatarsByGender(gender: Gender): Record<Personality, AvatarOption[]> {
  return gender === "male" ? maleAvatars : femaleAvatars;
}

interface AvatarContextValue {
  /** Seçili avatar; seçim yoksa undefined döner (Chat.tsx fallback uyguluyor) */
  getAvatar: (personality: Personality) => AvatarOption | undefined;
  setAvatar: (personality: Personality, avatarId: string) => void;
  selected: Record<Personality, string | undefined>;
  gender: Gender;
  setGender: (gender: Gender) => void;
}

const AvatarContext = createContext<AvatarContextValue | null>(null);

const STORAGE_KEY = "xoxo_avatar_selection";
const GENDER_KEY = "xoxo_avatar_gender";

export function AvatarProvider({ children }: { children: ReactNode }) {
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
    window.localStorage.setItem(GENDER_KEY, gender);
  }, [gender]);

  const getAvatar = (personality: Personality) => {
    const id = selected[personality];
    if (!id) return undefined;
    return getAvatarsByGender(gender)[personality].find((a) => a.id === id);
  };

  const setAvatar = (personality: Personality, avatarId: string) =>
    setSelected((prev) => ({ ...prev, [personality]: avatarId }));

  return (
    <AvatarContext.Provider
      value={{ getAvatar, setAvatar, selected, gender, setGender: setGenderState }}
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
