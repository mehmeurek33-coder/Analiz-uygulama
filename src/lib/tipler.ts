export type Secenekler = Record<string, string>;

export type Soru = {
  id: string;
  set_id: string;
  numara: number | null;
  sira: number;
  metin: string;
  secenekler: Secenekler;
  dogru_cevap: string | null;
  ders: string | null;
  konu: string | null;
  alt_konu: string | null;
  zorluk: string | null;
  aciklama: string | null;
};

export type SoruSeti = {
  id: string;
  ad: string;
  dosya_yolu: string | null;
  sayfa_sayisi: number;
  parca_sayisi: number;
  islenen_parca: number;
  soru_sayisi: number;
  durum: "kuyrukta" | "isleniyor" | "hazir" | "hata";
  hata: string | null;
  created_at: string;
};

export type Deneme = {
  id: string;
  ad: string;
  set_id: string | null;
  soru_sayisi: number;
  basladi_at: string;
  bitti_at: string | null;
};

export type Cevap = {
  id: string;
  deneme_id: string;
  soru_id: string;
  sira: number;
  isaretlenen: string | null;
  dogru: boolean | null;
  sure_sn: number;
};

export const SIKLAR = ["A", "B", "C", "D", "E"] as const;
