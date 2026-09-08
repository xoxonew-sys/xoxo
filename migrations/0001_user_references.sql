-- =====================================================================
-- 0001  Kullanici referanslari: sayisal id, yabanci anahtarlar, tek
--       seferlik temizlik.
--
-- ELLE CALISTIRILIR (Neon SQL Editor). "npm run db:push" DEGIL.
-- Bu dosya satir siler; drizzle-kit kararina birakilmaz.
--
-- CALISTIRMADAN ONCE: asagidaki ON KONTROL bloklarini tek basina
-- calistirin ve sayilarin burada yazanlarla ayni oldugunu gorun.
-- Ayni degilse veri degismistir; migration'i degil, sayilari dogrulayin.
--
-- 8 Eylul 2026 itibariyla uretimde beklenen: 8 oturum, 32 mesaj silinir.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ON KONTROL -- hicbir seyi degistirmez. Once bunu calistirin.
-- Beklenen sonuc: 8 / 32 / 10
-- ---------------------------------------------------------------------
-- SELECT 'silinecek oturum' AS ne, count(*)::text AS kac
--   FROM chat_sessions
--  WHERE user_id LIKE '%@%'
--    AND lower(user_id) NOT IN (SELECT lower(email) FROM users)
-- UNION ALL
-- SELECT 'silinecek mesaj', count(*)::text
--   FROM chat_messages
--  WHERE session_id IN (SELECT id FROM chat_sessions
--                        WHERE user_id LIKE '%@%'
--                          AND lower(user_id) NOT IN (SELECT lower(email) FROM users))
-- UNION ALL
-- SELECT 'korunacak anonim oturum', count(*)::text
--   FROM chat_sessions WHERE user_id = 'anonymous';

BEGIN;

-- ---------------------------------------------------------------------
-- 1. chat_sessions.user_ref -- sayisal, degismez referans
--
-- NEDEN YENI SUTUN, TIP DEGISTIRME DEGIL:
-- Mevcut user_id metin ve icinde uc ayri sey var: 'anonymous', e-posta
-- adresi, ve bugunun kodunun yazdigi sayisal id'nin metin hali. Tek bir
-- ALTER ... TYPE bunlarin ucunu birden ceviremez. Sutun eklenip
-- doldurulur; user_id yerinde birakilir ve artik yetkili degildir.
--
-- NEDEN E-POSTA DEGIL ID:
-- E-posta degisebilir. Adresini degistiren kullanici kendi gecmisini
-- oksuz birakmamali. Degisebilen bir dizgeye konan yabanci anahtar,
-- zaman zaman hicbir seyi gostermeyen bir yabanci anahtardir.
-- ---------------------------------------------------------------------
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS user_ref integer;

UPDATE chat_sessions cs
   SET user_ref = u.id
  FROM users u
 WHERE cs.user_ref IS NULL
   AND lower(cs.user_id) = lower(u.email);

UPDATE chat_sessions cs
   SET user_ref = cs.user_id::int
 WHERE cs.user_ref IS NULL
   AND cs.user_id ~ '^[0-9]+$'
   AND EXISTS (SELECT 1 FROM users u WHERE u.id = cs.user_id::int);

-- ---------------------------------------------------------------------
-- 2. TEK SEFERLIK SILME -- 8 oturum, 32 mesaj.
--
-- BU SATIRLAR NEYDI:
-- Sekizi de 16 Agustos 2026'da 18:46:53 ile 18:53:59 arasinda, yedi
-- dakikalik tek bir pencerede olusturuldu. Her biri user_id sutununda bir
-- e-posta adresi tasiyor ve bu adreslerin HICBIRI bugun var olan bir
-- kullaniciya karsilik gelmiyor. Hayatta kalan en eski kullanici
-- 18:33:50'de yaratilmis -- yani bu oturumlar o gunun calismasi sirasinda
-- acilip sonra silinen hesaplara ait.
--
-- NEDEN SILINIYOR:
-- Sahibi olmayan sohbet icerigi. Kimse uzerinde KVKK m.11 hakkini
-- kullanamaz, cunku kime ait oldugu artik bulunamiyor; ve hesabini silmis
-- kisilerin yazdiklari elde tutuluyor. Bu bir temizlik degil, kayda
-- gecmis bir silme islemidir.
--
-- 10 ANONIM SATIR NEDEN KALIYOR:
-- user_id = 'anonymous' sutun varsayilanidir. O oturumlarin HIC kullanicisi
-- olmadi; oksuz degiller. Silmek, dogru olan veriyi silmek olurdu.
-- 15-18 Agustos arasi, 60 mesaj, dokunulmuyor.
--
-- chat_messages ON DELETE CASCADE ile bagli (uretimde dogrulandi:
-- chat_messages_session_id_chat_sessions_id_fk), mesajlar kendiliginden gider.
-- ---------------------------------------------------------------------
DELETE FROM chat_sessions
 WHERE user_id LIKE '%@%'
   AND user_ref IS NULL;

-- ---------------------------------------------------------------------
-- 3. chat_sessions -> users, ON DELETE CASCADE
-- Sohbet icerigi kullanicinin kendi verisidir. Silme hakki kullanildiginda
-- gitmesi gereken sey tam olarak budur.
-- ---------------------------------------------------------------------
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_sessions_user_ref_fk') THEN
    ALTER TABLE chat_sessions
      ADD CONSTRAINT chat_sessions_user_ref_fk
      FOREIGN KEY (user_ref) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END
$do$;

-- ---------------------------------------------------------------------
-- 4. payments.user_ref -> users, ON DELETE SET NULL
--
-- DORT CASCADE'IN YANINDA TEK SET NULL. BILEREK. TUTARLI HALE GETIRMEYIN.
--
-- Odeme kaydi mali bir belgedir ve hesaptan uzun yasamak zorundadir:
-- VUK saklama suresi 5 yil, TTK 10 yil. CASCADE burada, kullanici hesabini
-- sildigi anda o kisiye ait odeme kayitlarini da silerdi -- yani defterde
-- delik acardi. Bu, gizlilik lehine bir kazanc degil, ters yonde bir
-- UYUM IHLALI olurdu.
--
-- SET NULL dogru olani yapar: satir kalir, kisi gider. Tutar, para birimi,
-- durum ve Stripe kimlikleri (mali kayitta kimligi tasiyan alanlar bunlar)
-- yerinde durur; veriyi bir insana baglayan sutun bosalir. Ayni anda hem
-- saklama yukumlulugunu hem silme hakkini karsilayan tek davranis budur.
--
-- Bugun tablo bos (0 satir), yani kisit bedelsiz konuyor. Dogru an bu.
-- ---------------------------------------------------------------------
ALTER TABLE payments ADD COLUMN IF NOT EXISTS user_ref integer;

UPDATE payments p
   SET user_ref = p.user_id::int
 WHERE p.user_ref IS NULL
   AND p.user_id ~ '^[0-9]+$'
   AND EXISTS (SELECT 1 FROM users u WHERE u.id = p.user_id::int);

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_user_ref_fk') THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_user_ref_fk
      FOREIGN KEY (user_ref) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END
$do$;

-- ---------------------------------------------------------------------
-- YABANCI ANAHTAR KONULMAYANLAR -- bunlar da birer karardir.
--
-- email_logs: kasitli olarak kisitsiz. Tablo, hic kullanici olmamis
--   adreslere yapilan gonderimleri de kaydeder; yabanci anahtar bunlari
--   yasaklardi. Kontrol mekanizmasi kisit degil, 90 gunluk supurme
--   (server/retention.ts).
--
-- user_bans: kasitli olarak kisitsiz. CASCADE, yasakli kullaniciya
--   "hesabini sil, yasak da silinsin" yolunu acardi. Yasak kaydinin
--   hesaptan uzun yasamasi yasagin kendisidir.
--
-- room_members / room_messages: member_id sutunu 'ai' degerini de tasir,
--   bu yuzden kullanici anahtarina donusturulemez. Odalar zaten rooms'tan
--   CASCADE aliyor ve 60 dakika icinde kendiliginden siliniyor.
--
-- confessions: tabloda kullanici sutunu YOK. Baglanti eklemek tabloyu daha
--   tanimlanabilir yapar; bu bir duzeltme degil, ayri bir karardir.
-- ---------------------------------------------------------------------

COMMIT;

-- =====================================================================
-- KISIT MEVCUT VERI UZERINDE PATLAR MI - VE NEDEN SIRA ONEMLI
--
-- Evet, patlayabilirdi. ADD CONSTRAINT ... FOREIGN KEY mevcut satirlari
-- DOGRULAR: hicbir kullaniciyi gostermeyen bir user_ref degeri varsa
-- PostgreSQL kisiti REDDEDER. Duzeltmeye calistigimiz durum tam olarak
-- budur, dolayisiyla sira tesadufi degil:
--
--   1) sutun eklenir           -> hepsi NULL
--   2) doldurulur              -> yalnizca GERCEK bir users.id yazilir
--   3) cozulemeyenler silinir  -> geriye dogrulanamaz satir kalmaz
--   4) kisit eklenir           -> dogrulanacak her satir zaten gecerli
--
-- 3'u 4'ten sonra calistirirsaniz migration adim 4'te durur ve islem
-- geri alinir. Bu siranin bozulmamasi gerekir.
--
-- NULL SATIRLAR SORUN DEGIL. user_ref NOT NULL degildir; yabanci anahtar
-- NULL degerleri dogrulamaz. Korunan 10 'anonymous' oturum user_ref = NULL
-- ile kalir ve kisiti gecer. Sutun NOT NULL yapilsaydi bu 10 satir
-- migration'i durdururdu - bilerek nullable birakildi, cunku sahipsiz
-- oturum gecerli bir durumdur.
--
-- payments bugun 0 satir; orada dogrulanacak hicbir sey yok.
--
-- IKINCI KEZ CALISTIRILIRSA NE OLUR
--
-- 1, 3, 4  GUVENLI. ADD COLUMN IF NOT EXISTS hicbir sey yapmaz; UPDATE'ler
--          "user_ref IS NULL" ile korunuyor, dolduracak satir kalmaz;
--          kisitlar pg_constraint kontrolune sarili (PostgreSQL'de
--          ADD CONSTRAINT IF NOT EXISTS yoktur, DO blogu onun yerine gecer).
--
-- 2 (DELETE) FARKLI. Bugun ikinci calistirma 0 satir siler, cunku kosulu
--          karsilayan satir kalmaz. Ama kosul calistirma sayisina degil
--          ZAMANA baglidir: iki calistirma arasinda bir kullanici silinir ve
--          o kullanicinin eski e-posta anahtarli oturumlari varsa, ikinci
--          calistirma onlari da siler. Yani "no-op" degil, "o an uyani sil".
--
--          Adim 3'ten sonra bu pencere kendiliginden kapanir: yeni satirlar
--          user_ref tasir ve CASCADE ile duzgun gider, dolayisiyla eski
--          kosul yeni veriyle eslesemez.
--
-- GERI ALINAMAZ. Silinen 8 oturum ve 32 mesaj geri gelmez. Calistirmadan
-- once Neon'da bir branch acin; geri donus yolu budur.
-- =====================================================================
