"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

export type CozumSorusu = {
  cevapId: string;
  soruId: string;
  sira: number;
  isaretlenen: string | null;
  sureSn: number;
  numara: number | null;
  metin: string;
  secenekler: Record<string, string>;
  ders: string | null;
  konu: string | null;
};

export default function CozumEkrani({
  denemeId,
  ad,
  sorular,
}: {
  denemeId: string;
  ad: string;
  sorular: CozumSorusu[];
}) {
  const router = useRouter();
  const [aktif, setAktif] = useState(0);
  const [cevaplar, setCevaplar] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(sorular.map((s) => [s.soruId, s.isaretlenen])),
  );
  const [bitiriliyor, setBitiriliyor] = useState(false);
  const [onay, setOnay] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [gecenSn, setGecenSn] = useState(0);
  const [sureler, setSureler] = useState<Record<string, number>>(() =>
    Object.fromEntries(sorular.map((s) => [s.soruId, s.sureSn])),
  );

  const soruBaslangici = useRef<number>(Date.now());
  const soru = sorular[aktif];

  // Toplam sure sayaci
  useEffect(() => {
    const t = setInterval(() => setGecenSn((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    soruBaslangici.current = Date.now();
  }, [aktif]);

  // Klavye kısayolları: A-E şık seçer, ok tuşları gezinir
  useEffect(() => {
    function tus(e: KeyboardEvent) {
      const hedef = e.target as HTMLElement | null;
      if (hedef && ["INPUT", "TEXTAREA", "SELECT"].includes(hedef.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const harf = e.key.toUpperCase();
      if (["A", "B", "C", "D", "E"].includes(harf) && soru.secenekler[harf] !== undefined) {
        e.preventDefault();
        void isaretle(harf);
        return;
      }
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        setAktif((a) => Math.min(sorular.length - 1, a + 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setAktif((a) => Math.max(0, a - 1));
      }
    }
    window.addEventListener("keydown", tus);
    return () => window.removeEventListener("keydown", tus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktif, cevaplar, sureler]);

  const isaretli = useMemo(
    () => Object.values(cevaplar).filter(Boolean).length,
    [cevaplar],
  );

  async function isaretle(sik: string) {
    const yeni = cevaplar[soru.soruId] === sik ? null : sik;
    setCevaplar((c) => ({ ...c, [soru.soruId]: yeni }));

    // Soruda gecen sure birikerek kaydedilir (ayni soruya donulurse ustune eklenir)
    const gecen = Math.round((Date.now() - soruBaslangici.current) / 1000);
    const sureSn = (sureler[soru.soruId] ?? 0) + gecen;
    setSureler((x) => ({ ...x, [soru.soruId]: sureSn }));
    soruBaslangici.current = Date.now();
    try {
      await fetch("/api/cevap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ denemeId, soruId: soru.soruId, isaretlenen: yeni, sureSn }),
      });
    } catch {
      setHata("Cevap kaydedilemedi, bağlantını kontrol et.");
    }
  }

  async function bitir() {
    setBitiriliyor(true);
    setHata(null);
    try {
      const cevap = await fetch(`/api/deneme/${denemeId}/bitir`, { method: "POST" });
      const veri = await cevap.json();
      if (!cevap.ok) throw new Error(veri.hata || "Deneme bitirilemedi.");
      router.push(`/sonuc/${denemeId}`);
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Hata");
      setBitiriliyor(false);
    }
  }

  const siklar = Object.keys(soru.secenekler).sort();

  return (
    <div className="space-y-4">
      {/* Ust bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold">{ad}</h1>
          <p className="text-xs text-silik tabular-nums">
            {isaretli}/{sorular.length} işaretli · {Math.floor(gecenSn / 60)}:
            {String(gecenSn % 60).padStart(2, "0")}
          </p>
        </div>
        <button type="button" className="btn-ikincil" onClick={() => setOnay(true)}>
          Testi bitir
        </button>
      </div>

      {/* İlerleme */}
      <div className="h-1.5 w-full overflow-hidden rounded-[4px] bg-kart">
        <div
          className="h-full rounded-[4px] bg-vurgu transition-all"
          style={{ width: `${(isaretli / sorular.length) * 100}%` }}
        />
      </div>

      {/* Soru haritasi */}
      <div className="flex flex-wrap gap-1.5">
        {sorular.map((s, i) => {
          const d = cevaplar[s.soruId];
          return (
            <button
              key={s.soruId}
              type="button"
              onClick={() => setAktif(i)}
              aria-label={`${i + 1}. soru${d ? `, ${d} işaretli` : ""}`}
              className={`h-8 w-8 rounded-lg border text-xs font-semibold tabular-nums transition ${
                i === aktif
                  ? "border-vurgu bg-vurgu/20 text-vurgu"
                  : d
                    ? "border-cizgi bg-kart2 text-metin"
                    : "border-cizgi bg-kart text-silik"
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      {/* Soru */}
      <article className="kart">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-silik">
          <span className="rounded-md bg-kart2 px-2 py-1 font-semibold text-metin">
            {aktif + 1}. soru
          </span>
          {soru.numara && <span>PDF no: {soru.numara}</span>}
          {soru.ders && (
            <span className="rounded-md bg-kart2 px-2 py-1">
              {soru.ders}
              {soru.konu ? ` · ${soru.konu}` : ""}
            </span>
          )}
        </div>

        <p className="leading-relaxed whitespace-pre-wrap">{soru.metin}</p>

        <div className="mt-4 space-y-2">
          {siklar.map((harf) => {
            const secili = cevaplar[soru.soruId] === harf;
            return (
              <button
                key={harf}
                type="button"
                onClick={() => isaretle(harf)}
                className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${
                  secili
                    ? "border-vurgu bg-vurgu/10"
                    : "border-cizgi bg-kart2 hover:border-vurgu/50"
                }`}
              >
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-sm font-bold ${
                    secili ? "bg-vurgu text-[#06281c]" : "bg-kart text-silik"
                  }`}
                >
                  {harf}
                </span>
                <span className="whitespace-pre-wrap">{soru.secenekler[harf]}</span>
              </button>
            );
          })}
        </div>

        {hata && <p className="mt-3 text-sm text-kotu">{hata}</p>}
      </article>

      {/* Gezinme */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-ikincil flex-1"
          disabled={aktif === 0}
          onClick={() => setAktif((a) => Math.max(0, a - 1))}
        >
          &larr; Önceki
        </button>
        {aktif < sorular.length - 1 ? (
          <button
            type="button"
            className="btn-ana flex-1"
            onClick={() => setAktif((a) => Math.min(sorular.length - 1, a + 1))}
          >
            Sonraki &rarr;
          </button>
        ) : (
          <button type="button" className="btn-ana flex-1" onClick={() => setOnay(true)}>
            Testi bitir
          </button>
        )}
      </div>

      <p className="text-center text-xs text-silik">
        Doğru cevaplar test bitene kadar gösterilmez.
        <span className="hidden sm:inline">
          {" "}
          · Klavye: <kbd className="rounded bg-kart2 px-1">A-E</kbd> şık,{" "}
          <kbd className="rounded bg-kart2 px-1">←</kbd>{" "}
          <kbd className="rounded bg-kart2 px-1">→</kbd> gezinme
        </span>
      </p>

      {/* Onay */}
      {onay && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-black/60 p-4">
          <div className="kart w-full max-w-sm space-y-4">
            <h2 className="text-lg font-semibold">Testi bitir?</h2>
            <p className="ince">
              {sorular.length} sorudan {isaretli} tanesini işaretledin.{" "}
              {sorular.length - isaretli > 0 && `${sorular.length - isaretli} soru boş kalacak.`}{" "}
              Bitirdiğinde doğru cevaplar ve analiz gösterilir.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-ikincil flex-1"
                onClick={() => setOnay(false)}
                disabled={bitiriliyor}
              >
                Geri dön
              </button>
              <button
                type="button"
                className="btn-ana flex-1"
                onClick={bitir}
                disabled={bitiriliyor}
              >
                {bitiriliyor ? "Hesaplanıyor..." : "Bitir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
