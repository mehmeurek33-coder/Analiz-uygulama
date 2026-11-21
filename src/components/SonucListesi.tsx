"use client";

import { useState } from "react";
import AciklamaKutusu, { type AciklamaBlogu } from "@/components/AciklamaKutusu";
import SoruDuzelt from "@/components/SoruDuzelt";
import HataBildir from "@/components/HataBildir";
import SoruKoku from "@/components/SoruKoku";

export type SonucSatiri = {
  id: string;
  soruId: string;
  sira: number;
  isaretlenen: string | null;
  dogru: boolean | null;
  sureSn: number;
  numara: number | null;
  metin: string;
  vakaMetni?: string | null;
  soruGorsel?: string | null;
  secenekler: Record<string, string>;
  dogruCevap: string | null;
  aciklama: string | null;
  aciklamaGorsel?: string | null;
  aciklamaBloklar?: AciklamaBlogu[] | null;
  ders: string | null;
  konu: string | null;
  altKonu: string | null;
};

type Suzgec = "hepsi" | "yanlis" | "bos" | "dogru";

export default function SonucListesi({ satirlar }: { satirlar: SonucSatiri[] }) {
  const [suzgec, setSuzgec] = useState<Suzgec>("yanlis");

  const sayilar = {
    hepsi: satirlar.length,
    dogru: satirlar.filter((s) => s.dogru === true).length,
    yanlis: satirlar.filter((s) => s.dogru === false && s.isaretlenen).length,
    bos: satirlar.filter((s) => !s.isaretlenen).length,
  };

  const gosterilen = satirlar.filter((s) => {
    if (suzgec === "hepsi") return true;
    if (suzgec === "dogru") return s.dogru === true;
    if (suzgec === "yanlis") return s.dogru === false && s.isaretlenen;
    return !s.isaretlenen;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(["yanlis", "bos", "dogru", "hepsi"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSuzgec(s)}
            className={`rounded-xl border px-3 py-1.5 text-sm transition ${
              suzgec === s ? "border-vurgu bg-vurgu/15 text-vurgu" : "border-cizgi bg-kart text-silik"
            }`}
          >
            {s === "yanlis" ? "Yanlışlar" : s === "bos" ? "Boşlar" : s === "dogru" ? "Doğrular" : "Hepsi"}{" "}
            ({sayilar[s]})
          </button>
        ))}
      </div>

      {gosterilen.length === 0 ? (
        <p className="ince">Bu filtrede soru yok.</p>
      ) : (
        <ul className="space-y-3">
          {gosterilen.map((s) => (
            <li key={s.id} className="kart">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-md bg-kart2 px-2 py-1 font-semibold">{s.sira + 1}. soru</span>
                {s.ders && (
                  <span className="rounded-md bg-kart2 px-2 py-1 text-silik">
                    {s.ders}
                    {s.konu ? ` · ${s.konu}` : ""}
                    {s.altKonu ? ` · ${s.altKonu}` : ""}
                  </span>
                )}
                <span
                  className={
                    s.dogru === true
                      ? "text-iyi"
                      : s.dogru === false
                        ? "text-zayif"
                        : "text-silik"
                  }
                >
                  {s.dogru === true
                    ? "● doğru"
                    : s.dogru === false
                      ? "■ yanlış"
                      : s.isaretlenen
                        ? "anahtar yok"
                        : "boş"}
                </span>
                {s.sureSn > 0 && <span className="text-silik">{s.sureSn} sn</span>}
              </div>

              <SoruKoku metin={s.metin} vakaMetni={s.vakaMetni} soruGorsel={s.soruGorsel} />

              <ul className="mt-3 space-y-1.5">
                {Object.keys(s.secenekler)
                  .sort()
                  .map((harf) => {
                    const dogruSik = s.dogruCevap === harf;
                    const benimSik = s.isaretlenen === harf;
                    return (
                      <li
                        key={harf}
                        className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                          dogruSik
                            ? "border-iyi/60 bg-iyi/10"
                            : benimSik
                              ? "border-zayif/60 bg-zayif/10"
                              : "border-cizgi"
                        }`}
                      >
                        <span className="font-bold">{harf}</span>
                        <span className="flex-1 whitespace-pre-wrap">{s.secenekler[harf]}</span>
                        {dogruSik && <span className="shrink-0 text-xs text-iyi">doğru cevap</span>}
                        {benimSik && !dogruSik && (
                          <span className="shrink-0 text-xs text-zayif">senin cevabın</span>
                        )}
                      </li>
                    );
                  })}
              </ul>

              <div className="mt-3">
                <SoruDuzelt
                  soruId={s.soruId}
                  ders={s.ders}
                  konu={s.konu}
                  dogruCevap={s.dogruCevap}
                  secenekHarfleri={Object.keys(s.secenekler).sort()}
                />
              </div>

              {(s.aciklama || s.aciklamaGorsel || s.aciklamaBloklar?.length) && (
                <div className="mt-3">
                  <AciklamaKutusu metin={s.aciklama} gorsel={s.aciklamaGorsel} bloklar={s.aciklamaBloklar} />
                </div>
              )}

              <HataBildir soruId={s.soruId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
