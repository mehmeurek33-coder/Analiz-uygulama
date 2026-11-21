import { NextResponse } from "next/server";
import { oturumKullanicisi, sunucuIstemcisi } from "@/lib/supabase/server";

const TURLER = ["metin", "sik", "anahtar", "aciklama", "gorsel", "konu", "diger"] as const;

/**
 * Soru hata bildirimi: kök/şık metni bozuk, anahtar şüpheli, açıklama başka soruya ait vb.
 * Claude oturum başında açık bildirimleri kitaptaki görüntüyle kontrol edip düzeltir.
 */
export async function POST(request: Request) {
  const user = await oturumKullanicisi();
  if (!user) return NextResponse.json({ hata: "Oturum yok." }, { status: 401 });

  const { soruId, tur, not } = await request.json();
  if (!soruId) return NextResponse.json({ hata: "Eksik bilgi." }, { status: 400 });
  const gecerliTur = (TURLER as readonly string[]).includes(tur) ? tur : "diger";
  const notu = typeof not === "string" ? not.trim().slice(0, 1000) : null;

  const supabase = await sunucuIstemcisi();
  const { error } = await supabase
    .from("soru_bildirimleri")
    .insert({ user_id: user.id, soru_id: soruId, tur: gecerliTur, notu: notu || null });
  if (error) return NextResponse.json({ hata: error.message }, { status: 500 });
  return NextResponse.json({ tamam: true });
}
