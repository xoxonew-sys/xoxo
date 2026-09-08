import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

/**
 * Gizlilik ve KVKK aydinlatma metni.
 *
 * YAYINA ALINAMAZ - VERI SORUMLUSU KIMLIGI YOK.
 * KVKK m.10 aydinlatma yukumlulugunun ilk sarti veri sorumlusunun kimligidir.
 * Sirket henuz kurulu degil, dolayisiyla yazilacak bir unvan, adres ve VERBIS
 * kaydi yok. Sayfa bu haliyle TASLAKTIR: DraftNotice bilesenini ve KIMLIK
 * bolumundeki koseli parantezleri ancak gercek bir tuzel kisilik olustuktan
 * sonra kaldirin. Kimligi uydurmak, metni eksik birakmaktan daha kotudur.
 *
 * ICERIGIN KAYNAGI: buradaki her saklama suresi ve her aktarim satiri kodun
 * kendisinden dogrulandi (bkz. CLAUDE.md 8.2b / 8.2c / 8.4). Bir sure
 * degisirse once server/retention.ts degisir, sonra burasi.
 */

const UPDATED = "8 Eylul 2026";

function DraftNotice() {
  return (
    <div className="mb-8 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
      <p className="text-sm font-semibold text-amber-300">TASLAK - yayina alinmadi</p>
      <p className="mt-1 text-xs leading-relaxed text-amber-200/80">
        Veri sorumlusu bolumu doldurulmadigi surece bu metin KVKK m.10 aydinlatma
        yukumlulugunu karsilamaz. Tuzel kisilik kurulduktan sonra bu uyari kaldirilacaktir.
      </p>
    </div>
  );
}

function Section({ no, title, children }: { no: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-base font-semibold text-foreground">
        <span className="mr-2 text-primary">{no}</span>
        {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-xs">
        <thead>
          <tr className="border-b border-border">
            {head.map((h) => (
              <th key={h} className="py-2 pr-4 text-left font-medium text-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/50">
              {r.map((c, j) => (
                <td key={j} className="py-2 pr-4 align-top">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Privacy() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background px-5 py-8">
      <div className="mx-auto max-w-2xl">
        <button
          type="button"
          onClick={() => setLocation("/")}
          className="mb-6 flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Geri
        </button>

        <h1 className="mb-1 text-xl font-bold text-foreground">
          Gizlilik Politikasi ve KVKK Aydinlatma Metni
        </h1>
        <p className="mb-8 text-xs text-muted-foreground">Son guncelleme: {UPDATED}</p>

        <DraftNotice />

        <Section no="1." title="Veri Sorumlusu">
          <p>
            6698 sayili Kisisel Verilerin Korunmasi Kanunu uyarinca veri sorumlusu
            sifatiyla hareket eden taraf:
          </p>
          <p className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 text-foreground">
            [TICARET UNVANI] &middot; [ADRES] &middot; [VERBIS KAYIT NUMARASI] &middot; [KEP / E-POSTA]
          </p>
          <p>Bu alan doldurulana kadar metin taslaktir.</p>
        </Section>

        <Section no="2." title="Islenen Kisisel Veriler">
          <p><strong className="text-foreground">Hesap verileri:</strong> e-posta adresi,
          kullanici adi, gorunen ad, cinsiyet secimi, avatar tercihi, sifrenizin geri
          donusu olmayan ozeti, son giris zamani, dogrulama kodunun ozeti.</p>
          <p><strong className="text-foreground">Icerik verileri:</strong> karakterlerle
          yaptiginiz sohbetlerin metni, X-Room mesajlariniz, sesli mesaj gonderdiginizde
          ses kaydiniz, sohbete yukledginiz gorseller.</p>
          <p><strong className="text-foreground">Yargilama modulu:</strong> gonderdiginiz
          metin ve uretilen yanit, hesabinizla iliskilendirilmeden saklanir. Kime ait
          oldugu tespit edilemedigi icin bu kayitlar uzerinde bireysel silme talebi
          teknik olarak karsilanamaz.</p>
          <p><strong className="text-foreground">Odeme verileri:</strong> tutar, para
          birimi, islem durumu ve Stripe islem kimlikleri. Kart bilgileriniz bize
          hicbir zaman ulasmaz.</p>
          <p><strong className="text-foreground">Teknik veriler:</strong> oturum kaydi,
          gonderilen dogrulama e-postalarinin kaydi ve yasaklama uygulandiysa e-posta
          adresi ile IP adresi.</p>
        </Section>

        <Section no="3." title="Isleme Amaclari ve Hukuki Sebepler">
          <p>Hesabin olusturulmasi, dogrulanmasi ve oturumun surdurulmesi &mdash; sozlesmenin
          kurulmasi ve ifasi (m.5/2-c).</p>
          <p>Sohbet, ses ve yargilama ozelliklerinin calistirilmasi &mdash; sozlesmenin
          ifasi; yapay zeka saglayicilarina yurt disi aktarim icin acik riza.</p>
          <p>Odeme alinmasi ve mali kaydin tutulmasi &mdash; hukuki yukumluluk (m.5/2-a;
          VUK ve TTK saklama sureleri).</p>
          <p>Kotuye kullanimin engellenmesi, yasaklama ve hiz sinirlama &mdash; mesru
          menfaat (m.5/2-f).</p>
          <p>Gonderilen e-postalarin teshis amaciyla kaydi &mdash; mesru menfaat, 90 gun
          ile sinirli.</p>
        </Section>

        <Section no="4." title="Aktarim: Kim, Neyi, Nerede Aliyor">
          <p>
            Verileriniz Avrupa Birligi icinde (Frankfurt) barinir; asagidaki saglayicilara
            yalnizca ilgili islem icin aktarilir. Yurt disina aktarim KVKK m.9 kapsamindadir.
          </p>
          <Table
            head={["Alici", "Aktarilan veri", "Bulundugu yer"]}
            rows={[
              ["Neon (veritabani)", "Bu metindeki tum veriler - saklama yeri", "AB, Frankfurt (eu-central-1)"],
              ["Anthropic", "Sohbet ve yargilama metni", "ABD"],
              ["OpenAI", "Ses kaydi, yuklenen gorsel, seslendirme metni", "ABD"],
              ["Google (Gemini)", "Sohbet metni", "ABD"],
              ["ElevenLabs", "Seslendirilecek yanit metni", "ABD"],
              ["Microsoft (edge-tts)", "Seslendirilecek yanit metni", "ABD"],
              ["Resend - alt yuklenici Amazon SES", "E-posta adresi ve dogrulama postasi", "Japonya (ap-northeast-1)"],
              ["Stripe", "Odeme islem kimlikleri", "ABD / Irlanda"],
              ["Railway", "Uygulama barindirma, sunucu kayitlari", "-"],
            ]}
          />
        </Section>

        <Section no="5." title="Toplama Yontemi">
          <p>
            Veriler dogrudan sizden, uygulamayi kullandiginiz sirada elektronik ortamda
            toplanir: kayit formu, sohbet arayuzu, izin verdiginizde mikrofon, gorsel
            yukledginizde dosya secimi ve odeme akisi.
          </p>
        </Section>

        <Section no="6." title="Saklama Sureleri">
          <Table
            head={["Veri", "Saklama suresi"]}
            rows={[
              ["Hesap verileri", "Hesabiniz silinene kadar"],
              ["Sohbet gecmisi ve mesajlar", "Hesabiniz silinene kadar; hesapla birlikte silinir"],
              ["X-Room mesajlari", "Oda suresi boyunca (5-60 dakika), oda kapandiginda silinir"],
              ["Oturum kaydi", "30 gun"],
              ["E-posta gonderim kaydi", "90 gun"],
              ["Dogrulama kodlari", "Kullanildiginda silinir; kullanilmayanlar suresi dolunca temizlenir"],
              ["Odeme kayitlari", "Hesap silinse dahi VUK/TTK sureleri boyunca, kisi baglantisi kaldirilarak"],
              ["Yasaklama kayitlari", "Yasagin gecerliligi suresince, hesap silinse dahi"],
              ["Yargilama metinleri", "Hesapla iliskilendirilmediginden kisi bazinda silinemez"],
            ]}
          />
        </Section>

        <Section no="7." title="Haklariniz (KVKK m.11)">
          <p>
            Kisisel verilerinizin islenip islenmedigini ogrenme, buna iliskin bilgi talep
            etme, isleme amacini ve amacina uygun kullanilip kullanilmadigini ogrenme,
            aktarildigi ucuncu kisileri bilme, eksik veya yanlis islenmisse duzeltilmesini
            isteme, silinmesini veya yok edilmesini isteme, bu islemlerin aktarildigi
            ucuncu kisilere bildirilmesini isteme, munhasiran otomatik sistemlerle analiz
            edilmesi suretiyle aleyhinize bir sonuc dogmasina itiraz etme ve zarara
            ugramaniz halinde giderilmesini talep etme haklarina sahipsiniz.
          </p>
          <p>
            <strong className="text-foreground">Silme hakkini dogrudan kullanabilirsiniz:</strong>{" "}
            Profil ekranindaki hesap silme islemi, hesabinizi ve ona bagli sohbet
            gecmisinizi kalici olarak siler. Odeme kayitlari hukuki yukumluluk nedeniyle
            kalir; bu kayitlarin sizinle baglantisi kaldirilir. Yasaklama kaydiniz varsa
            yasagin gecerliligi suresince saklanir.
          </p>
          <p>
            Diger taleplerinizi <span className="text-foreground">[BASVURU E-POSTA ADRESI]</span>{" "}
            adresine iletebilirsiniz. Basvurular en gec 30 gun icinde sonuclandirilir.
          </p>
        </Section>

        <Section no="8." title="Cerezler">
          <p>
            Yalnizca islevsel cerez kullanilir: oturumunuzu acik tutan xoxo.sid ve
            &ldquo;beni hatirla&rdquo; secimi icin remember_token. Reklam veya ucuncu
            taraf analiz cerezi kullanilmaz.
          </p>
        </Section>

        <Section no="9." title="Degisiklikler">
          <p>
            Metin guncellendiginde ustteki tarih degisir. Saklama sureleri veya aktarim
            yapilan saglayicilar degisirse metin ayni anda guncellenir.
          </p>
        </Section>
      </div>
    </div>
  );
}
