/** v_konu_performans satirlarindan ozet/analiz uretir. */

export type PerfSatiri = {
  gun: string;
  ders: string;
  konu: string;
  alt_konu: string | null;
  toplam: number;
  dogru: number;
  yanlis: number;
  bos: number;
  ort_sure_sn: number | null;
};

export type Donem = "gun" | "hafta" | "ay" | "tum";

export const DONEM_ADI: Record<Donem, string> = {
  gun: "Bugün",
  hafta: "Son 7 gün",
  ay: "Son 30 gün",
  tum: "Tüm zamanlar",
};

/** Donemin baslangic tarihi (YYYY-MM-DD) - 'tum' icin null. */
export function donemBaslangici(donem: Donem): string | null {
  if (donem === "tum") return null;
  const gun = new Date();
  gun.setHours(0, 0, 0, 0);
  if (donem === "hafta") gun.setDate(gun.getDate() - 6);
  if (donem === "ay") gun.setDate(gun.getDate() - 29);
  return gun.toISOString().slice(0, 10);
}

export type Ozet = { toplam: number; dogru: number; yanlis: number; bos: number; oran: number };

export function ozetle(satirlar: PerfSatiri[]): Ozet {
  const o = satirlar.reduce(
    (a, s) => ({
      toplam: a.toplam + Number(s.toplam),
      dogru: a.dogru + Number(s.dogru),
      yanlis: a.yanlis + Number(s.yanlis),
      bos: a.bos + Number(s.bos),
    }),
    { toplam: 0, dogru: 0, yanlis: 0, bos: 0 },
  );
  return { ...o, oran: o.toplam ? o.dogru / o.toplam : 0 };
}

export type KonuOzeti = {
  anahtar: string;
  ders: string;
  konu: string;
  toplam: number;
  dogru: number;
  yanlis: number;
  bos: number;
  oran: number;
};

/** ders+konu kiriliminda topla, en zayiftan en iyiye sirala. */
export function konulariTopla(satirlar: PerfSatiri[]): KonuOzeti[] {
  const harita = new Map<string, KonuOzeti>();
  for (const s of satirlar) {
    const anahtar = `${s.ders} / ${s.konu}`;
    const k =
      harita.get(anahtar) ??
      { anahtar, ders: s.ders, konu: s.konu, toplam: 0, dogru: 0, yanlis: 0, bos: 0, oran: 0 };
    k.toplam += Number(s.toplam);
    k.dogru += Number(s.dogru);
    k.yanlis += Number(s.yanlis);
    k.bos += Number(s.bos);
    harita.set(anahtar, k);
  }
  return [...harita.values()]
    .map((k) => ({ ...k, oran: k.toplam ? k.dogru / k.toplam : 0 }))
    .sort((a, b) => a.oran - b.oran || b.toplam - a.toplam);
}

/** Ders bazinda topla. */
export function dersleriTopla(satirlar: PerfSatiri[]) {
  const harita = new Map<string, { ders: string; toplam: number; dogru: number; oran: number }>();
  for (const s of satirlar) {
    const d = harita.get(s.ders) ?? { ders: s.ders, toplam: 0, dogru: 0, oran: 0 };
    d.toplam += Number(s.toplam);
    d.dogru += Number(s.dogru);
    harita.set(s.ders, d);
  }
  return [...harita.values()]
    .map((d) => ({ ...d, oran: d.toplam ? d.dogru / d.toplam : 0 }))
    .sort((a, b) => a.oran - b.oran);
}

export type GunNoktasi = { gun: string; toplam: number; dogru: number; oran: number };

/** Gun gun dogru oranini dondurur (eskiden yeniye). */
export function gunlereBol(satirlar: PerfSatiri[]): GunNoktasi[] {
  const harita = new Map<string, GunNoktasi>();
  for (const s of satirlar) {
    const g = harita.get(s.gun) ?? { gun: s.gun, toplam: 0, dogru: 0, oran: 0 };
    g.toplam += Number(s.toplam);
    g.dogru += Number(s.dogru);
    harita.set(s.gun, g);
  }
  return [...harita.values()]
    .map((g) => ({ ...g, oran: g.toplam ? g.dogru / g.toplam : 0 }))
    .sort((a, b) => a.gun.localeCompare(b.gun));
}

/** Oran bandi: 0.70+ iyi, 0.50-0.69 orta, altinda zayif. */
export function band(oran: number): "iyi" | "orta" | "zayif" {
  if (oran >= 0.7) return "iyi";
  if (oran >= 0.5) return "orta";
  return "zayif";
}

export const BAND_BILGI = {
  iyi: { ad: "iyi", simge: "●", sinif: "bg-iyi", metin: "text-iyi" },
  orta: { ad: "geliştirilmeli", simge: "▲", sinif: "bg-orta", metin: "text-orta" },
  zayif: { ad: "eksik", simge: "■", sinif: "bg-zayif", metin: "text-zayif" },
} as const;

export function yuzde(oran: number) {
  return `${Math.round(oran * 100)}%`;
}

export function gunAdi(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
  });
}
