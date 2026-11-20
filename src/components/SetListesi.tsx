import Link from "next/link";
import DenemeBaslat from "@/components/DenemeBaslat";
import type { SoruSeti } from "@/lib/tipler";

export type Ilerleme = {
  set_id: string;
  soru_sayisi: number;
  cevaplanan: number;
  dogru: number;
  bitti_at: string | null;
  /** En çok soru çözülen bitmiş tur (tekrar çözüm yarıda kalsa da görünür) */
  son_bitis_at?: string | null;
  son_bitis_cevaplanan?: number | null;
  son_bitis_dogru?: number | null;
  bitis_sayisi?: number | null;
};

export const ILERLEME_ALANLARI =
  "set_id, soru_sayisi, cevaplanan, dogru, bitti_at, son_bitis_at, son_bitis_cevaplanan, son_bitis_dogru, bitis_sayisi";

/** "TTS Mikrobiyoloji · 09 Gram Pozitif Koklar" -> "09 Gram Pozitif Koklar" */
export function bolumAdi(ad: string) {
  return ad.includes(" · ") ? ad.split(" · ").slice(1).join(" · ") : ad;
}

/** Bir kaynağın (kitabın) bölümleri: katlanabilir başlık + bölüm bölüm ilerleme. */
export default function SetListesi({
  baslik,
  setler,
  ilerleme,
  acik = false,
}: {
  baslik: string;
  setler: SoruSeti[];
  ilerleme: Map<string, Ilerleme>;
  acik?: boolean;
}) {
  const biten = setler.filter((x) => ilerleme.get(x.id)?.son_bitis_at || ilerleme.get(x.id)?.bitti_at).length;
  const cevap = setler.reduce((a, x) => a + Number(ilerleme.get(x.id)?.cevaplanan ?? 0), 0);
  const toplam = setler.reduce((a, x) => a + x.soru_sayisi, 0);

  return (
    <details className="group rounded-xl border border-cizgi bg-kart2" open={acik}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-3">
        <span className="text-silik transition group-open:rotate-90" aria-hidden>
          ▸
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{baslik}</span>
        <span className="shrink-0 text-right text-xs text-silik tabular-nums">
          {biten}/{setler.length} bölüm bitti
          <br />
          {cevap}/{toplam} soru
        </span>
      </summary>
      <ul className="divide-y divide-cizgi border-t border-cizgi">
        {setler.map((s) => {
          const il = ilerleme.get(s.id);
          return (
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
                <SetIlerleme soruSayisi={s.soru_sayisi} il={il} />
                {(s.durum === "hata" || (s.durum !== "hazir" && s.soru_sayisi === 0)) && (
                  <p className="text-xs text-silik">
                    {s.durum === "hata"
                      ? `hata: ${s.hata ?? ""}`
                      : `${s.islenen_parca}/${s.parca_sayisi} parça işlendi`}
                  </p>
                )}
              </div>
              {s.durum === "hazir" || s.soru_sayisi > 0 ? (
                <DenemeBaslat
                  mod="tumu"
                  setId={s.id}
                  etiket={!il ? "Çöz" : il.bitti_at ? "Tekrar çöz" : "Devam et"}
                  ikincil
                  kucuk
                />
              ) : (
                <Link href={`/yukle?set=${s.id}`} className="btn-ikincil px-3 py-1.5 text-xs">
                  Devam et
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/**
 * Bölümün durumu: başlanmadı / yüzde kaç çözüldü / tamamlandı + doğru oranı.
 * Tamamlanmış bölüm tekrar çözülürken yarıda kalırsa ikisi birden görünür.
 */
function SetIlerleme({ soruSayisi, il }: { soruSayisi: number; il?: Ilerleme }) {
  if (!il) {
    return <p className="text-xs text-silik">{soruSayisi} soru · başlanmadı</p>;
  }
  const toplam = Number(il.soru_sayisi) || soruSayisi;
  const tamam = il.son_bitis_at ? Number(il.son_bitis_cevaplanan ?? 0) : 0;
  const tamamDogru = tamam ? Math.round((Number(il.son_bitis_dogru ?? 0) / tamam) * 100) : 0;
  const kez = Number(il.bitis_sayisi ?? 0);
  const tamamSatiri = il.son_bitis_at ? (
    <p className="text-xs tabular-nums">
      <span className="font-semibold text-iyi">✓ Tamamlandı</span>
      <span className="text-silik">
        {" "}
        · {tamam}/{toplam} soru · %{tamamDogru} doğru{kez > 1 ? ` · ${kez} tur` : ""}
      </span>
    </p>
  ) : null;

  // Son tur bitmişse ya da yeni tura hiç başlanmadıysa yalnızca tamamlanma bilgisi
  const cevap = Number(il.cevaplanan);
  if (tamamSatiri && (il.bitti_at || cevap === 0)) {
    return (
      <div className="mt-1">
        {tamamSatiri}
        {!il.bitti_at && <p className="text-xs text-silik">Tekrar turu açık · henüz soru çözülmedi</p>}
      </div>
    );
  }

  const yuzde = Math.round((cevap / toplam) * 100);
  const dogruOran = cevap ? Math.round((Number(il.dogru) / cevap) * 100) : 0;
  return (
    <div className="mt-1">
      {tamamSatiri}
      <p className="text-xs tabular-nums">
        {il.bitti_at ? (
          <span className="font-semibold text-iyi">✓ Tamamlandı</span>
        ) : (
          <span className="font-semibold text-vurgu">
            {tamamSatiri ? "Tekrar: " : ""}%{yuzde} çözüldü
          </span>
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

/** Setleri kaynağa göre grupla; kaynak yoksa ad içindeki "Kitap · Bölüm" ayrımına bak. */
export function kaynagaGore(setler: SoruSeti[]): [string, SoruSeti[]][] {
  const gruplar = new Map<string, SoruSeti[]>();
  for (const st of setler) {
    const k = st.kaynak || (st.ad.includes(" · ") ? st.ad.split(" · ")[0] : "Diğer setler");
    gruplar.set(k, [...(gruplar.get(k) ?? []), st]);
  }
  for (const liste of gruplar.values()) {
    liste.sort(
      (a, b) =>
        (a.bolum_no ?? Number.MAX_SAFE_INTEGER) - (b.bolum_no ?? Number.MAX_SAFE_INTEGER) ||
        a.ad.localeCompare(b.ad, "tr"),
    );
  }
  return [...gruplar.entries()].sort((a, b) => a[0].localeCompare(b[0], "tr"));
}
