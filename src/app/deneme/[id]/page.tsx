import { redirect } from "next/navigation";
import CozumYukleyici from "@/components/CozumYukleyici";
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

  return <CozumYukleyici denemeId={id} ad={deneme.ad} anlik={Boolean(deneme.anlik)} />;
}
