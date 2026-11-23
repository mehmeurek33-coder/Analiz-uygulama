import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { b2Hazir, b2YuklemeAdresi } from "@/lib/b2";

/**
 * GET /api/b2-yukleme-adresi (x-yukleme-anahtari = YUKLEME_ANAHTARI) → {uploadUrl, authorizationToken}.
 * Toplu görsel yüklemesi dosyaları Vercel'den geçirmez (Fast Origin Transfer kotası, HATALAR E10): araç bu adresi
 * alır, dosyayı Cloudflare Worker'ın /b2-yukle yoluna gönderir, Worker doğrudan B2'ye iletir.
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
    return NextResponse.json(await b2YuklemeAdresi(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ hata: (e as Error).message }, { status: 502 });
  }
}
