import { sureMetni } from "@/lib/analiz";

/**
 * Tek sayıyı öne çıkaran kart (grafik değil - kasıtlı olarak sade).
 * Delta verilirse renk + ok + yazı birlikte kullanılır, renk tek başına anlam taşımaz.
 */
export default function IstatistikKarti({
  baslik,
  deger,
  alt,
  renk = "text-metin",
  delta,
  deltaEtiket,
  sureSn,
}: {
  baslik: string;
  deger: string | number;
  alt?: string;
  renk?: string;
  delta?: number | null;
  deltaEtiket?: string;
  sureSn?: number;
}) {
  const yukseldi = typeof delta === "number" && delta > 0;
  const dustu = typeof delta === "number" && delta < 0;

  return (
    <div className="kart">
      <p className="text-xs font-medium tracking-wide text-silik uppercase">{baslik}</p>
      <p className={`mt-1.5 text-3xl font-bold tabular-nums ${renk}`}>{deger}</p>

      {typeof delta === "number" && (
        <p className="mt-1 text-xs leading-snug">
          <span
            className={`font-semibold whitespace-nowrap ${
              yukseldi ? "text-iyi" : dustu ? "text-zayif" : "text-silik"
            }`}
          >
            {delta === 0 ? (
              "değişim yok"
            ) : (
              <>
                <span aria-hidden>{yukseldi ? "▲" : "▼"}</span> {yukseldi ? "+" : ""}
                {delta} puan
              </>
            )}
          </span>
          {deltaEtiket && <span className="text-silik"> {deltaEtiket}</span>}
        </p>
      )}

      {sureSn !== undefined && sureSn > 0 && (
        <p className="mt-0.5 text-xs text-silik">soru başına {sureMetni(sureSn)}</p>
      )}
      {alt && <p className="mt-0.5 text-xs text-silik">{alt}</p>}
    </div>
  );
}
