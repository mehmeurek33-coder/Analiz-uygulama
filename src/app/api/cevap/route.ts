import { NextResponse } from "next/server";
import { oturumKullanicisi, sunucuIstemcisi } from "@/lib/supabase/server";

/**
 * İşaretlenen şıkkı kaydeder.
 *
 * - Deneme modu (anlik = false): doğru/yanlış bilgisi DÖNMEZ; sonuç test bitince açılır.
 *   Şık test bitene kadar değiştirilebilir.
 * - Soru bankası modu (anlik = true): cevap anında puanlanır, doğru şık ve kitaptaki
 *   açıklama döner. Cevap görüldükten sonra şık değiştirilemez (analiz yanıltıcı olmasın).
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

  const { data: deneme } = await supabase
    .from("denemeler")
    .select("id, anlik, bitti_at")
    .eq("id", denemeId)
    .eq("user_id", user.id)
    .single();
  if (!deneme) return NextResponse.json({ hata: "Deneme bulunamadı." }, { status: 404 });
  if (deneme.bitti_at) {
    return NextResponse.json({ hata: "Bu deneme bitmiş, cevap değiştirilemez." }, { status: 409 });
  }

  const sure = Math.max(0, Math.min(3600, Number(sureSn) || 0));

  if (!deneme.anlik) {
    const { error } = await supabase
      .from("cevaplar")
      .update({ isaretlenen: sik, sure_sn: sure, cevaplandi_at: new Date().toISOString() })
      .eq("deneme_id", denemeId)
      .eq("soru_id", soruId)
      .eq("user_id", user.id);
    if (error) return NextResponse.json({ hata: error.message }, { status: 500 });
    return NextResponse.json({ tamam: true });
  }

  // ---- Soru bankası modu: anında puanla
  if (sik === null) {
    return NextResponse.json({ hata: "Bu modda cevap boşa alınamaz." }, { status: 400 });
  }

  const { data: satir } = await supabase
    .from("cevaplar")
    .select("id, isaretlenen, aciklama_bakildi, sorular(dogru_cevap, aciklama)")
    .eq("deneme_id", denemeId)
    .eq("soru_id", soruId)
    .eq("user_id", user.id)
    .single();
  if (!satir) return NextResponse.json({ hata: "Soru bu denemede yok." }, { status: 404 });
  if (satir.aciklama_bakildi && !satir.isaretlenen) {
    return NextResponse.json({ hata: "Açıklamasına bakılan soru boş sayılır." }, { status: 409 });
  }

  const soru = satir.sorular as unknown as { dogru_cevap: string | null; aciklama: string | null } | null;
  const dogruCevap = soru?.dogru_cevap ?? null;

  // Daha önce cevaplandıysa değiştirme, mevcut sonucu döndür
  const gecerliSik = satir.isaretlenen ?? sik;
  const dogru = dogruCevap ? gecerliSik === dogruCevap : null;

  if (!satir.isaretlenen) {
    const { error } = await supabase
      .from("cevaplar")
      .update({ isaretlenen: sik, dogru, sure_sn: sure, cevaplandi_at: new Date().toISOString() })
      .eq("id", satir.id)
      .eq("user_id", user.id);
    if (error) return NextResponse.json({ hata: error.message }, { status: 500 });
  }

  return NextResponse.json({
    tamam: true,
    isaretlenen: gecerliSik,
    dogru,
    dogruCevap,
    aciklama: soru?.aciklama ?? null,
  });
}
