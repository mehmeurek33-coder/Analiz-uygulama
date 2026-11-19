import { NextResponse } from "next/server";
import { konuOturt } from "@/lib/mufredat";
import { oturumKullanicisi, sunucuIstemcisi } from "@/lib/supabase/server";

/**
 * Bir soruyu duzeltir: yanlis etiketlenen ders/konu veya eksik cevap anahtari.
 * Cevap anahtari degisirse o sorunun gecmis tum cevaplari yeniden puanlanir,
 * boylece analiz de kendini duzeltir.
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await oturumKullanicisi();
  if (!user) return NextResponse.json({ hata: "Oturum yok." }, { status: 401 });

  const govde = await request.json();
  const supabase = await sunucuIstemcisi();

  const { data: mevcut } = await supabase
    .from("sorular")
    .select("id, ders, konu, dogru_cevap")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!mevcut) return NextResponse.json({ hata: "Soru bulunamadı." }, { status: 404 });

  const guncelleme: Record<string, string | null> = {};

  if (govde.ders !== undefined || govde.konu !== undefined) {
    const { ders, konu } = konuOturt(
      govde.ders ?? mevcut.ders,
      govde.konu ?? mevcut.konu,
    );
    guncelleme.ders = ders;
    guncelleme.konu = konu;
  }

  let anahtarDegisti = false;
  if (govde.dogru_cevap !== undefined) {
    const sik = govde.dogru_cevap === null ? null : String(govde.dogru_cevap).toUpperCase().slice(0, 1);
    if (sik !== null && !/^[A-E]$/.test(sik)) {
      return NextResponse.json({ hata: "Geçersiz şık." }, { status: 400 });
    }
    guncelleme.dogru_cevap = sik;
    anahtarDegisti = sik !== mevcut.dogru_cevap;
  }

  if (Object.keys(guncelleme).length === 0) {
    return NextResponse.json({ hata: "Güncellenecek alan yok." }, { status: 400 });
  }

  const { error } = await supabase
    .from("sorular")
    .update(guncelleme)
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ hata: error.message }, { status: 500 });

  // Anahtar degistiyse bu sorunun gecmis cevaplarini yeniden puanla
  let yenidenPuanlanan = 0;
  if (anahtarDegisti) {
    const yeniAnahtar = guncelleme.dogru_cevap;
    const { data: cevaplar } = await supabase
      .from("cevaplar")
      .select("id, isaretlenen")
      .eq("soru_id", id)
      .eq("user_id", user.id);

    await Promise.all(
      (cevaplar ?? []).map(async (c) => {
        const dogru =
          c.isaretlenen == null || !yeniAnahtar ? null : c.isaretlenen === yeniAnahtar;
        yenidenPuanlanan++;
        await supabase.from("cevaplar").update({ dogru }).eq("id", c.id);
      }),
    );
  }

  return NextResponse.json({ tamam: true, yenidenPuanlanan });
}
