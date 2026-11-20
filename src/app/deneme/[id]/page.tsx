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
    .select("id, ad, soru_sayisi, bitti_at, anlik")
    .eq("id", id)
    .single();

  if (!deneme) {
    return <p className="kart">Deneme bulunamadı.</p>;
  }
  if (deneme.bitti_at) redirect(`/sonuc/${id}`);

  // DİKKAT: dogru_cevap ve aciklama yalnızca soru bankası modunda ve yalnızca
  // CEVAPLANMIŞ sorular için istemciye gönderilir. Cevaplanmamış soruların doğru
  // şıkkı tarayıcıya hiç gitmez.
  const alanlar = deneme.anlik
    ? "numara, metin, secenekler, ders, konu, dogru_cevap, aciklama"
    : "numara, metin, secenekler, ders, konu";

  const { data: satirlar } = await supabase
    .from("cevaplar")
    .select(`id, soru_id, sira, isaretlenen, dogru, sure_sn, sorular(${alanlar})`)
    .eq("deneme_id", id)
    .order("sira", { ascending: true });

  const sorular: CozumSorusu[] = (satirlar ?? []).map((s) => {
    const soru = s.sorular as unknown as {
      numara: number | null;
      metin: string;
      secenekler: Record<string, string>;
      ders: string | null;
      konu: string | null;
      dogru_cevap?: string | null;
      aciklama?: string | null;
    };
    const acik = Boolean(deneme.anlik && s.isaretlenen);
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
      sonuc: acik
        ? { dogru: s.dogru, dogruCevap: soru?.dogru_cevap ?? null, aciklama: soru?.aciklama ?? null }
        : null,
    };
  });

  if (sorular.length === 0) {
    return <p className="kart">Bu denemede soru yok.</p>;
  }

  return <CozumEkrani denemeId={id} ad={deneme.ad} anlik={Boolean(deneme.anlik)} sorular={sorular} />;
}
