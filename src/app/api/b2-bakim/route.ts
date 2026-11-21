import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { b2Hazir, b2SurumSil, b2Surumler } from "@/lib/b2";

export const maxDuration = 300;

/**
 * Backblaze bakımı (yalnızca Claude; x-yukleme-anahtari = YUKLEME_ANAHTARI).
 *   GET  /api/b2-bakim                      → özet: dosya, sürüm, boyut, eski sürümler, anahtar yetenekleri
 *   GET  /api/b2-bakim?liste=1              → güncel dosya adları ve boyutları (referanssızları bulmak için)
 *   POST /api/b2-bakim {"islem":"eski_surumler"}        → her dosyanın en yeni sürümü dışındakileri siler
 *   POST /api/b2-bakim {"islem":"sil","adlar":[...]}     → verilen dosyaların TÜM sürümlerini siler
 * B2 aynı adla yüklenen dosyanın eski sürümünü saklar: yeniden yüklemelerden sonra yer iki katına çıkar.
 */
function yetkili(request: Request) {
  const beklenen = process.env.YUKLEME_ANAHTARI ?? "";
  const a = Buffer.from(request.headers.get("x-yukleme-anahtari") ?? "");
  const b = Buffer.from(beklenen);
  return Boolean(beklenen) && a.length === b.length && timingSafeEqual(a, b);
}

function grupla(surumler: { ad: string; id: string; boyut: number; zaman: number; eylem: string }[]) {
  const g = new Map<string, typeof surumler>();
  for (const s of surumler) g.set(s.ad, [...(g.get(s.ad) ?? []), s]);
  for (const l of g.values()) l.sort((x, y) => y.zaman - x.zaman);
  return g;
}

export async function GET(request: Request) {
  if (!yetkili(request)) return NextResponse.json({ hata: "Yetkisiz." }, { status: 401 });
  if (!b2Hazir()) return NextResponse.json({ hata: "B2 ayarları eksik." }, { status: 500 });
  try {
    const { surumler, yetenekler } = await b2Surumler();
    const g = grupla(surumler);
    if (new URL(request.url).searchParams.get("liste")) {
      return NextResponse.json({
        dosyalar: [...g.entries()].filter(([, l]) => l[0].eylem === "upload").map(([ad, l]) => [ad, l[0].boyut]),
      });
    }
    let guncel = 0, eski = 0, eskiAdet = 0;
    for (const l of g.values()) {
      guncel += l[0].boyut;
      for (const s of l.slice(1)) { eski += s.boyut; eskiAdet++; }
    }
    return NextResponse.json({
      dosya: g.size, surum: surumler.length, guncel_mb: Math.round(guncel / 1e6), eski_surum_adet: eskiAdet,
      eski_surum_mb: Math.round(eski / 1e6), yetenekler,
    });
  } catch (e) {
    return NextResponse.json({ hata: (e as Error).message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  if (!yetkili(request)) return NextResponse.json({ hata: "Yetkisiz." }, { status: 401 });
  const { islem, adlar } = (await request.json()) as { islem: string; adlar?: string[] };
  const { surumler } = await b2Surumler();
  const g = grupla(surumler);
  const silinecek: { ad: string; id: string }[] = [];
  if (islem === "eski_surumler") {
    for (const l of g.values()) for (const s of l.slice(1)) silinecek.push(s);
  } else if (islem === "sil" && Array.isArray(adlar)) {
    for (const ad of adlar) for (const s of g.get(ad) ?? []) silinecek.push(s);
  } else {
    return NextResponse.json({ hata: "Bilinmeyen işlem." }, { status: 400 });
  }
  let silinen = 0;
  const hatalar: string[] = [];
  const baslangic = Date.now();
  for (let i = 0; i < silinecek.length; i += 10) {
    if (Date.now() - baslangic > 250_000) break; // süre sınırı: kalanı sonraki çağrıda
    const sonuc = await Promise.allSettled(silinecek.slice(i, i + 10).map((s) => b2SurumSil(s.ad, s.id)));
    for (const r of sonuc) {
      if (r.status === "fulfilled") silinen++;
      else if (hatalar.length < 3) hatalar.push(String(r.reason).slice(0, 150));
    }
  }
  return NextResponse.json({ hedef: silinecek.length, silinen, kalan: silinecek.length - silinen, hatalar });
}
