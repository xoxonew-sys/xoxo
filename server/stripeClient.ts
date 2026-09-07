import Stripe from "stripe";

/**
 * Stripe istemcisi - tek kurulum noktasi.
 *
 * DOGRULANMADI: Bu modul bugune kadar canli bir Stripe anahtariyla
 * calistirilmadi. STRIPE_SECRET_KEY ortamda yokken yazildi; asagidaki
 * kod tip denetiminden gecer ama Stripe API'sine karsi hic denenmedi.
 * Ilk gercek anahtar girildiginde checkout akisi bastan sona elle
 * dogrulanmalidir.
 *
 * ISIMLER NEDEN BOYLE:
 * getUncachableStripeClient adi Replit connector doneminden kaliyor -
 * orada anahtar platform tarafindan donduruluyordu, bu yuzden istemci
 * "onbelleklenemez" sayiliyordu. Artik anahtar duz bir ortam
 * degiskeni; donme yok, dolayisiyla istemci bir kez kurulup surec
 * boyunca saklaniyor. Ad, server/routes.ts icindeki uc cagri yeri
 * oldugu gibi kalsin diye korundu; payment yolunda gereksiz degisiklik
 * yapmamak icin. Isim yaniltici, davranis degil.
 *
 * IKI AYRI ANAHTAR:
 *   STRIPE_SECRET_KEY      sk_... - sadece sunucuda. Asla istemciye gitmez.
 *   STRIPE_PUBLISHABLE_KEY pk_... - tarayiciya aciktir, gizli degildir.
 * Ayni anahtarin iki bicimi degil, Stripe panelinde yan yana duran iki
 * ayri degerdir. Ikisi de ayni moda ait olmali: test anahtari test
 * anahtariyla, canli anahtar canli anahtarla.
 *
 * API SURUMU NEDEN SABITLENMEDI:
 * apiVersion elle verilirse, SDK'nin tiplerinin bildigi surumden farkli
 * bir metin yazmak derleme hatasi uretir ve her SDK yukseltmesinde elle
 * duzeltme ister. Sabitlenmedigi surece stripe@18.5.0 kendi varsayilan
 * surumunu kullanir; bu surum SDK ile birlikte guncellenir. Stripe
 * panelinden bir surume sabitlenmek gerekirse, once SDK'yi o surumu
 * bilen bir surume yukseltin.
 */

/** Surec boyunca tek istemci. Anahtar donmedigi icin guvenli. */
let client: Stripe | null = null;

function readSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY?.trim();

  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY tanimli degil. Railway > Variables icine " +
      "Stripe panelindeki gizli anahtari (sk_...) girin."
    );
  }

  // Yanlis anahtari yapistirmak sik yapilan hata; sessizce 401 almak
  // yerine burada soyleyelim.
  if (key.startsWith("pk_")) {
    throw new Error(
      "STRIPE_SECRET_KEY'e publishable anahtar (pk_...) girilmis. " +
      "Sunucu gizli anahtari ister: sk_test_... veya sk_live_..."
    );
  }

  if (!key.startsWith("sk_") && !key.startsWith("rk_")) {
    throw new Error(
      "STRIPE_SECRET_KEY beklenen bicimde degil; sk_ veya rk_ ile baslamali."
    );
  }

  return key;
}

/**
 * Stripe istemcisini dondurur. Anahtar yoksa ACIKLAYICI bir hata atar -
 * cagri yerlerindeki try/catch bunu 500'e cevirir, ama log'da neyin
 * eksik oldugu yazar.
 */
export async function getUncachableStripeClient(): Promise<Stripe> {
  if (client) return client;

  const key = readSecretKey();
  client = new Stripe(key);

  console.log(
    `[STRIPE] Istemci kuruldu (${key.startsWith("sk_live_") ? "CANLI" : "test"} mod)`
  );

  return client;
}

/**
 * Tarayiciya verilecek publishable anahtar.
 *
 * Su an istemci Stripe.js yuklemiyor - checkout, sunucunun urettigi
 * session.url adresine yonlendirmeyle yapiliyor - yani bu deger
 * kullanilmiyor. Endpoint yine de duruyor cunku istemci tarafinda
 * Stripe Elements'e gecilirse gereken tek sey bu.
 */
export async function getStripePublishableKey(): Promise<string> {
  const key = process.env.STRIPE_PUBLISHABLE_KEY?.trim();

  if (!key) {
    throw new Error(
      "STRIPE_PUBLISHABLE_KEY tanimli degil. Railway > Variables icine " +
      "Stripe panelindeki acik anahtari (pk_...) girin."
    );
  }

  if (key.startsWith("sk_")) {
    // Bu, gizli anahtari tarayiciya sizdirmak demek olurdu.
    throw new Error(
      "STRIPE_PUBLISHABLE_KEY'e gizli anahtar (sk_...) girilmis. " +
      "Bu deger tarayiciya gonderilir; pk_ ile baslayan anahtari girin."
    );
  }

  return key;
}

/**
 * Odeme yollarini acmadan once bakilir; anahtar yoksa checkout
 * endpoint'leri kullaniciya "yakinda" demek yerine 503 dondurebilir.
 */
export function isStripeConfigured(): boolean {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return Boolean(key && (key.startsWith("sk_") || key.startsWith("rk_")));
}

/**
 * Stripe'in kullaniciyi geri gonderecegi adres.
 *
 * Eskiden checkout rotalari REPLIT_DOMAINS okuyordu. Railway'de boyle bir
 * degisken yok, dolayisiyla adres `https://undefined/...` cikiyor ve Stripe
 * oturum acmayi reddediyordu. PUBLIC_DOMAIN .env.example'da zaten tanimli;
 * RAILWAY_PUBLIC_DOMAIN'i de Railway kendisi enjekte eder.
 *
 * Sondaki bolu isareti kirpilir, cunku cagri yerleri `${base}/pricing`
 * diye birlestiriyor.
 */
export function checkoutBaseUrl(): string {
  const explicit = process.env.PUBLIC_DOMAIN?.trim();
  if (explicit) {
    const withScheme = explicit.startsWith("http") ? explicit : `https://${explicit}`;
    return withScheme.replace(/\/+$/, "");
  }

  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railway) return `https://${railway}`;

  return `http://localhost:${process.env.PORT || 5000}`;
}
