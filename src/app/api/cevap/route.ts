import { NextResponse } from "next/server";
import { oturumKullanicisi, sunucuIstemcisi } from "@/lib/supabase/server";

/**
 * Isaretlenen sikki kaydeder. Dogru/yanlis BILGISI DONMEZ -
 * sonuc yalnizca deneme bitirildiginde aciklanir.
 */
export async function POST(request: Request) {
  const user = await oturumKullanicisi();
  if (!user) return NextResponse.json({ hata: "Oturum yok." }, { status: 401 });

  const { denemeId, soruId, isaretlenen, sureSn } = await request.json();
  const sik = isaretlenen == null ? null : String(isaretlenen).toUpperCase().slice(0, 1);
  if (sik !== null && !/^[A-E]$/.test(sik)) {
    return NextResponse.json({ hata: "Geçersiz şık." }, { status: 400 });
  }

  const supabase = await sunucuIstemcisi();
  const { error } = await supabase
    .from("cevaplar")
    .update({
      isaretlenen: sik,
      sure_sn: Math.max(0, Math.min(3600, Number(sureSn) || 0)),
      cevaplandi_at: new Date().toISOString(),
    })
    .eq("deneme_id", denemeId)
    .eq("soru_id", soruId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ hata: error.message }, { status: 500 });
  return NextResponse.json({ tamam: true });
}
