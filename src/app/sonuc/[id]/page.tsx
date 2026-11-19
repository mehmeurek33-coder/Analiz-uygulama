import Link from "next/link";
import BandAciklama from "@/components/BandAciklama";
import IstatistikKarti from "@/components/IstatistikKarti";
import KonuMetre from "@/components/KonuMetre";
import SonucListesi, { type SonucSatiri } from "@/components/SonucListesi";
import { band, yuzde, type KonuOzeti } from "@/lib/analiz";
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

  const { data: satirlar } = await supabase
    .from("cevaplar")
    .select(
      "id, soru_id, sira, isaretlenen, dogru, sure_sn, sorular(numara, metin, secenekler, dogru_cevap, aciklama, ders, konu, alt_konu)",
    )
    .eq("deneme_id", id)
    .order("sira", { ascending: true });

  const sonuclar: SonucSatiri[] = (satirlar ?? []).map((s) => {
    const soru = s.sorular as unknown as {
      numara: number | null;
      metin: string;
      secenekler: Record<string, string>;
      dogru_cevap: string | null;
      aciklama: string | null;
      ders: string | null;
      konu: string | null;
      alt_konu: string | null;
    };
    return {
      id: s.id,
      soruId: s.soru_id,
      sira: s.sira,
      isaretlenen: s.isaretlenen,
      dogru: s.dogru,
      sureSn: s.sure_sn,
      numara: soru?.numara ?? null,
      metin: soru?.metin ?? "",
      secenekler: soru?.secenekler ?? {},
      dogruCevap: soru?.dogru_cevap ?? null,
      aciklama: soru?.aciklama ?? null,
      ders: soru?.ders ?? null,
      konu: soru?.konu ?? null,
      altKonu: soru?.alt_konu ?? null,
    };
  });

  const dogru = sonuclar.filter((s) => s.dogru === true).length;
  const yanlis = sonuclar.filter((s) => s.dogru === false && s.isaretlenen).length;
  const bos = sonuclar.filter((s) => !s.isaretlenen).length;
  const anahtarsiz = sonuclar.filter((s) => s.isaretlenen && !s.dogruCevap).length;
  const degerlendirilen = dogru + yanlis;
  const oran = degerlendirilen ? dogru / degerlendirilen : 0;
  const net = dogru - yanlis / 4;

  // Bu denemenin konu kirilimi
  const harita = new Map<string, KonuOzeti>();
  for (const s of sonuclar) {
    const ders = s.ders ?? "Belirsiz";
    const konu = s.konu ?? "Belirsiz";
    const anahtar = `${ders} / ${konu}`;
    const k =
      harita.get(anahtar) ?? { anahtar, ders, konu, toplam: 0, dogru: 0, yanlis: 0, bos: 0, oran: 0 };
    k.toplam += 1;
    if (s.dogru === true) k.dogru += 1;
    else if (s.dogru === false && s.isaretlenen) k.yanlis += 1;
    if (!s.isaretlenen) k.bos += 1;
    harita.set(anahtar, k);
  }
  const konular = [...harita.values()]
    .map((k) => ({ ...k, oran: k.toplam ? k.dogru / k.toplam : 0 }))
    .sort((a, b) => a.oran - b.oran);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="ince hover:text-metin">
          &larr; Panel
        </Link>
        <h1 className="mt-2 text-xl font-bold sm:text-2xl">{deneme.ad}</h1>
        <p className="ince mt-1">
          {deneme.bitti_at
            ? new Date(deneme.bitti_at).toLocaleString("tr-TR", {
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "Devam ediyor"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <IstatistikKarti baslik="Doğru" deger={dogru} renk="text-iyi" />
        <IstatistikKarti baslik="Yanlış" deger={yanlis} renk="text-zayif" />
        <IstatistikKarti baslik="Boş" deger={bos} />
        <IstatistikKarti
          baslik="Doğru oranı"
          deger={degerlendirilen ? yuzde(oran) : "-"}
          alt={`net ${net.toFixed(2)}`}
          renk={
            degerlendirilen
              ? band(oran) === "iyi"
                ? "text-iyi"
                : band(oran) === "orta"
                  ? "text-orta"
                  : "text-zayif"
              : "text-metin"
          }
        />
      </div>

      {anahtarsiz > 0 && (
        <p className="rounded-xl border border-orta/40 bg-orta/10 px-3 py-2 text-sm text-orta">
          {anahtarsiz} sorunun cevap anahtarı bilinmiyor, bunlar orana katılmadı. Seti düzenleyerek
          anahtarı sonradan girebilirsin.
        </p>
      )}

      <section className="kart">
        <h2 className="mb-3 font-semibold">Bu testte konu dağılımı</h2>
        <div className="mb-3">
          <BandAciklama />
        </div>
        <KonuMetre satirlar={konular} />
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Soru soru inceleme</h2>
        <SonucListesi satirlar={sonuclar} />
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link href="/analiz" className="btn-ana flex-1">
          Genel analizi gör
        </Link>
        <Link href="/" className="btn-ikincil flex-1">
          Panele dön
        </Link>
      </div>
    </div>
  );
}
