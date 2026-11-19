import { BAND_BILGI, band, yuzde, type KonuOzeti } from "@/lib/analiz";

/**
 * Konu bazinda dogru orani - yatay metre.
 * Renk tek basina bilgi tasimaz: her satirda simge, yuzde ve ham sayilar var.
 */
export default function KonuMetre({
  satirlar,
  bosMesaj = "Henüz veri yok.",
}: {
  satirlar: KonuOzeti[];
  bosMesaj?: string;
}) {
  if (satirlar.length === 0) return <p className="ince">{bosMesaj}</p>;

  return (
    <ul className="space-y-3">
      {satirlar.map((s) => {
        const b = band(s.oran);
        const bilgi = BAND_BILGI[b];
        return (
          <li key={s.anahtar} className="group relative">
            <div className="mb-1 flex items-baseline gap-2">
              <span className={`${bilgi.metin} text-xs`} aria-hidden>
                {bilgi.simge}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {s.konu}
                <span className="text-silik"> · {s.ders}</span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{yuzde(s.oran)}</span>
            </div>
            {/* Metre: 4px yuvarlak uc, 8px ince mark, sifir noktasina sabit */}
            <div className="h-2 w-full overflow-hidden rounded-[4px] bg-kart2">
              <div
                className={`h-full rounded-[4px] ${bilgi.sinif}`}
                style={{ width: `${Math.max(s.oran * 100, s.dogru > 0 ? 2 : 0)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-silik tabular-nums">
              {s.dogru} doğru · {s.yanlis} yanlış · {s.bos} boş · {s.toplam} soru
            </p>
          </li>
        );
      })}
    </ul>
  );
}
