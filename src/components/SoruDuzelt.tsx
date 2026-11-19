"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MUFREDAT } from "@/lib/mufredat";
import { SIKLAR } from "@/lib/tipler";

/**
 * Claude bir soruyu yanlış derse/konuya koyduysa ya da cevap anahtarı eksikse
 * buradan düzeltilir. Anahtar değişirse geçmiş cevaplar yeniden puanlanır,
 * yani analiz kendini düzeltir.
 */
export default function SoruDuzelt({
  soruId,
  ders,
  konu,
  dogruCevap,
  secenekHarfleri,
}: {
  soruId: string;
  ders: string | null;
  konu: string | null;
  dogruCevap: string | null;
  secenekHarfleri: string[];
}) {
  const router = useRouter();
  const [acik, setAcik] = useState(false);
  const [yeniDers, setYeniDers] = useState(ders ?? "");
  const [yeniKonu, setYeniKonu] = useState(konu ?? "");
  const [yeniCevap, setYeniCevap] = useState(dogruCevap ?? "");
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState<string | null>(null);

  const konular = MUFREDAT.find((d) => d.ders === yeniDers)?.konular ?? [];
  const harfler = secenekHarfleri.length ? secenekHarfleri : [...SIKLAR];

  async function kaydet() {
    setBekle(true);
    setHata(null);
    try {
      const cevap = await fetch(`/api/soru/${soruId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ders: yeniDers || null,
          konu: yeniKonu || null,
          dogru_cevap: yeniCevap || null,
        }),
      });
      const veri = await cevap.json();
      if (!cevap.ok) throw new Error(veri.hata || "Kaydedilemedi.");
      setBilgi(
        veri.yenidenPuanlanan > 0
          ? `Kaydedildi, ${veri.yenidenPuanlanan} cevap yeniden puanlandı.`
          : "Kaydedildi.",
      );
      router.refresh();
      setTimeout(() => setAcik(false), 1200);
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Hata");
    } finally {
      setBekle(false);
    }
  }

  if (!acik) {
    return (
      <button
        type="button"
        onClick={() => setAcik(true)}
        className="text-xs text-silik underline-offset-2 hover:text-metin hover:underline"
      >
        Etiketi / anahtarı düzelt
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-cizgi bg-kart2 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="etiket" htmlFor={`ders-${soruId}`}>
            Ders
          </label>
          <select
            id={`ders-${soruId}`}
            className="giris-alani"
            value={yeniDers}
            onChange={(e) => {
              setYeniDers(e.target.value);
              setYeniKonu("");
            }}
          >
            <option value="">Seçilmedi</option>
            {MUFREDAT.map((d) => (
              <option key={d.ders} value={d.ders}>
                {d.ders}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="etiket" htmlFor={`konu-${soruId}`}>
            Konu
          </label>
          <select
            id={`konu-${soruId}`}
            className="giris-alani"
            value={yeniKonu}
            onChange={(e) => setYeniKonu(e.target.value)}
            disabled={!yeniDers}
          >
            <option value="">Seçilmedi</option>
            {konular.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <span className="etiket">Doğru cevap</span>
        <div className="flex flex-wrap gap-2">
          {harfler.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setYeniCevap(yeniCevap === h ? "" : h)}
              className={`h-9 w-9 rounded-lg border text-sm font-bold transition ${
                yeniCevap === h
                  ? "border-vurgu bg-vurgu/20 text-vurgu"
                  : "border-cizgi bg-kart text-silik hover:border-vurgu/50"
              }`}
            >
              {h}
            </button>
          ))}
        </div>
      </div>

      {hata && <p className="text-sm text-kotu">{hata}</p>}
      {bilgi && <p className="text-sm text-iyi">{bilgi}</p>}

      <div className="flex gap-2">
        <button type="button" className="btn-ikincil flex-1" onClick={() => setAcik(false)}>
          Vazgeç
        </button>
        <button type="button" className="btn-ana flex-1" onClick={kaydet} disabled={bekle}>
          {bekle ? "Kaydediliyor..." : "Kaydet"}
        </button>
      </div>
    </div>
  );
}
