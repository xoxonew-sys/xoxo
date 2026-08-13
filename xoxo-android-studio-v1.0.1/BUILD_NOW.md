# XOXO Android Studio → .aab Yapım Kılavuzu
**versionCode: 2 | versionName: 1.0.1 | packageId: com.xoxo.gossipai**

---

## ⚡ ADIM 1: Android Studio Kurulumu (ilk kez kuruyorsan)
1. https://developer.android.com/studio adresinden indir
2. Kur ve başlat
3. İlk açılışta SDK otomatik indirilir (~1-2GB, beklersen tamamlanır)

---

## 📂 ADIM 2: Projeyi Aç
1. Android Studio'yu aç
2. **"Open"** tıkla (ya da File → Open)
3. Bu zip'i çıkardığın klasörü seç (`xoxo-android-studio`)
4. Gradle sync otomatik başlar → bitene kadar bekle (2-3 dk)

---

## 🔑 ADIM 3: Keystore Oluştur (İLK KEZ)
Play Store'a yüklemek için imzalı .aab gerekli.

1. Android Studio menüsünden: **Build → Generate Signed Bundle / APK**
2. **Android App Bundle** seç → **Next**
3. **"Create new..."** tıkla:
   - Key store path: Bilgisayarında güvenli bir yere kaydet (ör: Desktop/xoxo.jks)
   - Password: Güçlü bir şifre yaz (**SAKLA**)
   - Alias: `xoxo`
   - Key password: Aynı şifre
   - Validity: 25
   - Certificate bilgilerini doldur (Ad, Ülke kodu: TR)
4. **OK** tıkla

> ⚠️ Bu keystore dosyasını ASLA kaybetme — Play Store'a her güncelleme için lazım!

---

## 🏗️ ADIM 4: .aab'yi Build Et
1. Build → Generate Signed Bundle / APK devam eder
2. Keystore seçili gelecek → **Next**
3. **release** seç
4. Destination folder: istediğin yer
5. **Finish** tıkla

Build 2-3 dakika sürer. Sonunda:
`app/release/app-release.aab` dosyası hazır!

---

## 🌐 ADIM 5: assetlinks.json Güncelle (ÖNEMLİ!)
TWA'nın doğru çalışması için Play Console'dan SHA-256 fingerprint alman gerekiyor.

1. **Play Console** → Uygulamana gir → Setup → App signing
2. "App signing key certificate" bölümündeki **SHA-256 fingerprint**'i kopyala
3. xoxo-apps.com'daki geliştiriciye (Replit Agent'a) ver:
   > "assetlinks.json'a bu SHA-256 fingerprint'i ekle: [fingerprint]"

---

## 📤 ADIM 6: Play Console'a Yükle
1. https://play.google.com/console
2. Uygulamanı seç → Production (veya Internal testing)
3. **Create new release** → .aab dosyasını yükle
4. Release notes ekle → **Review release** → **Start rollout**

---

## 📋 Proje Özeti
| Alan | Değer |
|------|-------|
| Package ID | com.xoxo.gossipai |
| Version Code | 2 |
| Version Name | 1.0.1 |
| Min SDK | 19 (Android 4.4+) |
| Target SDK | 34 (Android 14) |
| URL | https://xoxo-apps.com |
| Theme Color | #ec4899 (XOXO Pink) |
