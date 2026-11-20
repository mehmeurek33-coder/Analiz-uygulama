import Link from "next/link";
import BandAciklama from "@/components/BandAciklama";
import DenemeBaslat from "@/components/DenemeBaslat";
import IstatistikKarti from "@/components/IstatistikKarti";
import OncelikListesi from "@/components/OncelikListesi";
import {
  donemBaslangici,
  fark,
  oncekiDonemAraligi,
  ozetle,
  sureleriOzetle,
  yuzde,
  konuSatirlari,
  type KonuToplamSatiri,
} from "@/lib/analiz";
import SetListesi, { ILERLEME_ALANLARI, kaynagaGore, type Ilerleme } from "@/components/SetListesi";
import { MUFREDAT } from "@/lib/mufredat";
import { ONCELIK_ALANLARI, ONCELIKLI_KONU_SAYISI, oncelikSatiri, payDagit } from "@/lib/oncelik";
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

  const [setlerQ, denemelerQ, perfQ, soruSayisiQ, oncekiQ, ilerlemeQ, havuzQ, kaynakQ, tekrarQ, acikQ, oncelikQ] = await Promise.all([
    // Panelde yalnızca dersi belirsiz setler listelenir; dersli setler ders sayfasında
    supabase.from("soru_setleri").select("*").is("ders", null).order("ad", { ascending: true }),
    supabase
      .from("denemeler")
      .select("id, ad, set_id, soru_sayisi, basladi_at, bitti_at")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase.rpc("perf_konu", { bas: baslangic }),
    supabase.from("sorular").select("id", { count: "exact", head: true }),
    supabase.rpc("perf_konu", { bas: onceki.bas, son: onceki.son }),
    supabase.from("v_set_ilerleme").select(ILERLEME_ALANLARI).is("ders", null),
    supabase.from("v_konu_havuz").select("ders, soru, cozulen"),
    supabase.from("v_ders_kaynak").select("ders, kaynak"),
    supabase.from("v_tekrar_vadesi").select("soru_id", { count: "exact", head: true }),
    supabase.from("v_soru_durum").select("soru_id", { count: "exact", head: true }).eq("acik_hata", true),
    supabase
      .from("v_konu_oncelik")
      .select(ONCELIK_ALANLARI)
      .gt("deneme", 0)
      .order("oncelik", { ascending: false })
      .limit(ONCELIKLI_KONU_SAYISI),
  ]);

  // set_id -> en son oturumdaki ilerleme
  const ilerleme = new Map<string, Ilerleme>(
    ((ilerlemeQ.data ?? []) as Ilerleme[]).map((x) => [x.set_id, x]),
  );

  const setler = (setlerQ.data ?? []) as SoruSeti[];
  const denemeler = (denemelerQ.data ?? []) as Deneme[];
  const perf = konuSatirlari(perfQ.data as KonuToplamSatiri[]);
  const toplamSoru = soruSayisiQ.count ?? 0;

  // Ders kartları: havuzdaki soru, en az bir kez çözülen, kaynak adları, son 7 gün oranı
  const dersBilgi = new Map<string, { soru: number; cozulen: number; kaynaklar: Set<string> }>();
  const bilgi = (d: string) => {
    const b = dersBilgi.get(d) ?? { soru: 0, cozulen: 0, kaynaklar: new Set<string>() };
    dersBilgi.set(d, b);
    return b;
  };
  for (const h of havuzQ.data ?? []) {
    const b = bilgi(h.ders ?? "Belirsiz");
    b.soru += Number(h.soru);
    b.cozulen += Number(h.cozulen);
  }
  for (const k of kaynakQ.data ?? []) bilgi(k.ders).kaynaklar.add(k.kaynak);
  const haftalik = new Map<string, { t: number; d: number }>();
  for (const p of perf) {
    const h = haftalik.get(p.ders) ?? { t: 0, d: 0 };
    h.t += Number(p.toplam);
    h.d += Number(p.dogru);
    haftalik.set(p.ders, h);
  }
  const digerSetler = setler;

  const ozet = ozetle(perf);
  const oncekiOzet = ozetle(konuSatirlari(oncekiQ.data as KonuToplamSatiri[]));
  const sure = sureleriOzetle(perf);
  const oranFarki = oncekiOzet.toplam > 0 && ozet.toplam > 0 ? fark(ozet.oran, oncekiOzet.oran) : null;
  const oncelikli = (oncelikQ.data ?? []).map((x) => oncelikSatiri(x as Record<string, unknown>));
  const paylar = payDagit(oncelikli, 20);

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
        <h2 className="font-semibold">Genel deneme · tüm dersler</h2>
        <p className="mb-3 text-xs text-silik">Tek bir derse özel denemeler için aşağıdan dersi aç.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <DenemeBaslat mod="rastgele" adet={20} etiket="Rastgele 20 soru" aciklama="Bütün derslerden karışık" />
          <DenemeBaslat
            mod="zayif"
            adet={20}
            etiket="Öncelikli konular"
            aciklama="Ustalığı düşük, sık sorulan ve tekrarı gelen konular"
            ikincil
          />
          <DenemeBaslat
            mod="yanlis"
            adet={20}
            etiket="Yanlışlarım"
            aciklama={`${tekrarQ.count ?? 0} soru bugün · ${acikQ.count ?? 0} açık hata`}
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
          <h2 className="font-semibold">Öncelikli konular</h2>
          <Link href="/analiz" className="text-sm text-vurgu hover:underline">
            Tüm analiz
          </Link>
        </div>
        <p className="mb-3 text-xs text-silik">
          Ustalık son cevaplara ağırlık verir; bir kez doğru yapmak konuyu &quot;öğrenildi&quot; yapmaz. Hata yaptığın
          soru 2, 7 ve 21 gün sonra yeniden sorulur.
        </p>
        <div className="mb-3">
          <BandAciklama />
        </div>
        <OncelikListesi konular={oncelikli} paylar={paylar} dersGoster bosMesaj="Henüz çözülmüş soru yok." />
      </section>

      <section className="kart">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold">Derslerim</h2>
          {yuklemeAcik && (
            <Link href="/yukle" className="text-sm text-vurgu hover:underline">
              + PDF yükle
            </Link>
          )}
        </div>
        {(["Temel Bilimler", "Klinik Bilimler"] as const).map((grup) => (
          <div key={grup} className="mb-4 last:mb-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-silik">{grup}</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {MUFREDAT.filter((d) => d.grup === grup).map((d) => (
                <DersKarti
                  key={d.ders}
                  ders={d.ders}
                  soru={dersBilgi.get(d.ders)?.soru ?? 0}
                  cozulen={dersBilgi.get(d.ders)?.cozulen ?? 0}
                  kaynaklar={[...(dersBilgi.get(d.ders)?.kaynaklar ?? [])].sort((a, b) => a.localeCompare(b, "tr"))}
                  hafta={haftalik.get(d.ders)}
                />
              ))}
            </div>
          </div>
        ))}
        {digerSetler.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-silik">Dersi belirsiz setler</p>
            {kaynagaGore(digerSetler).map(([kaynak, liste]) => (
              <SetListesi key={kaynak} baslik={kaynak} setler={liste} ilerleme={ilerleme} />
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

function DersKarti({
  ders,
  soru,
  cozulen,
  kaynaklar,
  hafta,
}: {
  ders: string;
  soru: number;
  cozulen: number;
  kaynaklar: string[];
  hafta?: { t: number; d: number };
}) {
  if (soru === 0) {
    return (
      <div className="rounded-xl border border-dashed border-cizgi px-3 py-3 opacity-60">
        <p className="text-sm font-medium">{ders}</p>
        <p className="text-xs text-silik">henüz soru yok</p>
      </div>
    );
  }
  const yuzde = Math.round((cozulen / soru) * 100);
  const oran = hafta && hafta.t ? hafta.d / hafta.t : null;
  return (
    <Link
      href={`/ders/${encodeURIComponent(ders)}`}
      className="block rounded-xl border border-cizgi bg-kart2 px-3 py-3 transition hover:border-vurgu/60"
    >
      <div className="flex items-baseline gap-2">
        <p className="min-w-0 flex-1 truncate font-medium">{ders}</p>
        <span className="text-silik" aria-hidden>
          ›
        </span>
      </div>
      <p className="truncate text-xs text-silik">{kaynaklar.join(" · ") || "kaynak belirtilmemiş"}</p>
      <p className="mt-2 text-xs tabular-nums">
        <span className="font-semibold text-vurgu">%{yuzde}</span>
        <span className="text-silik">
          {" "}
          çözüldü · {cozulen}/{soru} soru
        </span>
      </p>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-[4px] bg-zemin">
        <div className="h-full rounded-[4px] bg-vurgu" style={{ width: `${Math.max(yuzde, cozulen ? 2 : 0)}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-silik tabular-nums">
        Son 7 gün:{" "}
        {oran === null ? (
          "soru çözülmedi"
        ) : (
          <span className={oran >= 0.7 ? "text-iyi" : oran >= 0.5 ? "text-orta" : "text-zayif"}>
            %{Math.round(oran * 100)} doğru ({hafta!.t} soru)
          </span>
        )}
      </p>
    </Link>
  );
}
