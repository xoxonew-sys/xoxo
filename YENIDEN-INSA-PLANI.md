# XOXO Gossip AI — Yeniden İnşa Planı

**Durum:** Kaynak kod kaybı doğrulandı. Replit hesabı silinmiş, Vercel'de proje yok,
Supabase'de proje yok, Cloudflare'de iz yok. Veritabanı Replit'in dahili PostgreSQL'iydi
ve hesapla birlikte gitti.

**Elimizdeki temel:** `routes.ts` (3.858 satır) + `Chat.tsx` (1.019 satır)

---

## Tamamlanan (bu turda üretildi)

| Dosya | Kaynak | Durum |
|---|---|---|
| `shared/schema.ts` | routes.ts kolon/tablo referanslarından türetildi | 13 tablo + 7 Zod şeması |
| `server/storage.ts` | routes.ts'in çağırdığı 55 metodun tamamı | Eksiksiz |
| `server/db.ts` | Drizzle + Neon serverless bağlantısı | Hazır |
| `server/email.ts` | OTP üretimi + Resend ile doğrulama/sıfırlama e-postaları | Hazır |
| `shared/routes.ts` | `api.*` sözleşmesi (confessions, chatSessions, chatMessages) | Hazır |
| `package.json`, `drizzle.config.ts`, `.env.example` | Bağımlılıklar routes.ts import'larından | Hazır |

**Sonuç:** `routes.ts` artık derlenebilir durumda. Backend'in %90'ı ayakta.

---

## Kalan iş

### Aşama 1 — Sunucu tamamlama (yarım gün)
- `server/index.ts` — Express kurulumu, session middleware, Vite entegrasyonu
- `server/vite.ts` — dev/prod statik servis
- `server/stripe.ts` — routes.ts'te `/api/stripe/*` kullanılıyor; ürün ve fiyat ID'leri
  **Stripe panelinden** alınacak (orada duruyorlar, kod kaybı bunları etkilemedi)

### Aşama 2 — Frontend altyapısı (1 gün)
`Chat.tsx`'in import listesinden çıkan eksikler:

**Context'ler (5):** `AuthContext`, `CreditContext`, `AvatarContext` (+ `getAvatarsByGender`),
`LanguageContext`, `VoiceModeContext`

**Component'ler (6):** `NeonButton`, `EmojiPicker`, `TypingIndicator` (+ `PulseAvatar`,
`MessageReveal`), `PaywallPopup`, `AudioVisualizer` (+ `VoicePlaybackIndicator`,
`ZeroTextVoiceInterface`)

**Hook'lar (3):** `use-chat`, `use-voice` (mobil `continuous` düzeltmesi ve `dedupeRepeats`
dahil), `use-toast`

**Yardımcılar:** `lib/utils.ts` (`cn`), `lib/queryClient.ts`

### Aşama 3 — Sayfalar (1 gün)
`Home`, `CharacterSelect`, `AvatarSelector`, `Judgment`, `Chat` (var), `Profile`,
`Pricing`, `AdminLogin`, `AdminDashboard`, `XRoomCreate`, `XRoomChat`

### Aşama 4 — Yayın (yarım gün)
- Yeni host: Vercel veya Railway (Replit'e geri dönmüyoruz)
- Yeni PostgreSQL: Neon veya Supabase — **bu sefer harici**, tek noktada kayıp riski yok
- `xoxo-apps.com` DNS'i yeni host'a
- `.well-known/assetlinks.json` — SHA256 parmak izi Play Console'da duruyor:
  `03:30:A5:C3:0D:F7:0D:3E:92:93:38:49:84:8B:2C:A8:AD:C5:B2:B7:AF:6A:AF:58:C2:00:2D:90:2C:EB:27:AB`
- TWA kabuğu değişmiyor; paket `com.xoxo.gossipai` aynı kalır, yeni sürüm gerekmez

**Tahmini toplam: 2,5–3 gün**

---

## Kaybolmayanlar

- Tüm karakter sistem prompt'ları (Angel / Bestie / Snake, alt seviyeler, TR+EN, erkek+kadın)
- 69 API endpoint'inin iş mantığı
- ElevenLabs ve OpenAI ses eşleştirmeleri, `validateVoiceIdentity`, `humanizeText`
- 18 avatar görseli, uygulama ikonu, splash logosu
- Play Store yayını, paket adı, imza anahtarı, geliştirici hesabı
- Stripe ürün/fiyat tanımları, ElevenLabs ses ID'leri (ilgili panellerde)

## Kalıcı olarak kaybolanlar

- Kullanıcı hesapları, kredi bakiyeleri, ödeme geçmişi, sohbet geçmişi (veritabanı)
- Tam CSS/tema dosyaları — yeniden tasarlanacak (görseller elimizde olduğu için palet belli)

---

## Bir daha yaşanmaması için

1. **Git zorunlu.** Her projeyi ilk günden GitHub'a bağla — `mavcimavci1983-create` hesabında
   `xoxo-gossip-ai` özel deposu aç, bu klasörü ilk commit yap.
2. **Veritabanını host'tan ayır.** Neon/Supabase harici olsun; host silinse bile veri kalır.
3. **Hesap silmeden önce dışa aktar.** Replit/Vercel hesabı kapatmadan önce zip indir.
