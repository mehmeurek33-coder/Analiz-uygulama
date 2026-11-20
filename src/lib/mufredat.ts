/**
 * TUSDATA müfredat yapısı: 11 branş.
 *
 *   Temel Bilimler (6 branş): Anatomi, Fizyoloji, Biyokimya, Mikrobiyoloji,
 *                             Patoloji, Farmakoloji
 *   Klinik Bilimler (5 branş): Dahiliye, Pediatri, Genel Cerrahi,
 *                              Kadın Doğum, Küçük Stajlar
 *
 * Branş ayrımı tusdata.com ve klinisyen.com (TUSDATA yayınevi) üzerinden
 * doğrulandı: kitap serileri "Temel Bilimler - 6 Branş", "Klinik Bilimler -
 * 5 Branş", kamplar "11 Branş" olarak geçiyor. Histoloji-Embriyoloji Anatomi
 * branşının, tıbbi genetik ve moleküler biyoloji ise Biyokimya branşının
 * altında konu olarak yer alır.
 *
 * KONU BAŞLIKLARI: Kullanıcı tekrarlarını TUSDATA "Şampiyonların Notu" kitaplarından
 * yapıyor. Her dersin konu listesi o dersin Şampiyonların Notu içindekiler sayfasına
 * göre yazılır (kitap edinildikçe ders ders güncellenir; güncellenmiş derste `kaynak`
 * alanı dolu). Liste değişince o dersin mevcut soruları da yeni başlıklara taşınmalı.
 *
 * Claude'a bu liste verilir ve her soruyu buradaki bir konuya oturtması istenir.
 * Konu eklemek/çıkarmak için yalnızca bu dosyayı düzenlemen yeterli.
 */

export type Ders = {
  ders: string;
  grup: "Temel Bilimler" | "Klinik Bilimler";
  /** Konu listesi (etiketleme bunu kullanır). bolumler varsa ondan türetilir. */
  konular: string[];
  /** Konu başlıklarının alındığı kitap (örn. "Şampiyonların Notu"); yoksa genel liste */
  kaynak?: string;
  /** Kitaptaki ana bölümler (Viroloji, Parazitoloji ...) ve altındaki konular */
  bolumler?: { baslik: string; konular: string[] }[];
};

export const MUFREDAT: Ders[] = [
  {
    ders: "Anatomi",
    grup: "Temel Bilimler",
    konular: [
      "Genel Anatomi ve Terminoloji",
      "Üst Ekstremite",
      "Alt Ekstremite",
      "Baş-Boyun",
      "Toraks",
      "Abdomen",
      "Pelvis ve Perine",
      "Nöroanatomi",
      "Kraniyal Sinirler",
      "Otonom Sinir Sistemi",
      "Duyu Organları",
      "Histoloji",
      "Embriyoloji",
    ],
  },
  {
    ders: "Fizyoloji",
    grup: "Temel Bilimler",
    konular: [
      "Hücre Fizyolojisi",
      "Kas Fizyolojisi",
      "Sinir Sistemi Fizyolojisi",
      "Duyu Fizyolojisi",
      "Kalp Fizyolojisi",
      "Dolaşım Fizyolojisi",
      "Solunum Fizyolojisi",
      "Böbrek Fizyolojisi",
      "Sıvı-Elektrolit ve Asit-Baz",
      "Gastrointestinal Sistem Fizyolojisi",
      "Endokrin Fizyoloji",
      "Üreme Fizyolojisi",
      "Kan Fizyolojisi",
      "Metabolizma ve Vücut Isısı",
    ],
  },
  {
    ders: "Biyokimya",
    grup: "Temel Bilimler",
    konular: [
      "Aminoasitler ve Proteinler",
      "Enzimler",
      "Karbonhidrat Metabolizması",
      "Lipid Metabolizması",
      "Protein ve Aminoasit Metabolizması",
      "Nükleotid Metabolizması",
      "Vitaminler",
      "Mineraller ve Eser Elementler",
      "Hormon Biyokimyası",
      "Hücre ve Membran Biyokimyası",
      "DNA Replikasyonu ve Onarımı",
      "Transkripsiyon ve Translasyon",
      "Moleküler Biyoloji Teknikleri",
      "Tıbbi Genetik",
      "Klinik Biyokimya ve Laboratuvar",
    ],
  },
  {
    // TUSDATA "Şampiyonların Notu - Mikrobiyoloji" içindekiler sayfasındaki başlıklar
    // (kullanıcının tekrar kitabı). Sıra ve yazım kitaptaki gibi.
    ders: "Mikrobiyoloji",
    grup: "Temel Bilimler",
    kaynak: "Şampiyonların Notu",
    bolumler: [
      {
        baslik: "Temel Bakteriyoloji",
        konular: [
          "Mikroorganizmaların Sınıflandırılması",
          "Bakterilerin Tanılama Yöntemi",
          "Bakteri Hücrelerinin Yapısı",
          "Bakterilerin Metabolizması ve Üretimi",
          "Bakteri Genetiği",
          "Bakteri Patogenezi",
          "Normal Vücut Florası (Mikrobiyota)",
          "Sterilizasyon ve Dezenfeksiyon Yöntemleri",
          "Antimikrobiyaller ve Aşılar",
        ],
      },
      {
        baslik: "Klinik Bakteriyoloji",
        konular: [
          "Gram Pozitif Koklar",
          "Gram Pozitif Sporlu Basiller",
          "Sporlu Gram Pozitif Anaerop Basiller",
          "Sporsuz Gram Pozitif Aerop Basiller",
          "Gram Negatif Diplokoklar",
          "Gram Negatif Enterik Bakteriler (Enterobacteriaceae)",
          "Oksidaz Pozitif Kıvrık Gram Negatif Basiller",
          "Gram Negatif Kokobasiller",
          "Non-fermentatif Gram Negatif Basiller",
          "Çeşitli Gram Negatif Bakteriler",
          "Mikobakteriler",
          "Spiroketler",
          "Borelyalar",
          "Leptospiralar",
          "Mikoplazmalar ve Üreplazmalar",
          "Riketsiyalar",
          "Coxiella, Anaplasma",
          "Klamidyalar",
          "Çeşitli Anaerop Bakteriler",
        ],
      },
      {
        baslik: "Mikoloji",
        konular: [
          "Genel Mikoloji",
          "Yüzeyel ve Kutanöz Mikozlar",
          "Subkutan (Deri Altı) Mikozlar",
          "Endemik (Sistemik, Derin) Dimorfik Mikozlar",
          "Fırsatçı Mikozlar",
          "Antifungal İlaçlar",
        ],
      },
      {
        baslik: "Viroloji",
        konular: [
          "Genel Viroloji",
          "Antiviral İlaçlar ve Aşılar",
          "DNA Virüsleri",
          "RNA Virüsleri",
          "Negatif Kutuplu RNA Virüsleri",
          "Pozitif Kutuplu RNA Virüsleri",
          "Retrovirüsler",
          "Primer Hepatotrop Virüsler",
          "Prionlar ve Neden Olduğu Hastalıklar",
          "Serolojik Testler",
          "Enfeksiyon Hastalıklarında İstatistik",
        ],
      },
      {
        baslik: "Parazitoloji",
        konular: [
          "Genel Parazitoloji",
          "Kan ve Doku Protozoonları",
          "Gastrointestinal Sistem Protozoonları",
          "Ürogenital Sistem Protozoonları",
          "Helmintler",
          "Sestodların Genel Özellikleri",
          "Trematodların Genel Özellikleri",
          "Safra Yolu Trematodları",
          "Venalar İçinde Yaşayan Trematodlar",
          "Akciğer Trematodu",
          "Gastrointestinal Sistem Trematodları",
          "Nematodların Genel Özellikleri",
          "İntestinal Nematodlar",
          "Kancalı Kurtlar (Çengelli Solucanlar)",
          "İntestinal ve Doku Nematodları",
          "Doku Nematodları",
          "Filaryalar",
        ],
      },
      {
        baslik: "İmmünoloji",
        konular: [
          "Lenfoid Organlar",
          "İmmünite",
          "Sitokinler",
          "Bağışık Yanıt Hücrelerinin Olgunlaşma Süreci",
          "Bağışık Yanıt Hücrelerinin Özellikleri",
          "Büyük Doku Uygunluk Antijenleri",
          "Antijen Sunumu",
          "Antijen",
          "Antikor",
          "Kompleman Sistemi",
          "Aşırı Duyarlılık Reaksiyonları",
        ],
      },
    ],
    get konular() {
      return this.bolumler!.flatMap((b) => b.konular);
    },
  },
  {
    ders: "Patoloji",
    grup: "Temel Bilimler",
    konular: [
      "Hücre Hasarı ve Adaptasyon",
      "İnflamasyon ve Onarım",
      "Hemodinamik Bozukluklar",
      "Genetik Hastalıklar",
      "İmmünopatoloji",
      "Neoplazi",
      "Çevresel ve Beslenme Patolojisi",
      "Kardiyovasküler Patoloji",
      "Solunum Sistemi Patolojisi",
      "Gastrointestinal Sistem Patolojisi",
      "Karaciğer ve Safra Yolları Patolojisi",
      "Böbrek ve Üriner Sistem Patolojisi",
      "Erkek Genital Sistem Patolojisi",
      "Kadın Genital Sistem ve Meme Patolojisi",
      "Endokrin Patoloji",
      "Hematopatoloji",
      "Kemik ve Yumuşak Doku Patolojisi",
      "Deri Patolojisi",
      "Nöropatoloji",
    ],
  },
  {
    ders: "Farmakoloji",
    grup: "Temel Bilimler",
    konular: [
      "Farmakokinetik",
      "Farmakodinamik",
      "Otonom Sinir Sistemi İlaçları",
      "Kardiyovasküler İlaçlar",
      "Diüretikler",
      "Santral Sinir Sistemi İlaçları",
      "Anestezik İlaçlar",
      "Analjezikler ve NSAİİ",
      "Otakoidler",
      "Antibiyotikler",
      "Antiviral İlaçlar",
      "Antifungal ve Antiparaziter İlaçlar",
      "Antineoplastik İlaçlar",
      "Endokrin Sistem İlaçları",
      "Solunum Sistemi İlaçları",
      "Gastrointestinal Sistem İlaçları",
      "Kan ve Hemostaz İlaçları",
      "İmmünsupresif İlaçlar",
      "Toksikoloji",
    ],
  },
  {
    ders: "Dahiliye",
    grup: "Klinik Bilimler",
    konular: [
      "Kardiyoloji",
      "Göğüs Hastalıkları",
      "Gastroenteroloji",
      "Hepatoloji",
      "Nefroloji",
      "Sıvı-Elektrolit ve Asit-Baz",
      "Endokrinoloji",
      "Diyabet ve Metabolizma",
      "Hematoloji",
      "Onkoloji",
      "Romatoloji",
      "Enfeksiyon Hastalıkları",
      "İmmünoloji ve Alerji",
      "Geriatri",
      "Dahiliye Acilleri",
    ],
  },
  {
    ders: "Pediatri",
    grup: "Klinik Bilimler",
    konular: [
      "Büyüme ve Gelişme",
      "Beslenme",
      "Sosyal Pediatri ve Aşılar",
      "Neonatoloji",
      "Pediatrik Enfeksiyon Hastalıkları",
      "Genetik ve Dismorfoloji",
      "Metabolizma Hastalıkları",
      "Pediatrik Kardiyoloji",
      "Pediatrik Göğüs Hastalıkları ve Alerji",
      "Pediatrik Gastroenteroloji",
      "Pediatrik Nefroloji",
      "Pediatrik Endokrinoloji",
      "Pediatrik Hematoloji",
      "Pediatrik Onkoloji",
      "Pediatrik Nöroloji",
      "Pediatrik Romatoloji ve İmmünoloji",
      "Pediatrik Aciller",
    ],
  },
  {
    ders: "Genel Cerrahi",
    grup: "Klinik Bilimler",
    konular: [
      "Yara İyileşmesi",
      "Sıvı-Elektrolit ve Cerrahi Beslenme",
      "Şok",
      "Travma",
      "Yanık",
      "Cerrahi Enfeksiyonlar",
      "Özofagus",
      "Mide ve Duodenum",
      "İnce Bağırsak",
      "Kolon ve Rektum",
      "Anal Bölge",
      "Karaciğer",
      "Safra Kesesi ve Safra Yolları",
      "Pankreas",
      "Dalak",
      "Meme",
      "Tiroid ve Paratiroid",
      "Sürrenal",
      "Fıtıklar",
      "Akut Batın",
      "Transplantasyon",
    ],
  },
  {
    ders: "Kadın Doğum",
    grup: "Klinik Bilimler",
    konular: [
      "Kadın Genital Anatomi ve Fizyoloji",
      "Menstrüel Siklus",
      "Gebelik Fizyolojisi",
      "Antenatal Takip",
      "Gebelik Komplikasyonları",
      "Gebelikte Hipertansif Hastalıklar",
      "Doğum Eylemi",
      "Doğum Komplikasyonları",
      "Postpartum Dönem",
      "Perinatoloji ve Fetal Değerlendirme",
      "Jinekolojik Enfeksiyonlar",
      "Amenore ve Anovulasyon",
      "İnfertilite",
      "Endometriozis",
      "Myom ve Benign Jinekoloji",
      "Jinekolojik Onkoloji",
      "Kontrasepsiyon",
      "Menopoz",
      "Ürojinekoloji",
    ],
  },
  {
    ders: "Küçük Stajlar",
    grup: "Klinik Bilimler",
    konular: [
      "Nöroloji",
      "Psikiyatri",
      "Dermatoloji",
      "Göz Hastalıkları",
      "Kulak Burun Boğaz",
      "Ortopedi ve Travmatoloji",
      "Üroloji",
      "Anesteziyoloji ve Reanimasyon",
      "Radyoloji",
      "Nükleer Tıp",
      "Halk Sağlığı",
      "Biyoistatistik",
      "Adli Tıp",
      "Fiziksel Tıp ve Rehabilitasyon",
      "Kalp-Damar Cerrahisi",
      "Göğüs Cerrahisi",
      "Beyin ve Sinir Cerrahisi",
      "Plastik Cerrahi",
      "Çocuk Cerrahisi",
      "Tıp Etiği ve Tıp Tarihi",
    ],
  },
];

export const DERSLER = MUFREDAT.map((d) => d.ders);

/** Claude'un promptuna gömülen ders/konu listesi. */
export function mufredatMetni(): string {
  return MUFREDAT.map((d) => `${d.ders} (${d.grup}): ${d.konular.join(", ")}`).join("\n");
}

function sadelestir(s: string): string {
  return s
    .toLowerCase()
    .replace(/[çÇ]/g, "c")
    .replace(/[ğĞ]/g, "g")
    .replace(/[ıİ]/g, "i")
    .replace(/[öÖ]/g, "o")
    .replace(/[şŞ]/g, "s")
    .replace(/[üÜ]/g, "u")
    .replace(/[^a-z0-9]/g, "");
}

/** Sık kullanılan eş adlar - Claude başka bir ad döndürürse doğru branşa çekilir. */
const ES_ADLAR: Record<string, string> = {
  icHastaliklari: "Dahiliye",
  ichastaliklari: "Dahiliye",
  kadinhastaliklarivedogum: "Kadın Doğum",
  kadindogum: "Kadın Doğum",
  cocuksagligivehastaliklari: "Pediatri",
  histolojiveembriyoloji: "Anatomi",
  tibbibiyolojivegenetik: "Biyokimya",
  tibbigenetik: "Biyokimya",
  genetik: "Biyokimya",
  immunoloji: "Mikrobiyoloji",
  noroloji: "Küçük Stajlar",
  psikiyatri: "Küçük Stajlar",
  dermatoloji: "Küçük Stajlar",
  gozhastaliklari: "Küçük Stajlar",
  kulakburunbogaz: "Küçük Stajlar",
  kbb: "Küçük Stajlar",
  ortopedi: "Küçük Stajlar",
  uroloji: "Küçük Stajlar",
  radyoloji: "Küçük Stajlar",
  halksagligi: "Küçük Stajlar",
  adlitip: "Küçük Stajlar",
  anesteziyoloji: "Küçük Stajlar",
  biyoistatistik: "Küçük Stajlar",
};

/**
 * Claude'un döndürdüğü ders/konu adını müfredata oturtur.
 * Eşleyemezse gelen metni olduğu gibi korur (yeni konular kaybolmaz).
 */
export function konuOturt(
  ders?: string | null,
  konu?: string | null,
): { ders: string; konu: string; altKonu?: string } {
  if (!ders) return { ders: "Belirsiz", konu: konu || "Belirsiz" };

  const anahtar = sadelestir(ders);
  let d = MUFREDAT.find((x) => sadelestir(x.ders) === anahtar);

  // Eş ad tablosu: örn. "İç Hastalıkları" -> Dahiliye, "Nöroloji" -> Küçük Stajlar
  if (!d) {
    const hedef = ES_ADLAR[anahtar];
    if (hedef) {
      const bulunan = MUFREDAT.find((x) => x.ders === hedef);
      if (bulunan) {
        // Küçük staj adı ders olarak gelmişse onu konu yap
        const stajMi = bulunan.konular.find((k) => sadelestir(k) === anahtar);
        if (stajMi) {
          // "Nöroloji / Epilepsi" -> Küçük Stajlar / Nöroloji, alt konu: Epilepsi
          return { ders: bulunan.ders, konu: stajMi, altKonu: konu?.trim() || undefined };
        }
        d = bulunan;
      }
    }
  }

  if (!d) return { ders: ders.trim(), konu: (konu || "Belirsiz").trim() };
  if (!konu) return { ders: d.ders, konu: "Belirsiz" };

  const k = d.konular.find((x) => sadelestir(x) === sadelestir(konu));
  return { ders: d.ders, konu: k ?? konu.trim() };
}
