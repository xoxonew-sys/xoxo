# XOXO Gossip AI

Replit kaynak kodu kaybından sonra yeniden inşa edilen sürüm.
Yeni altyapı: **Neon** (PostgreSQL) + **Railway** (Node/Express barındırma).

---

## Neden Railway, Vercel değil

`server/routes.ts` X-Room canlı sohbeti için `ws` üzerinden kalıcı WebSocket
bağlantısı açıyor. Vercel'in serverless fonksiyonları istek bitince kapandığı
için bu bağlantı orada yaşayamaz. Railway kalıcı bir Node süreci çalıştırır,
kodda hiçbir değişiklik gerekmez.

---

## Kurulum

### 1. Neon veritabanı

1. https://neon.tech → yeni proje: `xoxo-gossip-ai`, bölge **Frankfurt (eu-central-1)**
   (Türkiye'ye en yakın olan; gecikme en düşük)
2. Dashboard → **Connection string** → **Pooled connection** sekmesi
   (`-pooler` içeren adres — havuzlanmamış olanı alma)
3. Adresi kopyala

### 2. Yerel çalıştırma

```bash
npm install
cp .env.example .env      # DATABASE_URL ve anahtarları doldur
npm run db:push           # şemayı Neon'a yaz
npm run dev               # http://localhost:5000
```

`db:push` 13 tabloyu oluşturur: users, chat_sessions, chat_messages,
confessions, payments, rooms, room_members, room_messages, admin_settings,
user_bans, global_notifications, usage_analytics, api_cost_tracking, email_logs.

### 3. Railway yayını

1. https://railway.app → **New Project** → **Deploy from GitHub repo**
2. Repoyu seç → Railway `railway.json`'ı okur, ayar gerekmez
3. **Variables** sekmesine `.env.example`'daki tüm değişkenleri gir
   (`DATABASE_URL` Neon'un pooled adresi olacak)
4. **Settings → Networking → Generate Domain** ile geçici adres al, test et
5. Çalıştığını doğrulayınca **Custom Domain** → `xoxo-apps.com` ekle
6. Alan adı sağlayıcında Railway'in verdiği CNAME kaydını gir

### 4. Android uygulamasını geri bağlama

TWA kabuğu web sitesini gösterdiği için **yeni sürüm yayınlamaya gerek yok**.
`xoxo-apps.com` yeni sunucuya bağlandığı an uygulama tekrar çalışır.

Tek şart: `client/public/.well-known/assetlinks.json` dosyası yayınlanmalı.
İçeriği:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.xoxo.gossipai",
    "sha256_cert_fingerprints": [
      "03:30:A5:C3:0D:F7:0D:3E:92:93:38:49:84:8B:2C:A8:AD:C5:B2:B7:AF:6A:AF:58:C2:00:2D:90:2C:EB:27:AB"
    ]
  }
}]
```

---

## Bu depoda ne var, ne yok

### Hazır
- `server/routes.ts` — kurtarıldı (3.858 satır, 69 endpoint, tüm karakter prompt'ları)
- `client/src/pages/Chat.tsx` — kurtarıldı (1.019 satır)
- `shared/schema.ts` — routes.ts'ten yeniden türetildi
- `server/storage.ts` — 55 metodun tamamı
- `server/db.ts`, `server/email.ts`, `shared/routes.ts`
- 5 context: Auth, Credit, Avatar, Language, VoiceMode
- 3 hook: use-chat, use-voice (mobil düzeltmeleri dahil), use-toast
- 6 component: NeonButton, EmojiPicker, TypingIndicator (+PulseAvatar,
  MessageReveal), PaywallPopup, AudioVisualizer (+VoicePlaybackIndicator,
  ZeroTextVoiceInterface)
- Yapılandırma: package.json, tsconfig, vite.config, drizzle.config, railway.json

### Eksik (sıradaki iş)
- `server/index.ts` — Express kurulumu, oturum yönetimi, WebSocket sunucusu, Vite bağlama
- `server/vite.ts` — geliştirme/üretim statik servisi
- `client/src/App.tsx`, `main.tsx`, `index.css` — tema değişkenleri (`--primary` vb.)
- Sayfalar: Home, CharacterSelect, AvatarSelector, Judgment, Profile, Pricing,
  AdminLogin, AdminDashboard, XRoomCreate, XRoomChat
- `client/src/assets/images/` — 18 avatar `.webp` dosyası (elde var, kopyalanacak)
- Stripe ürün/fiyat kimlikleri — Stripe panelinden alınacak

---

## Ortam değişkenleri

`.env.example` dosyasına bak. Kritik olanlar:

| Değişken | Nereden alınır |
|---|---|
| `DATABASE_URL` | Neon → Pooled connection |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | console.anthropic.com |
| `ELEVENLABS_API_KEY` | elevenlabs.io → Profile |
| `STRIPE_SECRET_KEY` | dashboard.stripe.com |
| `RESEND_API_KEY` | resend.com |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `ADMIN_PASSWORD` | kendin belirle |

Not: `AI_INTEGRATIONS_*` isimleri Replit connector'larından geliyordu.
`routes.ts` bu adlarla okuduğu için değiştirmedim; `*_BASE_URL` değişkenlerini
boş bırakırsan SDK'lar resmi API adreslerini kullanır.
