/**
 * TUS ders ve konu agaci.
 * Claude'a bu liste verilir ve her soruyu buradaki bir konuya oturtmasi istenir.
 * Listeye ders/konu eklemek icin sadece bu dosyayi duzenlemeniz yeterli.
 */

export type Ders = { ders: string; grup: "Temel Bilimler" | "Klinik Bilimler"; konular: string[] };

export const MUFREDAT: Ders[] = [
  {
    ders: "Anatomi",
    grup: "Temel Bilimler",
    konular: [
      "Üst Ekstremite", "Alt Ekstremite", "Baş-Boyun", "Toraks", "Abdomen",
      "Pelvis ve Perine", "Nöroanatomi", "Kraniyal Sinirler", "Otonom Sinir Sistemi",
      "Kemikler ve Eklemler",
    ],
  },
  {
    ders: "Fizyoloji",
    grup: "Temel Bilimler",
    konular: [
      "Hücre Fizyolojisi", "Kas Fizyolojisi", "Sinir Sistemi Fizyolojisi",
      "Kalp ve Dolaşım", "Solunum", "Böbrek ve Sıvı-Elektrolit", "Gastrointestinal Sistem",
      "Endokrin Fizyoloji", "Üreme Fizyolojisi", "Kan ve Bağışıklık",
    ],
  },
  {
    ders: "Biyokimya",
    grup: "Temel Bilimler",
    konular: [
      "Karbonhidrat Metabolizması", "Lipid Metabolizması", "Protein ve Aminoasit Metabolizması",
      "Enzimler", "Vitaminler ve Mineraller", "Nükleik Asitler ve Replikasyon",
      "Transkripsiyon ve Translasyon", "Hormon Biyokimyası", "Klinik Biyokimya",
      "Moleküler Biyoloji Teknikleri",
    ],
  },
  {
    ders: "Mikrobiyoloji",
    grup: "Temel Bilimler",
    konular: [
      "Genel Bakteriyoloji", "Gram Pozitif Bakteriler", "Gram Negatif Bakteriler",
      "Mikobakteriler", "Anaerop Bakteriler", "Viroloji", "Mikoloji", "Parazitoloji",
      "İmmünoloji", "Sterilizasyon ve Dezenfeksiyon",
    ],
  },
  {
    ders: "Patoloji",
    grup: "Temel Bilimler",
    konular: [
      "Hücre Hasarı ve Adaptasyon", "İnflamasyon ve Onarım", "Neoplazi",
      "Hemodinamik Bozukluklar", "İmmünopatoloji", "Genetik Hastalıklar",
      "Kardiyovasküler Patoloji", "Solunum Sistemi Patolojisi", "GİS Patolojisi",
      "Üriner Sistem Patolojisi", "Kadın Genital ve Meme Patolojisi", "Endokrin Patoloji",
      "Nöropatoloji", "Hematopatoloji", "Kemik ve Yumuşak Doku Patolojisi",
    ],
  },
  {
    ders: "Farmakoloji",
    grup: "Temel Bilimler",
    konular: [
      "Farmakokinetik ve Farmakodinamik", "Otonom Sinir Sistemi İlaçları",
      "Kardiyovasküler İlaçlar", "Santral Sinir Sistemi İlaçları", "Antibiyotikler",
      "Antiviral ve Antifungaller", "Kemoterapötikler", "Endokrin Sistem İlaçları",
      "Otakoidler ve NSAİİ", "Solunum ve GİS İlaçları", "Toksikoloji",
    ],
  },
  {
    ders: "Histoloji ve Embriyoloji",
    grup: "Temel Bilimler",
    konular: [
      "Epitel Doku", "Bağ Dokusu", "Kas ve Sinir Dokusu", "Genel Embriyoloji",
      "Sistem Embriyolojisi", "Özel Histoloji",
    ],
  },
  {
    ders: "Tıbbi Biyoloji ve Genetik",
    grup: "Temel Bilimler",
    konular: [
      "Mendel Genetiği", "Kromozom Hastalıkları", "Tek Gen Hastalıkları",
      "Multifaktöriyel Kalıtım", "Kanser Genetiği", "Genetik Tanı Yöntemleri",
    ],
  },
  {
    ders: "Dahiliye",
    grup: "Klinik Bilimler",
    konular: [
      "Kardiyoloji", "Göğüs Hastalıkları", "Gastroenteroloji", "Nefroloji",
      "Endokrinoloji", "Hematoloji", "Romatoloji", "Onkoloji",
      "Enfeksiyon Hastalıkları", "Geriatri ve Genel Dahiliye",
    ],
  },
  {
    ders: "Pediatri",
    grup: "Klinik Bilimler",
    konular: [
      "Büyüme-Gelişme ve Beslenme", "Neonatoloji", "Pediatrik Enfeksiyonlar", "Aşılar",
      "Pediatrik Kardiyoloji", "Metabolik Hastalıklar", "Pediatrik Nefroloji",
      "Pediatrik Hematoloji-Onkoloji", "Pediatrik Endokrinoloji", "Pediatrik Nöroloji",
      "Pediatrik GİS", "Çocuk Göğüs ve Alerji", "Genetik Sendromlar",
    ],
  },
  {
    ders: "Genel Cerrahi",
    grup: "Klinik Bilimler",
    konular: [
      "Yara İyileşmesi ve Sıvı-Elektrolit", "Şok ve Travma", "Özofagus", "Mide ve Duodenum",
      "İnce ve Kalın Bağırsak", "Anorektal Hastalıklar", "Karaciğer ve Safra Yolları",
      "Pankreas", "Meme", "Tiroid ve Paratiroid", "Fıtıklar", "Akut Batın",
      "Transplantasyon",
    ],
  },
  {
    ders: "Kadın Hastalıkları ve Doğum",
    grup: "Klinik Bilimler",
    konular: [
      "Obstetrik Temeller", "Gebelik Takibi", "Gebelik Komplikasyonları",
      "Doğum ve Doğum Komplikasyonları", "Jinekolojik Enfeksiyonlar",
      "Jinekolojik Onkoloji", "İnfertilite", "Adet Düzensizlikleri ve Jinekolojik Endokrinoloji",
      "Kontrasepsiyon", "Menopoz", "Ürojinekoloji",
    ],
  },
  {
    ders: "Küçük Stajlar",
    grup: "Klinik Bilimler",
    konular: [
      "Nöroloji", "Psikiyatri", "Dermatoloji", "Göz Hastalıkları",
      "Kulak Burun Boğaz", "Ortopedi ve Travmatoloji", "Üroloji",
      "Anesteziyoloji ve Reanimasyon", "Radyoloji", "Halk Sağlığı", "Adli Tıp",
      "Fiziksel Tıp ve Rehabilitasyon", "Kalp-Damar Cerrahisi", "Göğüs Cerrahisi",
      "Beyin ve Sinir Cerrahisi", "Plastik Cerrahi", "Biyoistatistik ve Etik",
    ],
  },
];

export const DERSLER = MUFREDAT.map((d) => d.ders);

/** Claude'un prompt'una gomulen ders/konu listesi. */
export function mufredatMetni(): string {
  return MUFREDAT.map((d) => `${d.ders}: ${d.konular.join(", ")}`).join("\n");
}

function sadelestir(s: string): string {
  return s
    .toLowerCase()
    .replace(/[çÇ]/g, "c").replace(/[ğĞ]/g, "g").replace(/[ıİ]/g, "i")
    .replace(/[öÖ]/g, "o").replace(/[şŞ]/g, "s").replace(/[üÜ]/g, "u")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Claude'un dondurdugu ders/konu adini mufredata oturtur.
 * Esleyemezse gelen metni oldugu gibi korur (yeni konular kaybolmaz).
 */
export function konuOturt(ders?: string | null, konu?: string | null) {
  if (!ders) return { ders: "Belirsiz", konu: konu || "Belirsiz" };
  const d = MUFREDAT.find((x) => sadelestir(x.ders) === sadelestir(ders));
  if (!d) return { ders: ders.trim(), konu: (konu || "Belirsiz").trim() };
  if (!konu) return { ders: d.ders, konu: "Belirsiz" };
  const k = d.konular.find((x) => sadelestir(x) === sadelestir(konu));
  return { ders: d.ders, konu: k ?? konu.trim() };
}
