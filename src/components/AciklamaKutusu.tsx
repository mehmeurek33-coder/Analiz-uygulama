"use client";

import { useState } from "react";
import Gorsel from "@/components/Gorsel";

/** Açıklama bloğu: metin paragrafı ya da yalnızca kendisi kadar kırpılmış şekil/tablo. */
export type AciklamaBlogu =
  | { t: "m"; x: string }
  | { t: "g"; yol: string; url?: string | null; w: number; h: number; tur?: string };

/** Tam sütun kırpıntısının piksel genişliği: bu genişlikteki görüntü kutuyu doldurur. */
const SUTUN_GENISLIGI = 720;

/**
 * Kitap açıklaması.
 * - Bloklar varsa: temiz metin + araya kitaptaki yerinde şekil/tablo kırpıntıları;
 *   altta "Kitaptaki hâlini göster" ile açıklamanın tam sayfa görüntüsü.
 * - Blok yoksa: tam görüntü (varsa), metin hâli isteğe bağlı.
 * - Hiçbiri yoksa: metin.
 */
export default function AciklamaKutusu({
  metin,
  gorsel,
  bloklar,
}: {
  metin: string | null;
  gorsel?: string | null;
  bloklar?: AciklamaBlogu[] | null;
}) {
  const [ikinciAcik, setIkinciAcik] = useState(false);
  const [gorselHata, setGorselHata] = useState(false);
  const gorselVar = Boolean(gorsel) && !gorselHata;

  const tamGorsel = (
    <div className="overflow-hidden rounded-xl border border-cizgi bg-white">
      <Gorsel
        src={gorsel!}
        alt="Kitaptaki açıklama"
        loading="lazy"
        className="block h-auto w-full"
        onBasarisiz={() => setGorselHata(true)}
      />
    </div>
  );
  const metinKutusu = (x: string | null) => (
    <div className="rounded-xl border border-cizgi bg-kart2 p-3 text-sm leading-relaxed whitespace-pre-wrap text-metin/90">
      {x || "Bu soru için kitapta açıklama bulunamadı."}
    </div>
  );

  // Bloklu görünüm
  const goruntulenebilir = (bloklar ?? []).filter((b) => b.t === "m" || b.url);
  if (goruntulenebilir.length > 0) {
    return (
      <div className="space-y-2">
        <div className="space-y-3 rounded-xl border border-cizgi bg-kart2 p-3 text-sm leading-relaxed text-metin/90">
          {goruntulenebilir.map((b, i) =>
            b.t === "m" ? (
              <p key={i} className="whitespace-pre-wrap">
                {b.x}
              </p>
            ) : (
              <div key={i} className="rounded-lg bg-white p-1.5">
                <Gorsel
                  src={b.url!}
                  yol={b.yol}
                  alt={b.tur === "sekil" ? "Kitaptaki şekil" : "Kitaptaki tablo"}
                  loading="lazy"
                  width={b.w}
                  height={b.h}
                  className="mx-auto block h-auto"
                  style={{ width: `${Math.min(100, (b.w / SUTUN_GENISLIGI) * 100)}%` }}
                />
              </div>
            ),
          )}
        </div>
        {gorselVar && (
          <>
            <button
              type="button"
              className="text-xs text-silik hover:text-metin hover:underline"
              onClick={() => setIkinciAcik((a) => !a)}
            >
              {ikinciAcik ? "Kitaptaki hâlini gizle" : "Kitaptaki hâlini göster"}
            </button>
            {ikinciAcik && tamGorsel}
          </>
        )}
      </div>
    );
  }

  if (!gorselVar) return metinKutusu(metin);

  return (
    <div className="space-y-2">
      {tamGorsel}
      {metin && (
        <>
          <button
            type="button"
            className="text-xs text-silik hover:text-metin hover:underline"
            onClick={() => setIkinciAcik((a) => !a)}
          >
            {ikinciAcik ? "Metin hâlini gizle" : "Metin hâlini göster (kopyalamak için)"}
          </button>
          {ikinciAcik && metinKutusu(metin)}
        </>
      )}
    </div>
  );
}
