/** Görsel yolu yardımcıları (sunucu ve tarayıcı ortak; gizli anahtar içermez). */
type HamBlok = { t: string; x?: string; yol?: string; w?: number; h?: number; tur?: string };

/** Ham blok listelerindeki görüntü yolları (imzalı bağlantı üretmek için). */
export function blokYollari(bloklar: unknown): string[] {
  return Array.isArray(bloklar)
    ? (bloklar as HamBlok[]).filter((b) => b.t === "g" && b.yol).map((b) => b.yol as string)
    : [];
}

/** Ham blokları arayüzün beklediği biçime çevirir; görüntülere imzalı bağlantı ekler. */
export function bloklariHazirla(bloklar: unknown, baglantilar: Map<string, string>) {
  if (!Array.isArray(bloklar)) return null;
  return (bloklar as HamBlok[]).map((b) =>
    b.t === "g"
      ? { t: "g" as const, yol: b.yol ?? "", url: b.yol ? (baglantilar.get(b.yol) ?? null) : null, w: b.w ?? 0, h: b.h ?? 0, tur: b.tur }
      : { t: "m" as const, x: b.x ?? "" },
  );
}

type HamKitap = { yol?: string; w?: number; h?: number };

/** Açıklamanın kitaptaki görüntü parçalarının yolları (aciklama_kitap). */
export function kitapYollari(kitap: unknown): string[] {
  return Array.isArray(kitap) ? (kitap as HamKitap[]).filter((k) => k.yol).map((k) => k.yol as string) : [];
}

/** Kitap parçalarına imzalı bağlantı ekler; bağlantısı olmayan parça varsa null (metne düşülür). */
export function kitabiHazirla(kitap: unknown, baglantilar: Map<string, string>) {
  if (!Array.isArray(kitap) || kitap.length === 0) return null;
  const parcalar = (kitap as HamKitap[]).map((k) => ({
    yol: k.yol ?? "",
    url: k.yol ? (baglantilar.get(k.yol) ?? null) : null,
    w: k.w ?? 0,
    h: k.h ?? 0,
  }));
  return parcalar.every((k) => k.url) ? parcalar : null;
}

/** Şablonla (onek + kodlanmış yol + ek) bağlantı haritası; şablon yoksa boş (arayüz /api/gorsel ile dener). */
export function sablonHaritasi(yollar: (string | null | undefined)[], sablon: { onek: string; ek: string } | null) {
  const harita = new Map<string, string>();
  if (!sablon) return harita;
  for (const yol of yollar) {
    if (yol) harita.set(yol, sablon.onek + yol.split("/").map(encodeURIComponent).join("/") + sablon.ek);
  }
  return harita;
}
