import SonucGovde from "@/components/SonucGovde";
import { oturumKullanicisi, sunucuIstemcisi } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SonucPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await oturumKullanicisi();
  if (!user) return null;

  const supabase = await sunucuIstemcisi();

  const { data: deneme } = await supabase
    .from("denemeler")
    .select("id, ad, soru_sayisi, basladi_at, bitti_at")
    .eq("id", id)
    .single();

  if (!deneme) return <p className="kart">Deneme bulunamadı.</p>;

  return <SonucGovde deneme={{ id: deneme.id, ad: deneme.ad, bitti_at: deneme.bitti_at }} />;
}
