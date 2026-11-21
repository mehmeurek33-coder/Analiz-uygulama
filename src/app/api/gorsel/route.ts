import { NextResponse } from "next/server";
import { gorselBaglantilari } from "@/lib/aciklamaGorsel";
import { oturumKullanicisi } from "@/lib/supabase/server";

/**
 * GET /api/gorsel?yol=<depo yolu> → taze imzalı bağlantıya yönlendirir.
 * Sayfa uzun süre açık kalıp görselin imzalı bağlantısı yüklenemezse arayüz bir kez buradan dener.
 */
export async function GET(request: Request) {
  const user = await oturumKullanicisi();
  if (!user) return NextResponse.json({ hata: "Oturum yok." }, { status: 401 });
  const yol = new URL(request.url).searchParams.get("yol");
  if (!yol || yol.includes("..") || !/\.(webp|png|jpe?g)$/i.test(yol)) {
    return NextResponse.json({ hata: "Geçersiz yol." }, { status: 400 });
  }
  const url = (await gorselBaglantilari([yol])).get(yol);
  if (!url) return NextResponse.json({ hata: "Bağlantı üretilemedi." }, { status: 502 });
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
}
