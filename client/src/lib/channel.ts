/**
 * Dağıtım kanalı tespiti — uygulama mı, tarayıcı mı?
 *
 * BU BİR ÜRÜN SADELEŞTİRMESİ DEĞİL, UYUM ZORUNLULUĞUDUR.
 * Uygulamanın satmaması eksik kalmış bir özellik değil; mağaza
 * politikasının dayattığı durumdur. "Buraya bir satın alma bağlantısı
 * koyalım, yarım kalmış" diye düşünen biri uygulamayı App Store'dan
 * attırır. Bağlantı eklemeden önce bu dosyanın tamamını okuyun.
 *
 * NEDEN VAR:
 * Play ve App Store, uygulama içinde tüketilen dijital içeriğin kendi
 * ödeme sistemleriyle satılmasını şart koşar. Üçüncü taraf bir sağlayıcı
 * (Stripe, PayTR, Polar) bunun yerine geçmez. TWA kabuğu web sitesinin
 * kendisini gösterdiği için, sitedeki her satın alma yüzeyi aynı anda
 * uygulamanın içindedir. Ayrım yapılmazsa ihlal kaçınılmaz.
 *
 * Karar: uygulama satmaz, web satar. Uygulamada bakiye ve satın almanın
 * web sitesinden yapıldığını söyleyen bir satır gösterilir. Bağlantı
 * KONULMAZ — iOS'ta ihlal, Play'de gri alan.
 *
 * NASIL TESPİT EDİLİYOR (ve neden sunucu tek başına yapamıyor):
 * TWA, Chrome'un içinde çalışır ve Chrome'un çerez kavanozunu paylaşır.
 * Bu yüzden sunucuda çereze yazılan bir "kanal" bilgisi aynı cihazdaki
 * tarayıcı oturumuna da sızar; çerez kanalı değil cihazı işaretler.
 * Sunucunun gördüğü tek gerçek sinyal `Referer: android-app://...`
 * başlığıdır ve o da YALNIZCA ilk belge isteğinde gelir — SPA gezinmelerinde
 * ve /api çağrılarında yoktur.
 *
 * Bu yüzden tespit istemcide yapılır, yaptırım sunucuda: istemci kanalı
 * X-Client-Channel başlığıyla bildirir, sunucu "web" demeyen her checkout
 * isteğini reddeder (bkz. server/routes.ts, requireWebChannel).
 *
 * ÜÇ SİNYAL, BİLEREK GENİŞ:
 *   1. sessionStorage — sekme başına ayrıdır, Chrome sekmesine sızmaz;
 *      TWA içindeki yeniden yüklemelerde referrer kaybolsa da kalır.
 *   2. android-app:// referrer — kesin sinyal, ama sadece ilk yüklemede.
 *   3. display-mode: standalone — TWA'da doğru, ama tarayıcıdan kurulan
 *      PWA'da da doğru. Yani fazla eşleşir: tarayıcıdan PWA kuran kullanıcı
 *      da satın alma yüzeyini göremez.
 *
 * (3) BİLEREK BÖYLE. Yanlış tarafa düşmenin iki bedeli simetrik değil:
 * fazladan gizlemek bir satışı kaçırır, eksik gizlemek mağazadan atılmayı
 * getirir. ChromeOS'ta referrer boş gelir ve (3) oradaki tek savunmadır.
 * Bu davranışı geri almak isteyen STANDALONE_COUNTS_AS_APP'i false yapsın
 * ve ChromeOS TWA'sının artık tespit edilmediğini bilerek yapsın.
 */

export type Channel = "app" | "web";

/** İstemcinin kanalı sunucuya bildirdiği başlık. */
export const CHANNEL_HEADER = "X-Client-Channel";

/** Satın almanın yapıldığı adres. Metin olarak yazılır, bağlantı olarak DEĞİL. */
export const PURCHASE_DOMAIN = "xoxo-apps.com";

const STORAGE_KEY = "xoxo.channel";
const TWA_REFERRER_PREFIX = "android-app://";
const STANDALONE_COUNTS_AS_APP = true;

function readStored(): Channel | null {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    return v === "app" || v === "web" ? v : null;
  } catch {
    // Gizli sekme veya depolama kapalı — sinyal yok, diğerlerine düş.
    return null;
  }
}

function remember(channel: Channel): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, channel);
  } catch {
    // Yazamıyorsak her yüklemede yeniden tespit ederiz; sorun değil.
  }
}

function detect(): Channel {
  // "app" yapışkandır, "web" değil: bir kez uygulama olduğu anlaşıldıysa
  // o sekme boyunca öyle kalsın. Tersi yönde yapışkanlık olsaydı, referrer'ı
  // kaybeden bir yeniden yükleme kanalı kalıcı olarak "web"e çevirirdi.
  if (readStored() === "app") return "app";

  if (typeof document !== "undefined" && document.referrer.startsWith(TWA_REFERRER_PREFIX)) {
    remember("app");
    return "app";
  }

  if (
    STANDALONE_COUNTS_AS_APP &&
    typeof window !== "undefined" &&
    window.matchMedia?.("(display-mode: standalone)").matches
  ) {
    remember("app");
    return "app";
  }

  return "web";
}

/**
 * Kanal, modül ilk yüklendiğinde bir kez belirlenir. document.referrer
 * yalnızca ilk belge yüklemesinde doludur; sonradan bakmanın anlamı yok.
 */
export const channel: Channel = detect();

export const isAppChannel = (): boolean => channel === "app";

/** Ödeme isteklerine eklenecek başlık. Sunucu bunu görmeden checkout açmaz. */
export const channelHeaders = (): Record<string, string> => ({
  [CHANNEL_HEADER]: channel,
});
