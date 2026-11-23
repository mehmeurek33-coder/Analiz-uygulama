import { NextResponse } from "next/server";
import { gorselBaglantilari } from "@/lib/aciklamaGorsel";
import { denemeSorulari, sonucSatirlari } from "@/lib/denemeVeri";
import { oturumKullanicisi, sunucuIstemcisi } from "@/lib/supabase/server";

/**
 * Yedek yol: tarayıcı veriyi doğrudan Supabase'den alamazsa (oturum okunamadı, ağ engeli) aynı veri buradan, Vercel
 * üzerinden gelir. Normalde kullanılmaz (Fast Origin Transfer kotası, HATALAR E10).
 *   GET /api/deneme-veri?id=<deneme>&tur=cozum|sonuc
 */
export async function GET(request: Request) {
  const user = await oturumKullanicisi();
  if (!user) return NextResponse.json({ hata: "Oturum yok." }, { status: 401 });
  const u = new URL(request.url);
  const id = u.searchParams.get("id") ?? "";
  const supabase = await sunucuIstemcisi();
  const { data: deneme } = await supabase.from("denemeler").select("id, anlik").eq("id", id).single();
  if (!deneme) return NextResponse.json({ hata: "Deneme bulunamadı." }, { status: 404 });
  const fn = async (yollar: (string | null | undefined)[]) => gorselBaglantilari(yollar);
  const veri =
    u.searchParams.get("tur") === "sonuc"
      ? await sonucSatirlari(supabase as never, id, fn)
      : await denemeSorulari(supabase as never, id, { anlik: deneme.anlik }, fn);
  return NextResponse.json({ veri }, { headers: { "Cache-Control": "no-store" } });
}
