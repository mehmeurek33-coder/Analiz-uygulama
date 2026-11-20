import { NextResponse } from "next/server";
import { oturumKullanicisi, sunucuIstemcisi } from "@/lib/supabase/server";

/**
 * Soru bankası modunda soruyu işaretlemeden açıklamasına bakmak. Soru boş kalır ve
 * kilitlenir; "Yanlışlarım" tekrar listesine girer (v_soru_durum). Deneme modunda yok.
 */
export async function POST(request: Request) {
  const user = await oturumKullanicisi();
  if (!user) return NextResponse.json({ hata: "Oturum yok." }, { status: 401 });

  const { denemeId, soruId } = await request.json();
  const supabase = await sunucuIstemcisi();

  const { data: deneme } = await supabase
    .from("denemeler")
    .select("anlik, bitti_at")
    .eq("id", denemeId)
    .eq("user_id", user.id)
    .single();
  if (!deneme?.anlik || deneme.bitti_at) {
    return NextResponse.json({ hata: "Bu denemede kullanılamaz." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("cevaplar")
    .update({ aciklama_bakildi: true, cevaplandi_at: new Date().toISOString() })
    .eq("deneme_id", denemeId)
    .eq("soru_id", soruId)
    .eq("user_id", user.id)
    .is("isaretlenen", null)
    .select("id");
  if (error) return NextResponse.json({ hata: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ hata: "Soru zaten cevaplanmış." }, { status: 409 });
  return NextResponse.json({ tamam: true });
}
