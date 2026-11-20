import { NextResponse } from "next/server";
import { oturumKullanicisi, sunucuIstemcisi } from "@/lib/supabase/server";

/**
 * Soruyu "emin değilim" olarak işaretler / işareti kaldırır.
 * Emin olunmayan sorular doğru cevaplansa da tekrar listesine (Yanlışlarım) girer.
 */
export async function POST(request: Request) {
  const user = await oturumKullanicisi();
  if (!user) return NextResponse.json({ hata: "Oturum yok." }, { status: 401 });

  const { denemeId, soruId, eminDegil } = await request.json();
  if (!denemeId || !soruId) return NextResponse.json({ hata: "Eksik bilgi." }, { status: 400 });

  const supabase = await sunucuIstemcisi();
  const { data, error } = await supabase
    .from("cevaplar")
    .update({ emin_degil: Boolean(eminDegil) })
    .eq("deneme_id", denemeId)
    .eq("soru_id", soruId)
    .eq("user_id", user.id)
    .select("id");
  if (error) return NextResponse.json({ hata: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ hata: "Soru bu denemede yok." }, { status: 404 });
  return NextResponse.json({ tamam: true });
}
