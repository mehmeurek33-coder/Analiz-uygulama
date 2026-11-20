import DenemeBaslat from "@/components/DenemeBaslat";
import { BAND_BILGI, band } from "@/lib/analiz";
import { AZ_KANIT, type KonuOncelik } from "@/lib/oncelik";

/**
 * Öncelikli konular: ustalık metresi + açık hata / tekrar zamanı gelen sayısı + "Öncelikli
 * konular" denemesindeki payı. Ustalık zamanla ağırlıklı ortalamadır: tek doğru bir konuyu
 * "anlaşılmış" yapmaz.
 */
export default function OncelikListesi({
  konular,
  paylar,
  dersGoster = false,
  bosMesaj = "Henüz çözülmüş soru yok.",
}: {
  konular: KonuOncelik[];
  paylar?: number[];
  dersGoster?: boolean;
  bosMesaj?: string;
}) {
  if (konular.length === 0) return <p className="ince">{bosMesaj}</p>;
  return (
    <ul className="space-y-3">
      {konular.map((k, i) => {
        const bilgi = BAND_BILGI[band(k.ustalik)];
        const az = k.kanit < AZ_KANIT;
        return (
          <li key={`${k.ders}/${k.konu}`} className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-baseline gap-2">
                <span className={`${bilgi.metin} text-xs`} aria-hidden>
                  {bilgi.simge}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {k.konu}
                  {dersGoster && <span className="text-silik"> · {k.ders}</span>}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">%{Math.round(k.ustalik * 100)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-[4px] bg-kart2">
                <div
                  className={`h-full rounded-[4px] ${bilgi.sinif}`}
                  style={{ width: `${Math.max(k.ustalik * 100, 2)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-silik tabular-nums">
                ustalık{az ? " (henüz az veri)" : ""} · {k.cozulen}/{k.soru} soru çözüldü
                {k.acik_hata > 0 && (
                  <>
                    {" · "}
                    <span className="text-zayif">{k.acik_hata} açık hata</span>
                    {k.vadesi_gelen > 0 && <> ({k.vadesi_gelen} tekrarı bugün)</>}
                  </>
                )}
                {paylar && paylar[i] > 0 && <> · denemede {paylar[i]} soru</>}
              </p>
            </div>
            <DenemeBaslat mod="konu" ders={k.ders} konu={k.konu} adet={20} etiket="Çöz" ikincil kucuk />
          </li>
        );
      })}
    </ul>
  );
}
