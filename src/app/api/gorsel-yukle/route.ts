import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { b2Hazir, b2Yukle } from "@/lib/b2";

export const maxDuration = 60;

/**
 * Görüntüyü B2'ye yükler. Claude'un aktarım araçları kullanır (B2 anahtarı yalnızca Vercel'de
 * durur). Yetki: x-yukleme-anahtari başlığı = YUKLEME_ANAHTARI ortam değişkeni.
 * POST /api/gorsel-yukle?yol=<soru_id>.webp   gövde: dosyanın kendisi
 */
export async function POST(request: Request) {
  const beklenen = process.env.YUKLEME_ANAHTARI ?? "";
  const gelen = request.headers.get("x-yukleme-anahtari") ?? "";
  const a = Buffer.from(gelen);
  const b = Buffer.from(beklenen);
  if (!beklenen || a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ hata: "Yetkisiz." }, { status: 401 });
  }
  if (!b2Hazir()) return NextResponse.json({ hata: "B2 ayarları eksik." }, { status: 500 });

  const yol = new URL(request.url).searchParams.get("yol") ?? "";
  if (!/^[\w./-]{1,200}$/.test(yol) || yol.includes("..")) {
    return NextResponse.json({ hata: "Geçersiz yol." }, { status: 400 });
  }
  const icerik = Buffer.from(await request.arrayBuffer());
  if (icerik.length === 0 || icerik.length > 4 * 1024 * 1024) {
    return NextResponse.json({ hata: "Dosya boyutu geçersiz." }, { status: 400 });
  }
  try {
    const tur = yol.endsWith(".webp") ? "image/webp" : yol.endsWith(".png") ? "image/png" : "image/jpeg";
    const fileId = await b2Yukle(yol, icerik, tur);
    return NextResponse.json({ tamam: true, fileId });
  } catch (e) {
    return NextResponse.json({ hata: (e as Error).message }, { status: 502 });
  }
}
