import Link from "next/link";
import BandAciklama from "@/components/BandAciklama";
import DenemeBaslat from "@/components/DenemeBaslat";
import IstatistikKarti from "@/components/IstatistikKarti";
import KonuMetre from "@/components/KonuMetre";
import {
  donemBaslangici,
  fark,
  konulariTopla,
  oncekiDonemAraligi,
  ozetle,
  sureleriOzetle,
  yuzde,
  type PerfSatiri,
} from "@/lib/analiz";
import { oturumKullanicisi, sunucuIstemcisi } from "@/lib/supabase/server";
import type { Deneme, SoruSeti } from "@/lib/tipler";
import { pdfYuklemeAcik } from "@/lib/ozellikler";

export const dynamic = "force-dynamic";

export default async function Panel() {
  const user = await oturumKullanicisi();
  if (!user) return null;

  const supabase = await sunucuIstemcisi();
  const yuklemeAcik = pdfYuklemeAcik();
  const baslangic = donemBaslangici("hafta")!;
  const onceki = oncekiDonemAraligi("hafta")!;

  const [setlerQ, denemelerQ, perfQ, soruSayisiQ, oncekiQ, ilerlemeQ] = await Promise.all([
    supabase
      .from("soru_setleri")
      .select("*")
      .order("ad", { ascending: true }),
    supabase
      .from("denemeler")
      .select("id, ad, set_id, soru_sayisi, basladi_at, bitti_at")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase.from("v_konu_performans").select("*").gte("gun", baslangic),
    supabase.from("sorular").select("id", { count: "exact", head: true }),
    supabase
      .from("v_konu_performans")
      .select("toplam, dogru")
      .gte("gun", onceki.bas)
      .lte("gun", onceki.son),
    supabase.from("v_set_ilerleme").select("set_id, soru_sayisi, cevaplanan, dogru, bitti_at"),
  ]);

  // set_id -> en son oturumdaki ilerleme
  const ilerleme = new Map<string, Ilerleme>(
    ((ilerlemeQ.data ?? []) as Ilerleme[]).map((x) => [x.set_id, x]),
  );

  const setler = (setlerQ.data ?? []) as SoruSeti[];
  const denemeler = (denemelerQ.data ?? []) as Deneme[];
  const perf = (perfQ.data ?? []) as PerfSatiri[];
  const toplamSoru = soruSayisiQ.count ?? 0;

  // "TTS Mikrobiyoloji · 09 Gram Pozitif Koklar" -> kitap: "TTS Mikrobiyoloji"
  const gruplar = new Map<string, SoruSeti[]>();
  for (const st of setler) {
    const kitap = st.ad.includes(" · ") ? st.ad.split(" · ")[0] : "Diğer setler";
    gruplar.set(kitap, [...(gruplar.get(kitap) ?? []), st]);
  }
  const kitaplar = [...gruplar.entries()];

  const ozet = ozetle(perf);
  const oncekiOzet = ozetle((oncekiQ.data ?? []) as PerfSatiri[]);
  const sure = sureleriOzetle(perf);
  const oranFarki = oncekiOzet.toplam > 0 && ozet.toplam > 0 ? fark(ozet.oran, oncekiOzet.oran) : null;
  const konular = konulariTopla(perf);
  const zayiflar = konular.filter((k) => k.toplam >= 2).slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Panel</h1>
        <p className="ince mt-1">Son 7 günün özeti</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <IstatistikKarti
          baslik="Çözülen soru"
          deger={ozet.toplam}
          alt="son 7 gün"
          sureSn={sure.ortalamaSn}
        />
        <IstatistikKarti
          baslik="Doğru oranı"
          deger={ozet.toplam ? yuzde(ozet.oran) : "-"}
          alt={ozet.toplam ? `${ozet.dogru} dogru / ${ozet.yanlis} yanlis` : "veri yok"}
          renk={ozet.toplam ? (ozet.oran >= 0.7 ? "text-iyi" : ozet.oran >= 0.5 ? "text-orta" : "text-zayif") : "text-metin"}
        />
        <IstatistikKarti baslik="Boş bırakılan" deger={ozet.bos} alt="son 7 gün" />
        <IstatistikKarti baslik="Soru havuzu" deger={toplamSoru} alt="yüklenmiş toplam soru" />
      </div>

      <section className="kart">
        <h2 className="mb-3 font-semibold">Hızlı deneme</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <DenemeBaslat mod="rastgele" adet={20} etiket="Rastgele 20 soru" aciklama="Havuzdan karışık" />
          <DenemeBaslat
            mod="zayif"
            adet={20}
            etiket="Zayıf konularım"
            aciklama="En düşük oranlı konulardan"
            ikincil
          />
          <DenemeBaslat
            mod="yanlis"
            adet={20}
            etiket="Yanlislarim"
            aciklama="Daha önce yanlış yaptıklarım"
            ikincil
          />
        </div>
        {toplamSoru === 0 && (
          <p className="mt-3 rounded-xl border border-orta/40 bg-orta/10 px-3 py-2 text-sm text-orta">
            Havuzda henüz soru yok.{" "}
            {yuklemeAcik ? (
              <>
                <Link href="/yukle" className="underline">
                  Bir soru PDF&apos;i yükle
                </Link>
                .
              </>
            ) : (
              "Soru PDF'lerini Claude'a gönder, sorular buraya eklenecek."
            )}
          </p>
        )}
      </section>

      <section className="kart">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold">En zayıf 5 konu</h2>
          <Link href="/analiz" className="text-sm text-vurgu hover:underline">
            Tüm analiz
          </Link>
        </div>
        <div className="mb-3">
          <BandAciklama />
        </div>
        <KonuMetre satirlar={zayiflar} bosMesaj="Son 7 günde çözülmüş soru yok." />
      </section>

      <section className="kart">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold">Soru setlerim</h2>
          {yuklemeAcik && (
            <Link href="/yukle" className="text-sm text-vurgu hover:underline">
              + PDF yükle
            </Link>
          )}
        </div>
        {setler.length === 0 ? (
          <p className="ince">Henüz set yok.</p>
        ) : (
          <div className="space-y-2">
            {kitaplar.map(([kitap, liste]) => (
              <details
                key={kitap}
                className="group rounded-xl border border-cizgi bg-kart2"
                open={kitaplar.length === 1 && liste.length <= 8}
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-3">
                  <span className="text-silik transition group-open:rotate-90" aria-hidden>
                    ▸
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{kitap}</span>
                  <span className="shrink-0 text-right text-xs text-silik tabular-nums">
                    {liste.filter((x) => ilerleme.get(x.id)?.bitti_at).length}/{liste.length} bölüm bitti
                    <br />
                    {liste.reduce((a, x) => a + Number(ilerleme.get(x.id)?.cevaplanan ?? 0), 0)}/
                    {liste.reduce((a, x) => a + x.soru_sayisi, 0)} soru
                  </span>
                </summary>
                <ul className="divide-y divide-cizgi border-t border-cizgi">
                  {liste.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">
                          {bolumAdi(s.ad)}
                          {s.tur === "deneme" && (
                            <span className="ml-2 rounded-md bg-orta/15 px-1.5 py-0.5 text-[10px] font-semibold text-orta">
                              DENEME
                            </span>
                          )}
                        </p>
                        <SetIlerleme soruSayisi={s.soru_sayisi} il={ilerleme.get(s.id)} />
                        <p className="text-xs text-silik">
                          {s.durum === "hata" ? `hata: ${s.hata ?? ""}` : ""}
                          {s.durum !== "hazir" && s.durum !== "hata"
                            ? ` · ${s.islenen_parca}/${s.parca_sayisi} parça işlendi`
                            : ""}
                        </p>
                      </div>
                      {s.durum === "hazir" || s.soru_sayisi > 0 ? (
                        <DenemeBaslat
                          mod="tumu"
                          setId={s.id}
                          etiket={
                            !ilerleme.get(s.id)
                              ? "Çöz"
                              : ilerleme.get(s.id)?.bitti_at
                                ? "Tekrar çöz"
                                : "Devam et"
                          }
                          ikincil
                          kucuk
                        />
                      ) : (
                        <Link href={`/yukle?set=${s.id}`} className="btn-ikincil px-3 py-1.5 text-xs">
                          Devam et
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        )}
      </section>

      <section className="kart">
        <h2 className="mb-3 font-semibold">Son denemeler</h2>
        {denemeler.length === 0 ? (
          <p className="ince">Henüz deneme yok.</p>
        ) : (
          <ul className="divide-y divide-cizgi">
            {denemeler.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{d.ad}</p>
                  <p className="text-xs text-silik">
                    {d.soru_sayisi} soru ·{" "}
                    {new Date(d.basladi_at).toLocaleString("tr-TR", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <Link
                  href={d.bitti_at ? `/sonuc/${d.id}` : `/deneme/${d.id}`}
                  className="btn-ikincil shrink-0"
                >
                  {d.bitti_at ? "Sonuç" : "Devam et"}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function bolumAdi(ad: string) {
  return ad.includes(" · ") ? ad.split(" · ").slice(1).join(" · ") : ad;
}

type Ilerleme = {
  set_id: string;
  soru_sayisi: number;
  cevaplanan: number;
  dogru: number;
  bitti_at: string | null;
};

/** Bölümün durumu: başlanmadı / yüzde kaç çözüldü / tamamlandı + doğru oranı. */
function SetIlerleme({ soruSayisi, il }: { soruSayisi: number; il?: Ilerleme }) {
  if (!il) {
    return <p className="text-xs text-silik">{soruSayisi} soru · başlanmadı</p>;
  }
  const cevap = Number(il.cevaplanan);
  const toplam = Number(il.soru_sayisi) || soruSayisi;
  const yuzde = Math.round((cevap / toplam) * 100);
  const dogruOran = cevap ? Math.round((Number(il.dogru) / cevap) * 100) : 0;
  return (
    <div className="mt-1">
      <p className="text-xs tabular-nums">
        {il.bitti_at ? (
          <span className="font-semibold text-iyi">✓ Tamamlandı</span>
        ) : (
          <span className="font-semibold text-vurgu">%{yuzde} çözüldü</span>
        )}
        <span className="text-silik">
          {" "}
          · {cevap}/{toplam} soru{cevap > 0 ? ` · %${dogruOran} doğru` : ""}
        </span>
      </p>
      <div className="mt-1 h-1 w-full max-w-48 overflow-hidden rounded-[4px] bg-zemin">
        <div
          className={`h-full rounded-[4px] ${il.bitti_at ? "bg-iyi" : "bg-vurgu"}`}
          style={{ width: `${Math.max(yuzde, cevap ? 3 : 0)}%` }}
        />
      </div>
    </div>
  );
}
