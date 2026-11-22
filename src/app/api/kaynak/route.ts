import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { b2Baglantilari, b2Hazir, b2Listele } from "@/lib/b2";

/**
 * Kullanıcının Backblaze'e yüklediği kaynak PDF'lerine Claude'un erişimi (aktarım için).
 * Yetki: x-yukleme-anahtari = YUKLEME_ANAHTARI.
 *   GET /api/kaynak                → depodaki dosyalar (görüntüler hariç)
 *   GET /api/kaynak?ad=<dosya adı> → o dosya için 6 saatlik indirme bağlantısı
 */
export async function GET(request: Request) {
  const beklenen = process.env.YUKLEME_ANAHTARI ?? "";
  const a = Buffer.from(request.headers.get("x-yukleme-anahtari") ?? "");
  const b = Buffer.from(beklenen);
  if (!beklenen || a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ hata: "Yetkisiz." }, { status: 401 });
  }
  if (!b2Hazir()) return NextResponse.json({ hata: "B2 ayarları eksik." }, { status: 500 });
  try {
    const ad = new URL(request.url).searchParams.get("ad");
    if (ad) {
      const url = (await b2Baglantilari([ad], true)).get(ad);
      return NextResponse.json({ url });
    }
    const dosyalar = (await b2Listele()).filter((f: { ad: string }) => !/\.(webp|png|jpe?g)$/i.test(f.ad));
    return NextResponse.json({ dosyalar });
  } catch (e) {
    return NextResponse.json({ hata: (e as Error).message }, { status: 502 });
  }
}
