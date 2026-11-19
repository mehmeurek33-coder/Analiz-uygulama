import Link from "next/link";
import AktiviteTakvimi from "@/components/AktiviteTakvimi";
import BandAciklama from "@/components/BandAciklama";
import CalismaOnerisi from "@/components/CalismaOnerisi";
import DenemeBaslat from "@/components/DenemeBaslat";
import IstatistikKarti from "@/components/IstatistikKarti";
import KonuMetre from "@/components/KonuMetre";
import TrendGrafik from "@/components/TrendGrafik";
import {
  DONEM_ADI,
  aktiviteGunleri,
  band,
  dersleriTopla,
  donemBaslangici,
  fark,
  gunlereBol,
  konulariTopla,
  oncekiDonemAraligi,
  ozetle,
  sureMetni,
  sureleriOzetle,
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
  const onceki = oncekiDonemAraligi(donem);

  // 84 gunluk pencere hem takvim hem de onceki donem karsilastirmasi icin yeter
  const takvimBaslangic = aktiviteGunleri([], 84)[0].gun;

  const [simdiQ, oncekiQ, takvimQ] = await Promise.all([
    baslangic
      ? supabase.from("v_konu_performans").select("*").gte("gun", baslangic)
      : supabase.from("v_konu_performans").select("*"),
    onceki
      ? supabase
          .from("v_konu_performans")
          .select("toplam, dogru")
          .gte("gun", onceki.bas)
          .lte("gun", onceki.son)
      : Promise.resolve({ data: [] }),
    supabase.from("v_konu_performans").select("gun, toplam, dogru").gte("gun", takvimBaslangic),
  ]);

  const satirlar = (simdiQ.data ?? []) as PerfSatiri[];
  const oncekiSatirlar = (oncekiQ.data ?? []) as PerfSatiri[];
  const takvimSatirlari = (takvimQ.data ?? []) as PerfSatiri[];

  const ozet = ozetle(satirlar);
  const oncekiOzet = ozetle(oncekiSatirlar);
  const konular = konulariTopla(satirlar);
  const dersler = dersleriTopla(satirlar);
  const gunler = gunlereBol(satirlar);
  const sure = sureleriOzetle(satirlar);
  const takvim = aktiviteGunleri(takvimSatirlari, 84);

  const zayiflar = konular.filter((k) => k.toplam >= 2 && k.oran < 0.7);
  const iyiler = [...konular].reverse().filter((k) => k.toplam >= 2 && k.oran >= 0.7);
  const oranFarki =
    oncekiOzet.toplam > 0 && ozet.toplam > 0 ? fark(ozet.oran, oncekiOzet.oran) : null;
  const deltaEtiketi =
    donem === "gun" ? "düne göre" : donem === "hafta" ? "geçen haftaya göre" : "önceki 30 güne göre";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="ince hover:text-metin">
          &larr; Panel
        </Link>
        <h1 className="mt-2 text-xl font-bold sm:text-2xl">Analiz</h1>
        <p className="ince mt-1">Hangi dersin hangi konusunda eksiğin var?</p>
      </div>

      {/* Dönem filtresi - grafiklerin üzerinde tek sıra */}
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
        <>
          <div className="kart space-y-4 text-center">
            <p className="text-3xl">📊</p>
            <div>
              <h2 className="font-semibold">{DONEM_ADI[donem]} içinde bitirilmiş deneme yok</h2>
              <p className="ince mt-1">Bir deneme bitirdiğinde analiz burada oluşmaya başlar.</p>
            </div>
            <div className="mx-auto max-w-xs">
              <DenemeBaslat mod="rastgele" adet={20} etiket="Rastgele 20 soru çöz" />
            </div>
          </div>
          {takvim.some((g) => g.toplam > 0) && (
            <section className="kart">
              <h2 className="mb-3 font-semibold">Çalışma takvimi</h2>
              <AktiviteTakvimi gunler={takvim} />
            </section>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <IstatistikKarti
              baslik="Çözülen soru"
              deger={ozet.toplam}
              alt={DONEM_ADI[donem]}
              sureSn={sure.ortalamaSn}
            />
            <IstatistikKarti
              baslik="Doğru oranı"
              deger={yuzde(ozet.oran)}
              alt={`${ozet.dogru} doğru / ${ozet.yanlis} yanlış`}
              delta={oranFarki}
              deltaEtiket={deltaEtiketi}
              renk={
                band(ozet.oran) === "iyi"
                  ? "text-iyi"
                  : band(ozet.oran) === "orta"
                    ? "text-orta"
                    : "text-zayif"
              }
            />
            <IstatistikKarti
              baslik="Boş"
              deger={ozet.bos}
              alt={ozet.toplam ? `soruların %${Math.round((ozet.bos / ozet.toplam) * 100)}'i` : undefined}
            />
            <IstatistikKarti baslik="Zayıf konu" deger={zayiflar.length} alt="%70 altında" />
          </div>

          <section className="kart">
            <h2 className="mb-1 font-semibold">Önce şunlara çalış</h2>
            <p className="mb-3 text-xs text-silik">
              En çok soru kaybettiğin konular, kaybı en büyük olandan sıralı
            </p>
            <CalismaOnerisi
              konular={[...zayiflar]
                .sort((a, b) => b.yanlis + b.bos - (a.yanlis + a.bos))
                .slice(0, 3)}
            />
          </section>

          <section className="kart">
            <h2 className="mb-1 font-semibold">Günlere göre doğru oranı</h2>
            <p className="mb-3 text-xs text-silik">Bitirilen denemelerin gün bazında ortalaması</p>
            <TrendGrafik noktalar={gunler} />
          </section>

          <section className="kart">
            <h2 className="mb-3 font-semibold">Çalışma takvimi</h2>
            <AktiviteTakvimi gunler={takvim} />
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

          {sure.enYavaslar.length > 0 && (
            <section className="kart">
              <h2 className="mb-1 font-semibold">En çok vakit alan konular</h2>
              <p className="mb-3 text-xs text-silik">
                Soru başına ortalama süre · genel ortalaman {sureMetni(sure.ortalamaSn)}
              </p>
              <ul className="divide-y divide-cizgi">
                {sure.enYavaslar.map((k) => (
                  <li key={k.anahtar} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{k.konu}</p>
                      <p className="text-xs text-silik">
                        {k.ders} · {k.toplam} soru
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {sureMetni(k.ortSn)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

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
