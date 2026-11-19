import Link from "next/link";
import BandAciklama from "@/components/BandAciklama";
import DenemeBaslat from "@/components/DenemeBaslat";
import IstatistikKarti from "@/components/IstatistikKarti";
import KonuMetre from "@/components/KonuMetre";
import TrendGrafik from "@/components/TrendGrafik";
import {
  DONEM_ADI,
  band,
  dersleriTopla,
  donemBaslangici,
  gunlereBol,
  konulariTopla,
  ozetle,
  yuzde,
  type Donem,
  type PerfSatiri,
} from "@/lib/analiz";
import { oturumKullanicisi, sunucuIstemcisi } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const DONEMLER: Donem[] = ["gun", "hafta", "ay", "tum"];

export default async function AnalizPage({
  searchParams,
}: {
  searchParams: Promise<{ donem?: string }>;
}) {
  const sp = await searchParams;
  const donem: Donem = DONEMLER.includes(sp.donem as Donem) ? (sp.donem as Donem) : "hafta";

  const user = await oturumKullanicisi();
  if (!user) return null;

  const supabase = await sunucuIstemcisi();
  const baslangic = donemBaslangici(donem);

  let sorgu = supabase.from("v_konu_performans").select("*");
  if (baslangic) sorgu = sorgu.gte("gun", baslangic);
  const { data } = await sorgu;
  const satirlar = (data ?? []) as PerfSatiri[];

  const ozet = ozetle(satirlar);
  const konular = konulariTopla(satirlar);
  const dersler = dersleriTopla(satirlar);
  const gunler = gunlereBol(satirlar);

  const zayiflar = konular.filter((k) => k.toplam >= 2 && k.oran < 0.7);
  const iyiler = [...konular].reverse().filter((k) => k.toplam >= 2 && k.oran >= 0.7);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="ince hover:text-metin">
          &larr; Panel
        </Link>
        <h1 className="mt-2 text-xl font-bold sm:text-2xl">Analiz</h1>
        <p className="ince mt-1">Hangi dersin hangi konusunda eksiğin var?</p>
      </div>

      {/* Donem filtresi - grafiklerin uzerinde tek sira */}
      <div className="flex flex-wrap gap-2">
        {DONEMLER.map((d) => (
          <Link
            key={d}
            href={`/analiz?donem=${d}`}
            className={`rounded-xl border px-3 py-1.5 text-sm transition ${
              d === donem
                ? "border-vurgu bg-vurgu/15 text-vurgu"
                : "border-cizgi bg-kart text-silik hover:text-metin"
            }`}
          >
            {DONEM_ADI[d]}
          </Link>
        ))}
      </div>

      {ozet.toplam === 0 ? (
        <div className="kart space-y-4 text-center">
          <p className="text-3xl">📊</p>
          <div>
            <h2 className="font-semibold">{DONEM_ADI[donem]} içinde bitirilmiş deneme yok</h2>
            <p className="ince mt-1">
              Bir deneme bitirdiğinde analiz burada oluşmaya başlar.
            </p>
          </div>
          <div className="mx-auto max-w-xs">
            <DenemeBaslat mod="rastgele" adet={20} etiket="Rastgele 20 soru çöz" />
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <IstatistikKarti baslik="Çözülen soru" deger={ozet.toplam} alt={DONEM_ADI[donem]} />
            <IstatistikKarti
              baslik="Doğru oranı"
              deger={yuzde(ozet.oran)}
              alt={`${ozet.dogru} dogru / ${ozet.yanlis} yanlis`}
              renk={
                band(ozet.oran) === "iyi"
                  ? "text-iyi"
                  : band(ozet.oran) === "orta"
                    ? "text-orta"
                    : "text-zayif"
              }
            />
            <IstatistikKarti baslik="Boş" deger={ozet.bos} />
            <IstatistikKarti baslik="Zayıf konu" deger={zayiflar.length} alt="%70 altında" />
          </div>

          <section className="kart">
            <h2 className="mb-1 font-semibold">Günlere göre doğru oranı</h2>
            <p className="mb-3 text-xs text-silik">Bitirilen denemelerin gün bazında ortalaması</p>
            <TrendGrafik noktalar={gunler} />
          </section>

          <section className="kart">
            <h2 className="mb-3 font-semibold">Derslere göre</h2>
            <div className="mb-3">
              <BandAciklama />
            </div>
            <KonuMetre
              satirlar={dersler.map((d) => ({
                anahtar: d.ders,
                ders: d.ders,
                konu: d.ders,
                toplam: d.toplam,
                dogru: d.dogru,
                yanlis: d.toplam - d.dogru,
                bos: 0,
                oran: d.oran,
              }))}
            />
          </section>

          <section className="kart">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Eksik olduğun konular</h2>
                <p className="text-xs text-silik">En düşük orandan yukarı doğru</p>
              </div>
              {zayiflar.length > 0 && (
                <div className="w-full sm:w-52">
                  <DenemeBaslat mod="zayif" adet={20} etiket="Bu konulardan çöz" ikincil />
                </div>
              )}
            </div>
            <KonuMetre
              satirlar={zayiflar}
              bosMesaj="Bu dönemde %70 altında konu yok, iyi gidiyorsun."
            />
          </section>

          {iyiler.length > 0 && (
            <section className="kart">
              <h2 className="mb-3 font-semibold">İyi olduğun konular</h2>
              <KonuMetre satirlar={iyiler.slice(0, 10)} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
