"use client";

import { useState } from "react";

/**
 * Kitap açıklaması. Sayfadan kesilmiş görüntü varsa önce o gösterilir (tablo ve şekiller
 * olduğu gibi, OCR hatası yok); metin hâli isteğe bağlı açılır. Görüntü yoksa metin.
 */
export default function AciklamaKutusu({ metin, gorsel }: { metin: string | null; gorsel?: string | null }) {
  const [metinAcik, setMetinAcik] = useState(false);
  const [gorselHata, setGorselHata] = useState(false);
  const gorselVar = Boolean(gorsel) && !gorselHata;

  if (!gorselVar) {
    return (
      <div className="rounded-xl border border-cizgi bg-kart2 p-3 text-sm leading-relaxed whitespace-pre-wrap text-metin/90">
        {metin || "Bu soru için kitapta açıklama bulunamadı."}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Kitap sayfası beyaz zeminli; koyu temada da okunur kalsın diye beyaz çerçevede */}
      <div className="overflow-hidden rounded-xl border border-cizgi bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={gorsel!}
          alt="Kitaptaki açıklama"
          loading="lazy"
          className="block h-auto w-full"
          onError={() => setGorselHata(true)}
        />
      </div>
      {metin && (
        <>
          <button type="button" className="text-xs text-silik hover:text-metin hover:underline" onClick={() => setMetinAcik((a) => !a)}>
            {metinAcik ? "Metin hâlini gizle" : "Metin hâlini göster (kopyalamak için)"}
          </button>
          {metinAcik && (
            <div className="rounded-xl border border-cizgi bg-kart2 p-3 text-sm leading-relaxed whitespace-pre-wrap text-metin/90">
              {metin}
            </div>
          )}
        </>
      )}
    </div>
  );
}
