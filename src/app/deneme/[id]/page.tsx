import { redirect } from "next/navigation";
import CozumEkrani, { type CozumSorusu } from "@/components/CozumEkrani";
import { oturumKullanicisi, sunucuIstemcisi } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DenemePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await oturumKullanicisi();
  if (!user) return null;

  const supabase = await sunucuIstemcisi();

  const { data: deneme } = await supabase
    .from("denemeler")
    .select("id, ad, soru_sayisi, bitti_at")
    .eq("id", id)
    .single();

  if (!deneme) {
    return <p className="kart">Deneme bulunamadı.</p>;
  }
  if (deneme.bitti_at) redirect(`/sonuc/${id}`);

  // DIKKAT: dogru_cevap ve aciklama BILEREK secilmiyor - istemciye gitmemeli.
  const { data: satirlar } = await supabase
    .from("cevaplar")
    .select("id, soru_id, sira, isaretlenen, sure_sn, sorular(numara, metin, secenekler, ders, konu)")
    .eq("deneme_id", id)
    .order("sira", { ascending: true });

  const sorular: CozumSorusu[] = (satirlar ?? []).map((s) => {
    const soru = s.sorular as unknown as {
      numara: number | null;
      metin: string;
      secenekler: Record<string, string>;
      ders: string | null;
      konu: string | null;
    };
    return {
      cevapId: s.id,
      soruId: s.soru_id,
      sira: s.sira,
      isaretlenen: s.isaretlenen,
      sureSn: s.sure_sn,
      numara: soru?.numara ?? null,
      metin: soru?.metin ?? "",
      secenekler: soru?.secenekler ?? {},
      ders: soru?.ders ?? null,
      konu: soru?.konu ?? null,
    };
  });

  if (sorular.length === 0) {
    return <p className="kart">Bu denemede soru yok.</p>;
  }

  return <CozumEkrani denemeId={id} ad={deneme.ad} sorular={sorular} />;
}
