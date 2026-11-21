"use client";

import { useState } from "react";
import Gorsel from "@/components/Gorsel";

/**
 * Soru kökü: (varsa) ortak vaka metni, soru metni ve kökteki şekil/grafi.
 * Art arda aynı vakayı paylaşan sorularda vaka ilkinde açık, sonrakilerde kapalı gelir ("Vakayı göster").
 */
export default function SoruKoku({
  metin,
  vakaMetni,
  soruGorsel,
  vakaTekrar = false,
}: {
  metin: string;
  vakaMetni?: string | null;
  soruGorsel?: string | null;
  /** Önceki soru aynı vakayı gösterdiyse true: vaka kapalı başlar */
  vakaTekrar?: boolean;
}) {
  const [vakaAcik, setVakaAcik] = useState(!vakaTekrar);
  const [gorselHata, setGorselHata] = useState(false);
  return (
    <div className="space-y-3">
      {vakaMetni && (
        <div className="rounded-xl border border-vurgu/30 bg-vurgu/5 p-3 text-sm leading-relaxed">
          <button
            type="button"
            className="mb-1 text-xs font-semibold uppercase tracking-wide text-vurgu"
            onClick={() => setVakaAcik((a) => !a)}
          >
            {vakaTekrar ? "Aynı vaka" : "Vaka"} {vakaAcik ? "▲" : "▼ göster"}
          </button>
          {vakaAcik && <p className="whitespace-pre-wrap text-metin/90">{vakaMetni}</p>}
        </div>
      )}
      <p className="leading-relaxed whitespace-pre-wrap">{metin}</p>
      {soruGorsel && !gorselHata && (
        <div className="overflow-hidden rounded-xl border border-cizgi bg-white p-1.5">
          <Gorsel
            src={soruGorsel}
            alt="Sorudaki şekil"
            loading="lazy"
            className="mx-auto block h-auto max-w-full"
            onBasarisiz={() => setGorselHata(true)}
          />
        </div>
      )}
    </div>
  );
}
