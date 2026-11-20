import Link from "next/link";
import { notFound } from "next/navigation";
import BandAciklama from "@/components/BandAciklama";
import DenemeBaslat from "@/components/DenemeBaslat";
import IstatistikKarti from "@/components/IstatistikKarti";
import KonuMetre from "@/components/KonuMetre";
import SetListesi, { kaynagaGore, type Ilerleme } from "@/components/SetListesi";
import { BAND_BILGI, band, yuzde, type KonuOzeti } from "@/lib/analiz";
import { MUFREDAT } from "@/lib/mufredat";
import { oturumKullanicisi, sunucuIstemcisi } from "@/lib/supabase/server";
import type { SoruSeti } from "@/lib/tipler";

export const dynamic = "force-dynamic";

type KonuSatiri = {
  konu: string;
  soru: number;
  cozulen: number;
  toplam: number;
  dogru: number;
  yanlis: number;
  bos: number;
};

export default async function DersSayfasi({ params }: { params: Promise<{ ders: string }> }) {
  const user = await oturumKullanicisi();
  if (!user) return null;

  const ders = decodeURIComponent((await params).ders);
  const tanim = MUFREDAT.find((d) => d.ders === ders);
  if (!tanim) notFound();

  const supabase = await sunucuIstemcisi();
  const [setlerQ, ilerlemeQ, havuzQ, perfQ, tekrarQ] = await Promise.all([
    supabase.from("soru_setleri").select("*").eq("ders", ders),
    supabase.from("v_set_ilerleme").select("set_id, soru_sayisi, cevaplanan, dogru, bitti_at").eq("ders", ders),
    supabase.from("v_konu_havuz").select("konu, soru, cozulen").eq("ders", ders),
    supabase.from("v_konu_toplam").select("konu, toplam, dogru, yanlis, bos").eq("ders", ders),
    supabase
      .from("v_son_cevap")
      .select("soru_id", { count: "exact", head: true })
      .eq("ders", ders)
      .or("dogru.eq.false,emin_degil.eq.true"),
  ]);

  const setler = (setlerQ.data ?? []) as SoruSeti[];
  const ilerleme = new Map<string, Ilerleme>(
    ((ilerlemeQ.data ?? []) as Ilerleme[]).map((x) => [x.set_id, x]),
  );
  const kaynaklar = kaynagaGore(setler);

  // Konu tablosu: müfredat sırası, havuz + performans birleşik
  const konular = new Map<string, KonuSatiri>();
  const satir = (konu: string) => {
    const k = konular.get(konu) ?? { konu, soru: 0, cozulen: 0, toplam: 0, dogru: 0, yanlis: 0, bos: 0 };
    konular.set(konu, k);
    return k;
  };
  for (const h of havuzQ.data ?? []) {
    const k = satir(h.konu ?? "Belirsiz");
    k.soru += Number(h.soru);
    k.cozulen += Number(h.cozulen);
  }
  for (const p of perfQ.data ?? []) {
    const k = satir(p.konu ?? "Belirsiz");
    k.toplam += Number(p.toplam);
    k.dogru += Number(p.dogru);
    k.yanlis += Number(p.yanlis);
    k.bos += Number(p.bos);
  }
  // Konu listesi kitabın bölümlerine göre (varsa); müfredattaki her başlık görünür,
  // müfredat dışı kalan etiketler sonda "Diğer" altında
  const bos = (konu: string): KonuSatiri => ({ konu, soru: 0, cozulen: 0, toplam: 0, dogru: 0, yanlis: 0, bos: 0 });
  const gruplar = (tanim.bolumler ?? [{ baslik: "", konular: tanim.konular }]).map((b) => ({
    baslik: b.baslik,
    satirlar: b.konular.map((k) => konular.get(k) ?? bos(k)),
  }));
  const bilinen = new Set(tanim.konular);
  const diger = [...konular.values()].filter((k) => !bilinen.has(k.konu) && k.soru > 0);
  if (diger.length) gruplar.push({ baslik: "Diğer", satirlar: diger });
  const konuListesi = gruplar.flatMap((g) => g.satirlar);

  const toplamSoru = konuListesi.reduce((a, k) => a + k.soru, 0);
  const cozulen = konuListesi.reduce((a, k) => a + k.cozulen, 0);
  const t = [...konular.values()].reduce(
    (a, k) => ({ toplam: a.toplam + k.toplam, dogru: a.dogru + k.dogru, kayip: a.kayip + k.yanlis + k.bos }),
    { toplam: 0, dogru: 0, kayip: 0 },
  );
  const oran = t.toplam ? t.dogru / t.toplam : 0;

  // En çok soru kaybedilen konular (yanlış + boş), en az 3 soru çözülmüş olanlar
  const kayiplar: KonuOzeti[] = [...konular.values()]
    .filter((k) => k.toplam >= 3 && k.yanlis + k.bos > 0)
    .sort((a, b) => b.yanlis + b.bos - (a.yanlis + a.bos))
    .slice(0, 5)
    .map((k) => ({
      anahtar: k.konu,
      ders,
      konu: k.konu,
      toplam: k.toplam,
      dogru: k.dogru,
      yanlis: k.yanlis,
      bos: k.bos,
      oran: k.dogru / k.toplam,
    }));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-silik hover:text-metin">
          ← Panel
        </Link>
        <h1 className="mt-1 text-xl font-bold sm:text-2xl">{ders}</h1>
        <p className="ince mt-1">{tanim.grup}</p>
      </div>

      {toplamSoru === 0 ? (
        <p className="kart ince">Bu derse henüz soru eklenmedi. PDF&apos;i Claude&apos;a gönder, buraya eklenir.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <IstatistikKarti baslik="Soru havuzu" deger={toplamSoru} alt={`${kaynaklar.length} kaynak`} />
            <IstatistikKarti
              baslik="Çözülen"
              deger={`%${Math.round((cozulen / toplamSoru) * 100)}`}
              alt={`${cozulen}/${toplamSoru} soru`}
            />
            <IstatistikKarti
              baslik="Doğru oranı"
              deger={t.toplam ? yuzde(oran) : "-"}
              alt={t.toplam ? `${t.dogru}/${t.toplam} · tüm zamanlar` : "veri yok"}
              renk={t.toplam ? (oran >= 0.7 ? "text-iyi" : oran >= 0.5 ? "text-orta" : "text-zayif") : "text-metin"}
            />
            <IstatistikKarti baslik="Kaybedilen" deger={t.kayip} alt="yanlış + boş" />
          </div>

          <section className="kart">
            <h2 className="font-semibold">{ders} denemesi</h2>
            <p className="mb-3 text-xs text-silik">Yalnızca bu dersin sorularından</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <DenemeBaslat
                mod="zayif"
                ders={ders}
                adet={20}
                etiket="Zayıf konularım"
                aciklama="%70 altındaki konulardan"
              />
              <DenemeBaslat
                mod="yanlis"
                ders={ders}
                adet={20}
                etiket="Yanlışlarım"
                aciklama={`${tekrarQ.count ?? 0} soru · yanlışların ve emin olmadıkların`}
                ikincil
              />
              <DenemeBaslat
                mod="rastgele"
                ders={ders}
                adet={20}
                etiket="Rastgele 20 soru"
                aciklama="Bütün kaynaklardan karışık"
                ikincil
              />
            </div>
          </section>

          <section className="kart">
            <h2 className="mb-3 font-semibold">Kaynaklar</h2>
            <div className="space-y-2">
              {kaynaklar.map(([kaynak, liste]) => (
                <SetListesi
                  key={kaynak}
                  baslik={kaynak}
                  setler={liste}
                  ilerleme={ilerleme}
                  acik={kaynaklar.length === 1}
                />
              ))}
            </div>
          </section>

          {kayiplar.length > 0 && (
            <section className="kart">
              <h2 className="font-semibold">En çok soru kaybettiğin konular</h2>
              <p className="mb-3 text-xs text-silik">Yanlış + boş sayısına göre · tüm zamanlar</p>
              <div className="mb-3">
                <BandAciklama />
              </div>
              <KonuMetre satirlar={kayiplar} />
            </section>
          )}

          <section className="kart">
            <h2 className="font-semibold">Konular</h2>
            <p className="mb-3 text-xs text-silik">
              {tanim.kaynak ? `${tanim.kaynak} başlıkları · ` : ""}
              &quot;Çöz&quot; o konudan 20 soruluk deneme başlatır
            </p>
            <div className="space-y-2">
              {gruplar.map((g) => {
                const soru = g.satirlar.reduce((a, k) => a + k.soru, 0);
                const coz = g.satirlar.reduce((a, k) => a + k.cozulen, 0);
                const liste = (
                  <ul className="divide-y divide-cizgi">
                    {g.satirlar.map((k) => (
                      <KonuSatir key={k.konu} ders={ders} k={k} />
                    ))}
                  </ul>
                );
                if (!g.baslik) return <div key="tek">{liste}</div>;
                return (
                  <details key={g.baslik} className="group rounded-xl border border-cizgi bg-kart2">
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-3">
                      <span className="text-silik transition group-open:rotate-90" aria-hidden>
                        ▸
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{g.baslik}</span>
                      <span className="shrink-0 text-xs text-silik tabular-nums">
                        {g.satirlar.length} konu · {coz}/{soru} soru
                      </span>
                    </summary>
                    <div className="border-t border-cizgi px-3">{liste}</div>
                  </details>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function KonuSatir({ ders, k }: { ders: string; k: KonuSatiri }) {
  if (k.soru === 0) {
    return (
      <li className="flex items-center gap-3 py-2.5 opacity-50">
        <p className="min-w-0 flex-1 truncate text-sm">{k.konu}</p>
        <span className="shrink-0 text-xs text-silik">soru yok</span>
      </li>
    );
  }
  const oran = k.toplam ? k.dogru / k.toplam : null;
  const bilgi = oran === null ? null : BAND_BILGI[band(oran)];
  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{k.konu}</p>
        <p className="text-xs text-silik tabular-nums">
          {k.cozulen}/{k.soru} soru çözüldü
          {oran !== null && bilgi && (
            <>
              {" · "}
              <span className={bilgi.metin}>
                {bilgi.simge} {yuzde(oran)}
              </span>
              {k.toplam < 5 ? " (henüz az veri)" : ""}
            </>
          )}
        </p>
      </div>
      <DenemeBaslat mod="konu" ders={ders} konu={k.konu} adet={20} etiket="Çöz" ikincil kucuk />
    </li>
  );
}
