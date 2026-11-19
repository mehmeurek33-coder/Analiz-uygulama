import { BAND_BILGI } from "@/lib/analiz";

/** Renk tek basina anlam tasimasin diye simge + ad ile aciklama. */
export default function BandAciklama() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-silik">
      {(["iyi", "orta", "zayif"] as const).map((b) => (
        <span key={b} className="inline-flex items-center gap-1.5">
          <span className={BAND_BILGI[b].metin} aria-hidden>
            {BAND_BILGI[b].simge}
          </span>
          {b === "iyi" ? "%70 ve üzeri" : b === "orta" ? "%50-69" : "%50 altı"} ·{" "}
          {BAND_BILGI[b].ad}
        </span>
      ))}
    </div>
  );
}
