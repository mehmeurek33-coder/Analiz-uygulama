"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import AciklamaKutusu, { type AciklamaBlogu } from "@/components/AciklamaKutusu";
import SoruKoku from "@/components/SoruKoku";

export type Sonuc = {
  dogru: boolean | null;
  dogruCevap: string | null;
  aciklama: string | null;
  /** Kitaptaki açıklamanın görüntüsü (imzalı bağlantı) */
  aciklamaGorsel?: string | null;
  /** Metin + şekil/tablo blokları */
  aciklamaBloklar?: AciklamaBlogu[] | null;
};

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
  /** Birden çok sorunun paylaştığı vaka metni (vaka soruları) */
  vakaMetni?: string | null;
  /** Kökteki şekil/grafi (imzalı bağlantı) */
  soruGorsel?: string | null;
  /** Soru bankası modunda, cevaplanmış soruların sonucu */
  sonuc: Sonuc | null;
  /** Soru bankası modunda önceden yüklenen anahtar (anında geri bildirim için) */
  anahtar?: {
    dogruCevap: string | null;
    aciklama: string | null;
    aciklamaGorsel?: string | null;
    aciklamaBloklar?: AciklamaBlogu[] | null;
  } | null;
  /** "Emin değilim" işareti: doğru olsa da tekrar listesine girer */
  eminDegil?: boolean;
  /** İşaretlemeden açıklamasına bakıldı: boş sayılır, kilitli, tekrar listesinde */
  aciklamaBakildi?: boolean;
};

/**
 * Sorular alt alta listelenir.
 * - anlik = false (deneme): şık işaretlenir/değiştirilir, sonuçlar test bitince.
 * - anlik = true (soru bankası): şıkka dokunulunca doğru/yanlış anında görünür;
 *   yanlışsa açıklama otomatik açılır, doğruysa kapalı kalır ama açılabilir.
 */
export default function CozumEkrani({
  denemeId,
  ad,
  anlik,
  sorular,
}: {
  denemeId: string;
  ad: string;
  anlik: boolean;
  sorular: CozumSorusu[];
}) {
  const router = useRouter();
  const [cevaplar, setCevaplar] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(sorular.map((s) => [s.soruId, s.isaretlenen])),
  );
  const [sonuclar, setSonuclar] = useState<Record<string, Sonuc>>(() =>
    Object.fromEntries(sorular.filter((s) => s.sonuc).map((s) => [s.soruId, s.sonuc as Sonuc])),
  );
  const [aciklamaAcik, setAciklamaAcik] = useState<Record<string, boolean>>({});
  const [eminDegil, setEminDegil] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(sorular.map((s) => [s.soruId, Boolean(s.eminDegil)])),
  );
  const [bakildi, setBakildi] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(sorular.map((s) => [s.soruId, Boolean(s.aciklamaBakildi)])),
  );
  const [bekleyen, setBekleyen] = useState<Record<string, boolean>>({});
  const [hatalar, setHatalar] = useState<Record<string, string>>({});
  const [bitiriliyor, setBitiriliyor] = useState(false);
  // Arka planda süren cevap kayıtları; "Bitir" önce bunların bitmesini bekler
  const kayitlar = useRef(new Set<Promise<unknown>>());
  const [onay, setOnay] = useState(false);
  const [genelHata, setGenelHata] = useState<string | null>(null);
  const [gecenSn, setGecenSn] = useState(0);
  const sonIslem = useRef<number>(Date.now());

  useEffect(() => {
    const t = setInterval(() => setGecenSn((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const isaretli = useMemo(() => Object.values(cevaplar).filter(Boolean).length, [cevaplar]);
  // Boş bırakılıp geçilen (son cevaplanan sorudan önceki işaretsiz) sorular
  const atlanan = useMemo(() => {
    let son = -1;
    sorular.forEach((s, i) => {
      if (cevaplar[s.soruId] || bakildi[s.soruId]) son = i;
    });
    return sorular.filter((s, i) => i < son && !cevaplar[s.soruId] && !bakildi[s.soruId]).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cevaplar, bakildi]);
  const dogruSayisi = Object.values(sonuclar).filter((s) => s.dogru === true).length;
  const yanlisSayisi = Object.values(sonuclar).filter((s) => s.dogru === false).length;

  // İlk cevaplanmamış soruya kaydır (yarım bırakılan bölüme dönünce)
  useEffect(() => {
    const ilk = sorular.find((s) => !s.isaretlenen && !s.aciklamaBakildi);
    if (ilk && sorular.some((s) => s.isaretlenen || s.aciklamaBakildi)) {
      document.getElementById(`soru-${ilk.soruId}`)?.scrollIntoView({ block: "start" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function sureAl() {
    const sn = Math.round((Date.now() - sonIslem.current) / 1000);
    sonIslem.current = Date.now();
    return Math.min(sn, 600);
  }

  async function eminDegilDegistir(soruId: string) {
    const yeni = !eminDegil[soruId];
    setEminDegil((e) => ({ ...e, [soruId]: yeni }));
    const istek = fetch("/api/emin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ denemeId, soruId, eminDegil: yeni }),
    });
    kayitlar.current.add(istek);
    istek.finally(() => kayitlar.current.delete(istek)).catch(() => {});
    try {
      const cevap = await istek;
      if (!cevap.ok) throw new Error();
    } catch {
      setEminDegil((e) => ({ ...e, [soruId]: !yeni }));
      setHatalar((h) => ({ ...h, [soruId]: "İşaret kaydedilemedi, tekrar dene." }));
    }
  }

  /** İşaretlemeden açıklamayı aç: soru boş kalır ve kilitlenir (tekrar listesine girer). */
  async function bosBirakGor(soru: CozumSorusu) {
    const id = soru.soruId;
    if (!soru.anahtar || cevaplar[id] || bakildi[id]) return;
    setBakildi((b) => ({ ...b, [id]: true }));
    setSonuclar((s) => ({
      ...s,
      [id]: {
        dogru: null,
        dogruCevap: soru.anahtar!.dogruCevap,
        aciklama: soru.anahtar!.aciklama,
        aciklamaGorsel: soru.anahtar!.aciklamaGorsel,
        aciklamaBloklar: soru.anahtar!.aciklamaBloklar,
      },
    }));
    setAciklamaAcik((a) => ({ ...a, [id]: true }));
    const istek = fetch("/api/aciklama-bak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ denemeId, soruId: id }),
    });
    kayitlar.current.add(istek);
    istek.finally(() => kayitlar.current.delete(istek)).catch(() => {});
    try {
      const cevap = await istek;
      if (!cevap.ok) throw new Error();
    } catch {
      setBakildi((b) => ({ ...b, [id]: false }));
      setSonuclar((s) => {
        const k = { ...s };
        delete k[id];
        return k;
      });
      setHatalar((h) => ({ ...h, [id]: "Kaydedilemedi, tekrar dene." }));
    }
  }

  /**
   * Açıklamayı aç/kapat. Alttaki "gizle" ile kapatınca ekran kaymasın: "göster" düğmesi tam olarak
   * "gizle" düğmesinin durduğu yerde kalır, altındaki soru yerinden oynamaz (animasyonsuz, tek adım).
   */
  function aciklamaDegistir(soruId: string, simdi: boolean, alttan = false) {
    const kutu = document.getElementById(`aciklama-${soruId}`);
    const once = simdi && alttan && kutu ? kutu.getBoundingClientRect().bottom : null;
    flushSync(() => setAciklamaAcik((a) => ({ ...a, [soruId]: !simdi })));
    if (once !== null && kutu) {
      const fark = kutu.getBoundingClientRect().bottom - once;
      if (fark) window.scrollTo({ top: window.scrollY + fark, behavior: "instant" });
    }
  }

  async function isaretle(soru: CozumSorusu, harf: string) {
    const id = soru.soruId;
    if (bekleyen[id]) return;
    if (anlik && (cevaplar[id] || bakildi[id])) return; // soru bankası modunda cevap kilitli

    const yeni = !anlik && cevaplar[id] === harf ? null : harf;
    setCevaplar((c) => ({ ...c, [id]: yeni }));

    // Anında geri bildirim: anahtar önceden yüklüyse sunucuyu beklemeden göster
    const onceden = anlik && soru.anahtar ? soru.anahtar : null;
    if (onceden) {
      const dogru = onceden.dogruCevap ? harf === onceden.dogruCevap : null;
      setSonuclar((s) => ({
        ...s,
        [id]: {
          dogru,
          dogruCevap: onceden.dogruCevap,
          aciklama: onceden.aciklama,
          aciklamaGorsel: onceden.aciklamaGorsel,
          aciklamaBloklar: onceden.aciklamaBloklar,
        },
      }));
      setAciklamaAcik((a) => ({ ...a, [id]: dogru === false }));
    }
    setHatalar((h) => {
      const k = { ...h };
      delete k[id];
      return k;
    });
    setBekleyen((b) => ({ ...b, [id]: true }));

    try {
      const istek = fetch("/api/cevap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ denemeId, soruId: id, isaretlenen: yeni, sureSn: sureAl() }),
      });
      kayitlar.current.add(istek);
      istek.finally(() => kayitlar.current.delete(istek)).catch(() => {});
      const cevap = await istek;
      const veri = await cevap.json().catch(() => null);
      if (!veri) throw new Error("Oturum süresi dolmuş olabilir, sayfayı yenileyip tekrar dene.");
      if (!cevap.ok) throw new Error(veri.hata || "Cevap kaydedilemedi.");

      if (anlik && !onceden) {
        setCevaplar((c) => ({ ...c, [id]: veri.isaretlenen }));
        setSonuclar((s) => ({
          ...s,
          [id]: { dogru: veri.dogru, dogruCevap: veri.dogruCevap, aciklama: veri.aciklama },
        }));
        // Yanlışsa açıklama otomatik açılır, doğruysa kapalı kalır
        setAciklamaAcik((a) => ({ ...a, [id]: veri.dogru === false }));
      }
    } catch (e) {
      if (anlik) {
        // Kayıt başarısızsa geri al ki tekrar denenebilsin
        setCevaplar((c) => ({ ...c, [id]: null }));
        setSonuclar((s) => {
          const k = { ...s };
          delete k[id];
          return k;
        });
      }
      setHatalar((h) => ({ ...h, [id]: e instanceof Error ? e.message : "Hata" }));
    } finally {
      setBekleyen((b) => ({ ...b, [id]: false }));
    }
  }

  async function bitir() {
    setBitiriliyor(true);
    setGenelHata(null);
    try {
      await Promise.allSettled([...kayitlar.current]);
      const cevap = await fetch(`/api/deneme/${denemeId}/bitir`, { method: "POST" });
      const veri = await cevap.json();
      if (!cevap.ok) throw new Error(veri.hata || "Bitirilemedi.");
      // Hiç soru çözülmeden bitirilen soru bankası turu kaydedilmez
      if (veri.silindi) router.push("/");
      else router.push(`/sonuc/${denemeId}`);
    } catch (e) {
      setGenelHata(e instanceof Error ? e.message : "Hata");
      setBitiriliyor(false);
    }
  }

  function git(soruId: string) {
    document.getElementById(`soru-${soruId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-4">
      {/* Üst bar (yapışkan) */}
      <div className="sticky top-[57px] z-10 -mx-3 border-b border-cizgi bg-zemin/95 px-3 py-2.5 backdrop-blur sm:-mx-5 sm:px-5">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold">{ad}</h1>
            <p className="text-xs text-silik tabular-nums">
              {isaretli}/{sorular.length} cevaplandı
              {anlik && isaretli > 0 && (
                <>
                  {" · "}
                  <span className="text-iyi">✓ {dogruSayisi}</span>{" "}
                  <span className="text-zayif">✗ {yanlisSayisi}</span>
                </>
              )}
              {" · "}
              {Math.floor(gecenSn / 60)}:{String(gecenSn % 60).padStart(2, "0")}
            </p>
          </div>
          <button type="button" className="btn-ikincil px-3 py-1.5 text-xs" onClick={() => setOnay(true)}>
            Bitir
          </button>
        </div>
        <div className="mt-2 h-1 w-full overflow-hidden rounded-[4px] bg-kart">
          <div
            className="h-full rounded-[4px] bg-vurgu transition-all"
            style={{ width: `${(isaretli / sorular.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Soru haritası */}
      <details className="kart py-3" open={sorular.length <= 30}>
        <summary className="cursor-pointer text-sm text-silik">Soru haritası</summary>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {sorular.map((s, i) => {
            const c = cevaplar[s.soruId];
            const r = sonuclar[s.soruId];
            const sinif = bakildi[s.soruId]
              ? "border-orta/60 bg-orta/10 text-orta"
              : r
              ? r.dogru === true
                ? "border-iyi/60 bg-iyi/15 text-iyi"
                : r.dogru === false
                  ? "border-zayif/60 bg-zayif/15 text-zayif"
                  : "border-cizgi bg-kart2 text-metin"
              : c
                ? "border-cizgi bg-kart2 text-metin"
                : "border-cizgi bg-kart text-silik";
            return (
              <button
                key={s.soruId}
                type="button"
                onClick={() => git(s.soruId)}
                aria-label={`${i + 1}. soru${r ? (r.dogru ? ", doğru" : r.dogru === false ? ", yanlış" : "") : c ? ", cevaplandı" : ""}`}
                className={`h-8 min-w-8 rounded-lg border px-1 text-xs font-semibold tabular-nums ${sinif} ${eminDegil[s.soruId] ? "ring-2 ring-orta" : ""}`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </details>

      {/* Sorular alt alta */}
      {sorular.map((soru, i) => {
        const secili = cevaplar[soru.soruId];
        const r = sonuclar[soru.soruId];
        const harfler = Object.keys(soru.secenekler).sort();
        const acik = aciklamaAcik[soru.soruId] ?? (r?.dogru === false);

        return (
          <article key={soru.soruId} id={`soru-${soru.soruId}`} className="kart scroll-mt-32">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-silik">
              <span className="rounded-md bg-kart2 px-2 py-1 font-semibold text-metin">{i + 1}. soru</span>
              {soru.konu && <span className="rounded-md bg-kart2 px-2 py-1">{soru.konu}</span>}
              {r && bakildi[soru.soruId] ? (
                <span className="font-semibold text-orta">Boş · açıklamaya bakıldı</span>
              ) : (
                r && (
                  <span className={`font-semibold ${r.dogru ? "text-iyi" : r.dogru === false ? "text-zayif" : "text-silik"}`}>
                    {r.dogru ? "✓ Doğru" : r.dogru === false ? "✗ Yanlış" : "Cevap anahtarı yok"}
                  </span>
                )
              )}
              <button
                type="button"
                onClick={() => eminDegilDegistir(soru.soruId)}
                aria-pressed={Boolean(eminDegil[soru.soruId])}
                title="Doğru yapsan da tekrar listene girer"
                className={`ml-auto rounded-md border px-2 py-1 font-medium transition ${
                  eminDegil[soru.soruId]
                    ? "border-orta/70 bg-orta/15 text-orta"
                    : "border-cizgi text-silik hover:border-orta/50 hover:text-metin"
                }`}
              >
                {eminDegil[soru.soruId] ? "? Emin değilim ✓" : "? Emin değilim"}
              </button>
            </div>

            <SoruKoku
              metin={soru.metin}
              vakaMetni={soru.vakaMetni}
              soruGorsel={soru.soruGorsel}
              vakaTekrar={Boolean(soru.vakaMetni) && sorular[i - 1]?.vakaMetni === soru.vakaMetni}
            />

            <div className="mt-4 space-y-2">
              {harfler.map((harf) => {
                const benim = secili === harf;
                const dogruSik = r?.dogruCevap === harf;
                let sinif = "border-cizgi bg-kart2 hover:border-vurgu/50";
                let rozet = "bg-kart text-silik";
                if (r) {
                  if (dogruSik) {
                    sinif = "border-iyi/70 bg-iyi/10";
                    rozet = "bg-iyi text-white";
                  } else if (benim) {
                    sinif = "border-zayif/70 bg-zayif/10";
                    rozet = "bg-zayif text-white";
                  } else {
                    sinif = "border-cizgi bg-kart2 opacity-70";
                  }
                } else if (benim) {
                  sinif = "border-vurgu bg-vurgu/10";
                  rozet = "bg-vurgu text-[#06281c]";
                }
                return (
                  <button
                    key={harf}
                    type="button"
                    disabled={Boolean(r) || (!anlik && bekleyen[soru.soruId])}
                    onClick={() => isaretle(soru, harf)}
                    className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition disabled:cursor-default ${sinif}`}
                  >
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-sm font-bold ${rozet}`}>
                      {harf}
                    </span>
                    <span className="flex-1 whitespace-pre-wrap">{soru.secenekler[harf]}</span>
                    {r && dogruSik && <span className="shrink-0 text-xs font-semibold text-iyi">doğru cevap</span>}
                    {r && benim && !dogruSik && <span className="shrink-0 text-xs font-semibold text-zayif">senin cevabın</span>}
                  </button>
                );
              })}
            </div>

            {hatalar[soru.soruId] && <p className="mt-3 text-sm text-kotu">{hatalar[soru.soruId]}</p>}

            {/* İşaretlenmemiş soru: boş bırakıp açıklamayı görme (yalnızca soru bankası modunda) */}
            {!r && anlik && soru.anahtar && !secili && (
              <div className="mt-3">
                <button
                  type="button"
                  className="text-sm text-silik hover:text-metin hover:underline"
                  onClick={() => bosBirakGor(soru)}
                >
                  Boş bırak, cevabı ve açıklamayı gör
                </button>
              </div>
            )}

            {r && (
              <div className="mt-3" id={`aciklama-${soru.soruId}`} style={{ overflowAnchor: "none" }}>
                {acik ? (
                  <>
                    <AciklamaKutusu metin={r.aciklama} gorsel={r.aciklamaGorsel} bloklar={r.aciklamaBloklar} />
                    {/* Gizle düğmesi açıklamanın altında: okuyup bitirince hemen kapatılsın */}
                    <button
                      type="button"
                      className="btn-ikincil mt-2 w-full py-2 text-sm"
                      onClick={() => aciklamaDegistir(soru.soruId, true, true)}
                    >
                      Açıklamayı gizle ▲
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="text-sm text-vurgu hover:underline"
                    onClick={() => aciklamaDegistir(soru.soruId, false)}
                  >
                    Açıklamayı göster ▼
                  </button>
                )}
              </div>
            )}
          </article>
        );
      })}

      <div className="pb-6">
        <button type="button" className="btn-ana w-full" onClick={() => setOnay(true)}>
          {anlik ? "Bölümü bitir" : "Testi bitir"}
        </button>
        <p className="mt-2 text-center text-xs text-silik">
          {anlik
            ? "Soru bankası modu: cevaplar anında kontrol edilir. Bitirmeden çıkarsan kaldığın yerden devam edersin."
            : "Deneme modu: doğru cevaplar test bitene kadar gösterilmez."}
        </p>
      </div>

      {onay && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-black/60 p-4">
          <div className="kart w-full max-w-sm space-y-4">
            <h2 className="text-lg font-semibold">{anlik ? "Bölümü bitir?" : "Testi bitir?"}</h2>
            <p className="ince">
              {sorular.length} sorudan {isaretli} tanesini cevapladın.{" "}
              {anlik
                ? isaretli === 0 && !Object.values(bakildi).some(Boolean)
                  ? "Hiç soru çözmedin: bu tur kaydedilmeden kapanacak."
                  : `${atlanan > 0 ? `Atladığın ${atlanan} soru boş sayılıp tekrar listene (Yanlışlarım) girecek. ` : ""}Hiç ulaşmadığın sorular istatistiğe girmez. Bitirmeden çıkarsan kaldığın yerden devam edersin.`
                : `${sorular.length - isaretli > 0 ? `${sorular.length - isaretli} soru boş sayılıp tekrar listene girecek. ` : ""}Bitirdiğinde doğru cevaplar ve analiz gösterilir.`}
            </p>
            {genelHata && <p className="text-sm text-kotu">{genelHata}</p>}
            <div className="flex gap-2">
              <button type="button" className="btn-ikincil flex-1" onClick={() => setOnay(false)} disabled={bitiriliyor}>
                Geri dön
              </button>
              <button type="button" className="btn-ana flex-1" onClick={bitir} disabled={bitiriliyor}>
                {bitiriliyor ? "Hesaplanıyor..." : "Bitir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
