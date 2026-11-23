"use client";

/**
 * Bütün kitapların görüntü listesi (ders · kaynak gruplarıyla) ve bu cihaza yeni görüntüleri kendiliğinden indirme.
 * Liste tarayıcıda doğrudan Supabase'den (Vercel'den geçmez), görüntüler Worker → B2.
 * Otomatik indirme cihaz başına bir ayar (localStorage): varsayılan kapalı, telefon gibi cihazlara inmez.
 */

import { gorselleriIndir, tablettekiGorseller, tablettemi } from "@/lib/cevrimdisi";
import { sablonHaritasi } from "@/lib/gorselYardim";
import { gorselSablonuAl, veriIstemcisi } from "@/lib/veriIstemci";

export type Grup = { anahtar: string; ders: string; kaynak: string; soru: number; urller: string[]; tablette: number };

type Satir = {
  soru_kitap_gorsel: string | null;
  soru_gorsel: string | null;
  aciklama_kitap: { yol?: string }[] | null;
  aciklama_bloklar: { t?: string; yol?: string }[] | null;
  soru_setleri: { ders: string | null; kaynak: string | null } | null;
};

export async function gorselGruplari(): Promise<Grup[]> {
  const sb = veriIstemcisi();
  const satirlar: Satir[] = [];
  for (let bas = 0; ; bas += 1000) {
    const { data, error } = await sb
      .from("sorular")
      .select("id, soru_kitap_gorsel, soru_gorsel, aciklama_kitap, aciklama_bloklar, soru_setleri(ders, kaynak)")
      .order("id")
      .range(bas, bas + 999);
    if (error) throw new Error(error.message);
    satirlar.push(...((data ?? []) as unknown as Satir[]));
    if (!data || data.length < 1000) break;
  }
  const yollar = new Map<string, { ders: string; kaynak: string; soru: number; yollar: string[] }>();
  for (const s of satirlar) {
    const ders = s.soru_setleri?.ders ?? "Diğer";
    const kaynak = s.soru_setleri?.kaynak ?? "Diğer";
    const k = `${ders} · ${kaynak}`;
    if (!yollar.has(k)) yollar.set(k, { ders, kaynak, soru: 0, yollar: [] });
    const g = yollar.get(k)!;
    g.soru++;
    if (s.soru_kitap_gorsel) g.yollar.push(s.soru_kitap_gorsel);
    if (s.soru_gorsel) g.yollar.push(s.soru_gorsel);
    if (s.aciklama_kitap?.length) {
      for (const p of s.aciklama_kitap) if (p.yol) g.yollar.push(p.yol);
    } else for (const b of s.aciklama_bloklar ?? []) if (b.t === "g" && b.yol) g.yollar.push(b.yol);
  }
  const sablon = await gorselSablonuAl();
  if (!sablon) throw new Error("görsel adresi alınamadı (oturum?)");
  const kayitli = await tablettekiGorseller();
  return [...yollar.entries()]
    .map(([anahtar, g]) => {
      const urller = [...sablonHaritasi(g.yollar, sablon).values()];
      return { anahtar, ders: g.ders, kaynak: g.kaynak, soru: g.soru, urller, tablette: urller.filter((u) => tablettemi(u, kayitli)).length };
    })
    .sort((a, b) => a.ders.localeCompare(b.ders, "tr") || a.kaynak.localeCompare(b.kaynak, "tr"));
}

// ---------------------------------------------------------------- otomatik indirme (cihaz ayarı)
const AYAR = "sa-oto-indir";
const SON = "sa-oto-son";
const ARALIK_MS = 6 * 3600 * 1000;

export function otoIndirAcik() {
  try {
    return localStorage.getItem(AYAR) === "1";
  } catch {
    return false;
  }
}
export function otoIndirAyarla(acik: boolean) {
  try {
    if (acik) localStorage.setItem(AYAR, "1");
    else localStorage.removeItem(AYAR);
    localStorage.removeItem(SON);
  } catch {
    /* */
  }
}

/** Elle indirme başlayınca arka plandaki durdurulur (ikisi aynı anda inmesin). */
export const otoIptal = { dur: false };
let otoCalisiyor = false;

/**
 * Ayar açıksa, 6 saatte bir eksik görüntüleri (yeni yüklenen kitaplar dahil) arka planda yavaşça indirir.
 * Mobil veride (tarayıcı söyleyebiliyorsa) ve veri tasarrufu açıkken çalışmaz.
 */
export async function otoIndir() {
  if (otoCalisiyor || !otoIndirAcik()) return;
  const bag = (navigator as unknown as { connection?: { type?: string; saveData?: boolean } }).connection;
  if (bag?.saveData || bag?.type === "cellular") return;
  try {
    if (Date.now() - Number(localStorage.getItem(SON) || 0) < ARALIK_MS) return;
    localStorage.setItem(SON, String(Date.now()));
  } catch {
    return;
  }
  otoCalisiyor = true;
  otoIptal.dur = false;
  try {
    const gruplar = await gorselGruplari();
    await gorselleriIndir(gruplar.flatMap((g) => g.urller), () => {}, otoIptal, 2);
  } catch {
    /* bir dahaki sefere */
  } finally {
    otoCalisiyor = false;
  }
}
