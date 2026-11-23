"use client";

import { useEffect, useRef, useState } from "react";
import { gorselleriIndir, tablettekiGorseller, tablettemi } from "@/lib/cevrimdisi";
import { sablonHaritasi } from "@/lib/gorselYardim";
import { gorselSablonuAl, veriIstemcisi } from "@/lib/veriIstemci";

type Grup = { anahtar: string; ders: string; kaynak: string; soru: number; urller: string[]; tablette: number };

function mb(b: number) {
  return b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${Math.round(b / 1e6)} MB`;
}
// Ortalama görüntü boyutu (kitap görünümü: 11.000 dosya ≈ 770 MB)
const ORT_BAYT = 70_000;

/**
 * Bütün kitapların görüntülerini (soru + kitaptaki açıklama) tablete indirir: sorular internetsiz ve hızlı açılır.
 * Görüntü listesi tarayıcıda doğrudan Supabase'den (Vercel'den geçmez), görüntüler Worker → B2.
 */
export default function TableteIndir() {
  const [gruplar, setGruplar] = useState<Grup[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [alan, setAlan] = useState<{ kullanilan: number; kota: number } | null>(null);
  const [is, setIs] = useState<{ ad: string; biten: number; toplam: number; bayt: number; hatali?: number; bitti?: boolean; sinir?: boolean } | null>(null);
  const iptal = useRef({ dur: false });

  async function alanOlc() {
    try {
      const t = await navigator.storage?.estimate?.();
      if (t) setAlan({ kullanilan: t.usage ?? 0, kota: t.quota ?? 0 });
    } catch {
      /* */
    }
  }

  async function yukle() {
    try {
      const sb = veriIstemcisi();
      const satirlar: { soru_kitap_gorsel: string | null; soru_gorsel: string | null; aciklama_kitap: { yol?: string }[] | null; aciklama_bloklar: { t?: string; yol?: string }[] | null; soru_setleri: { ders: string | null; kaynak: string | null } | null }[] = [];
      for (let bas = 0; ; bas += 1000) {
        const { data, error } = await sb
          .from("sorular")
          .select("id, soru_kitap_gorsel, soru_gorsel, aciklama_kitap, aciklama_bloklar, soru_setleri(ders, kaynak)")
          .order("id")
          .range(bas, bas + 999);
        if (error) throw new Error(error.message);
        satirlar.push(...((data ?? []) as unknown as typeof satirlar));
        if (!data || data.length < 1000) break;
      }
      const yollar = new Map<string, { ders: string; kaynak: string; soru: number; yollar: string[] }>();
      for (const s of satirlar) {
        const ders = s.soru_setleri?.ders ?? "Diğer";
        const kaynak = s.soru_setleri?.kaynak ?? "Diğer";
        const k = `${ders} · ${kaynak}`;
        if (!yollar.has(k)) yollar.set(k, { ders, kaynak, soru: 0, yollar: [] });
        const g = yollar.get(k)!;
        g.soru++;
        if (s.soru_kitap_gorsel) g.yollar.push(s.soru_kitap_gorsel);
        if (s.soru_gorsel) g.yollar.push(s.soru_gorsel);
        if (s.aciklama_kitap?.length) for (const p of s.aciklama_kitap) p.yol && g.yollar.push(p.yol);
        else for (const b of s.aciklama_bloklar ?? []) if (b.t === "g" && b.yol) g.yollar.push(b.yol);
      }
      const sablon = await gorselSablonuAl();
      if (!sablon) throw new Error("görsel adresi alınamadı (oturum?)");
      const kayitli = await tablettekiGorseller();
      const liste: Grup[] = [...yollar.entries()]
        .map(([anahtar, g]) => {
          const urller = [...sablonHaritasi(g.yollar, sablon).values()];
          return { anahtar, ders: g.ders, kaynak: g.kaynak, soru: g.soru, urller, tablette: urller.filter((u) => tablettemi(u, kayitli)).length };
        })
        .sort((a, b) => a.ders.localeCompare(b.ders, "tr") || a.kaynak.localeCompare(b.kaynak, "tr"));
      setGruplar(liste);
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Liste alınamadı");
    }
    void alanOlc();
  }

  useEffect(() => {
    void yukle();
  }, []);

  async function indir(ad: string, urller: string[]) {
    iptal.current = { dur: false };
    setIs({ ad, biten: 0, toplam: 0, bayt: 0 });
    const s = await gorselleriIndir(urller, (biten, toplam, bayt) => setIs({ ad, biten, toplam, bayt }), iptal.current);
    setIs({ ad, biten: s.biten, toplam: s.toplam, bayt: s.bayt, hatali: s.hatali, bitti: true, sinir: s.sinir });
    await yukle();
  }

  const calisiyor = Boolean(is && !is.bitti);
  const hepsi = gruplar?.flatMap((g) => g.urller) ?? [];
  const eksik = gruplar ? gruplar.reduce((t, g) => t + g.urller.length - g.tablette, 0) : 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Tablete indir</h1>
        <p className="mt-1 text-sm text-silik">
          Soruların ve açıklamaların kitap görüntüleri tablete kaydedilir: bölümler hızlı açılır, internet olmadan da görüntüler
          gelir. Yarıda kalırsa tekrar bas, inenler atlanır. İndirme sırasında bu sayfa açık kalsın.
        </p>
      </div>

      {alan && (
        <p className="text-xs text-silik tabular-nums">
          Tablette kullanılan: {mb(alan.kullanilan)}
          {alan.kota > 0 && <> · izin verilen: {mb(alan.kota)}</>}
        </p>
      )}

      {hata && <p className="kart text-kotu">Liste alınamadı: {hata}. İnternet bağlantısını kontrol edip sayfayı yenile.</p>}
      {!gruplar && !hata && <p className="kart text-silik">Görüntü listesi hazırlanıyor…</p>}

      {is && (
        <div className="kart space-y-2">
          <p className="text-sm font-semibold">{is.ad}</p>
          {is.bitti ? (
            <p className="text-sm">
              {is.sinir ? (
                <>
                  Görüntü deposunun (Backblaze) günlük ücretsiz indirme sınırı doldu. İnenler tablette; kalanlar için yarın
                  tekrar bas. Sınırı{" "}
                  <a className="underline" href="https://secure.backblaze.com/b2_caps_alerts.htm" target="_blank" rel="noreferrer">
                    buradan
                  </a>{" "}
                  görebilirsin.
                </>
              ) : is.toplam === 0
                ? "Hepsi zaten tablette."
                : is.hatali || is.biten < is.toplam
                  ? `${is.biten - (is.hatali ?? 0)}/${is.toplam} görüntü indi (${mb(is.bayt)}). Tekrar bas, kalanlar iner.`
                  : `✓ ${is.toplam} görüntü indi (${mb(is.bayt)}).`}
            </p>
          ) : (
            <>
              <div className="h-2 w-full overflow-hidden rounded bg-kart2">
                <div className="h-full bg-vurgu transition-all" style={{ width: `${is.toplam ? (is.biten / is.toplam) * 100 : 0}%` }} />
              </div>
              <p className="text-xs text-silik tabular-nums">
                {is.biten}/{is.toplam} · {mb(is.bayt)}
              </p>
              <button type="button" className="btn-ikincil px-3 py-1.5 text-xs" onClick={() => (iptal.current.dur = true)}>
                Durdur
              </button>
            </>
          )}
        </div>
      )}

      {gruplar && (
        <>
          <div className="kart flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Bütün kitaplar</p>
              <p className="text-xs text-silik tabular-nums">
                {hepsi.length - eksik}/{hepsi.length} görüntü tablette
                {eksik > 0 && <> · kalan ≈ {mb(eksik * ORT_BAYT)}</>}
              </p>
            </div>
            <button type="button" className="btn-ana px-4 py-2 text-sm" disabled={calisiyor || eksik === 0} onClick={() => indir("Bütün kitaplar", hepsi)}>
              {eksik === 0 ? "✓ Hepsi tablette" : "Hepsini indir"}
            </button>
          </div>

          <div className="space-y-2">
            {gruplar.map((g) => {
              const kalan = g.urller.length - g.tablette;
              return (
                <div key={g.anahtar} className="kart flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {g.ders} <span className="font-normal text-silik">· {g.kaynak}</span>
                    </p>
                    <p className="text-xs text-silik tabular-nums">
                      {g.soru} soru · {g.tablette}/{g.urller.length} görüntü tablette
                      {kalan > 0 && <> · kalan ≈ {mb(kalan * ORT_BAYT)}</>}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-ikincil px-3 py-1.5 text-xs"
                    disabled={calisiyor || kalan === 0}
                    onClick={() => indir(`${g.ders} · ${g.kaynak}`, g.urller)}
                  >
                    {kalan === 0 ? "✓ Tablette" : "İndir"}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      <p className="text-xs text-silik">
        iPad&apos;de siteyi Safari&apos;de Paylaş → <b>Ana Ekrana Ekle</b> ile ekleyip oradan aç; yoksa Safari uzun süre açılmayan
        sitelerin kayıtlı verisini silebilir. Bir bölümü internetsiz çözmek için o bölümü internet varken bir kez açmış olman yeter.
      </p>
    </div>
  );
}
