import { NextResponse } from "next/server";
import { oturumKullanicisi, sunucuIstemcisi } from "@/lib/supabase/server";

export const maxDuration = 60;

/** Denemeyi bitirir ve dogru/yanlis hesaplar. Sonuclar bu andan sonra gorunur. */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await oturumKullanicisi();
  if (!user) return NextResponse.json({ hata: "Oturum yok." }, { status: 401 });

  const supabase = await sunucuIstemcisi();

  const { data: deneme } = await supabase
    .from("denemeler")
    .select("anlik")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  const { data: cevaplar, error } = await supabase
    .from("cevaplar")
    .select("id, isaretlenen, aciklama_bakildi, soru_id, sorular(dogru_cevap)")
    .eq("deneme_id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ hata: error.message }, { status: 500 });
  if (!cevaplar?.length) return NextResponse.json({ hata: "Deneme bulunamadı." }, { status: 404 });

  // Soru bankası turunda hiç soru çözülmediyse turu kaydetme: sil (önceki tamamlanmış tur
  // "Tamamlandı" olarak kalır, boş tur onu gölgelemez)
  if (deneme?.anlik && !cevaplar.some((c) => c.isaretlenen != null || c.aciklama_bakildi)) {
    await supabase.from("denemeler").delete().eq("id", id).eq("user_id", user.id);
    return NextResponse.json({ silindi: true });
  }

  // Sonuçları üç grupta topla, her grubu tek istekle yaz (200 soruda 200 istek yerine 3)
  const gruplar: { dogru: string[]; yanlis: string[]; belirsiz: string[] } = { dogru: [], yanlis: [], belirsiz: [] };
  let bos = 0;
  for (const c of cevaplar) {
    const soru = c.sorular as unknown as { dogru_cevap: string | null } | null;
    const anahtar = soru?.dogru_cevap ?? null;
    if (c.isaretlenen == null) {
      bos++;
      gruplar.belirsiz.push(c.id);
    } else if (!anahtar) gruplar.belirsiz.push(c.id);
    else if (c.isaretlenen === anahtar) gruplar.dogru.push(c.id);
    else gruplar.yanlis.push(c.id);
  }
  const yaz = async (ids: string[], deger: boolean | null) => {
    for (let i = 0; i < ids.length; i += 150) {
      const { error: e } = await supabase
        .from("cevaplar")
        .update({ dogru: deger })
        .in("id", ids.slice(i, i + 150))
        .eq("user_id", user.id);
      if (e) throw new Error(e.message);
    }
  };
  try {
    await Promise.all([yaz(gruplar.dogru, true), yaz(gruplar.yanlis, false), yaz(gruplar.belirsiz, null)]);
  } catch (e) {
    return NextResponse.json({ hata: (e as Error).message }, { status: 500 });
  }
  const dogru = gruplar.dogru.length;
  const yanlis = gruplar.yanlis.length;

  await supabase
    .from("denemeler")
    .update({ bitti_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  return NextResponse.json({ dogru, yanlis, bos, toplam: cevaplar.length });
}
