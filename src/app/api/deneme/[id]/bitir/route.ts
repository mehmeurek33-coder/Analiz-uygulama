import { NextResponse } from "next/server";
import { oturumKullanicisi, sunucuIstemcisi } from "@/lib/supabase/server";

export const maxDuration = 60;

/** Denemeyi bitirir ve dogru/yanlis hesaplar. Sonuclar bu andan sonra gorunur. */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await oturumKullanicisi();
  if (!user) return NextResponse.json({ hata: "Oturum yok." }, { status: 401 });

  const supabase = await sunucuIstemcisi();

  const { data: cevaplar, error } = await supabase
    .from("cevaplar")
    .select("id, isaretlenen, soru_id, sorular(dogru_cevap)")
    .eq("deneme_id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ hata: error.message }, { status: 500 });
  if (!cevaplar?.length) return NextResponse.json({ hata: "Deneme bulunamadı." }, { status: 404 });

  let dogru = 0;
  let yanlis = 0;
  let bos = 0;

  await Promise.all(
    cevaplar.map(async (c) => {
      const soru = c.sorular as unknown as { dogru_cevap: string | null } | null;
      const anahtar = soru?.dogru_cevap ?? null;
      let sonuc: boolean | null = null;

      if (c.isaretlenen == null) {
        bos++;
      } else if (anahtar) {
        sonuc = c.isaretlenen === anahtar;
        if (sonuc) dogru++;
        else yanlis++;
      }
      await supabase.from("cevaplar").update({ dogru: sonuc }).eq("id", c.id);
    }),
  );

  await supabase
    .from("denemeler")
    .update({ bitti_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  return NextResponse.json({ dogru, yanlis, bos, toplam: cevaplar.length });
}
