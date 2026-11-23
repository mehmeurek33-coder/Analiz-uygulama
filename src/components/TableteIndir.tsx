"use client";

import { useEffect, useRef, useState } from "react";
import { GUNLUK_PAY, gorselleriIndir, kalanPay } from "@/lib/cevrimdisi";
import { type Grup, arkaPlanDestekli, arkaPlanDurumu, arkaPlandaIndir, gorselGruplari, otoIndirAcik, otoIndirAyarla, otoIptal } from "@/lib/gorselListesi";

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
  const [is, setIs] = useState<{ ad: string; biten: number; toplam: number; bayt: number; hatali?: number; bitti?: boolean; sinir?: boolean; yarina?: number } | null>(null);
  const [payKalan, setPayKalan] = useState<number | null>(null);
  useEffect(() => setPayKalan(kalanPay()), []);
  const iptal = useRef({ dur: false });
  const [oto, setOto] = useState(false);
  useEffect(() => setOto(otoIndirAcik()), []);
  // Tarayıcının arka plan indirmesi (Android Chrome): sekmeden çıkınca da sürer
  const [arka, setArka] = useState<boolean | null>(null);
  const [bg, setBg] = useState<{ adet: number; inen: number }>({ adet: 0, inen: 0 });
  const [bgHata, setBgHata] = useState<string | null>(null);
  useEffect(() => {
    void arkaPlanDestekli().then(setArka);
    let onceki = 0;
    const t = setInterval(async () => {
      const d = await arkaPlanDurumu();
      setBg(d);
      if (onceki > 0 && d.adet < onceki) void yukle(); // bir parça bitti: sayıları tazele
      onceki = d.adet;
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setGruplar(await gorselGruplari());
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Liste alınamadı");
    }
    void alanOlc();
  }

  useEffect(() => {
    void yukle();
  }, []);

  async function indir(ad: string, urller: string[], anahtar = ad) {
    if (arka) {
      setBgHata(null);
      try {
        otoIptal.dur = true;
        const n = await arkaPlandaIndir([{ anahtar, ad, urller }]);
        setPayKalan(kalanPay());
        if (n.dosya === 0 && n.yarina > 0) setBgHata("Bugünkü indirme payı doldu; kalanlar yarın.");
        else if (n.yarina > 0) setBgHata(`${n.dosya} görüntü bugün iniyor, ${n.yarina} tanesi yarın (günlük pay).`);
        setBg(await arkaPlanDurumu());
        return;
      } catch (e) {
        // Desteklenmedi ya da yer yetmedi: sayfa açıkken indirmeye düş
        setBgHata(`Arka planda başlatılamadı (${e instanceof Error ? e.message : "hata"}); sayfa açıkken indiriliyor.`);
      }
    }
    iptal.current = { dur: false };
    otoIptal.dur = true; // arka plandaki otomatik indirme dursun, ikisi aynı anda inmesin
    setIs({ ad, biten: 0, toplam: 0, bayt: 0 });
    const s = await gorselleriIndir(urller, (biten, toplam, bayt) => setIs({ ad, biten, toplam, bayt }), iptal.current, 6, true);
    setIs({ ad, biten: s.biten, toplam: s.toplam, bayt: s.bayt, hatali: s.hatali, bitti: true, sinir: s.sinir, yarina: s.kalanYarina });
    setPayKalan(kalanPay());
    await yukle();
  }

  async function hepsiniIndir() {
    if (arka && gruplar) {
      setBgHata(null);
      try {
        otoIptal.dur = true;
        const n = await arkaPlandaIndir(gruplar.map((g) => ({ anahtar: g.anahtar, ad: `${g.ders} · ${g.kaynak}`, urller: g.urller })));
        setPayKalan(kalanPay());
        if (n.dosya === 0 && n.yarina > 0) setBgHata("Bugünkü indirme payı doldu; kalanlar yarın.");
        else if (n.yarina > 0) setBgHata(`${n.dosya} görüntü bugün iniyor, ${n.yarina} tanesi yarın (günlük pay).`);
        setBg(await arkaPlanDurumu());
        return;
      } catch (e) {
        setBgHata(`Arka planda başlatılamadı (${e instanceof Error ? e.message : "hata"}); sayfa açıkken indiriliyor.`);
      }
    }
    iptal.current = { dur: false };
    otoIptal.dur = true;
    const ad = "Bütün kitaplar";
    setIs({ ad, biten: 0, toplam: 0, bayt: 0 });
    const s = await gorselleriIndir(hepsi, (biten, toplam, bayt) => setIs({ ad, biten, toplam, bayt }), iptal.current, 6, true);
    setIs({ ad, biten: s.biten, toplam: s.toplam, bayt: s.bayt, hatali: s.hatali, bitti: true, sinir: s.sinir, yarina: s.kalanYarina });
    setPayKalan(kalanPay());
    await yukle();
  }

  const calisiyor = Boolean(is && !is.bitti) || bg.adet > 0;
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

      <label className="kart flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={oto}
          onChange={(e) => {
            otoIndirAyarla(e.target.checked);
            setOto(e.target.checked);
          }}
        />
        <span className="text-sm">
          <b>Bu cihaza yeni görüntüleri kendiliğinden indir</b>
          <span className="mt-0.5 block text-xs text-silik">
            Yalnızca bu cihazda geçerli (telefonda kapalı bırak). Açıkken uygulama her açıldığında, 6 saatte bir, eksik ve yeni
            eklenen kitapların görüntülerini arka planda yavaşça indirir. Mobil veride (cihaz bildirirse) indirmez.
          </span>
        </span>
      </label>

      {payKalan !== null && (
        <p className="text-xs text-silik tabular-nums">
          Bugünkü indirme payı: {payKalan}/{GUNLUK_PAY} görüntü. Görüntü deposunun (Backblaze) ücretsiz planı günde 2.500 indirmeye
          izin veriyor (03:00&apos;te sıfırlanır); kalanı soru çözerken görüntülerin açılması için ayrılır. Hepsi birkaç günde iner;
          &quot;kendiliğinden indir&quot; açıksa her gün kendisi devam eder.
        </p>
      )}

      {hata && <p className="kart text-kotu">Liste alınamadı: {hata}. İnternet bağlantısını kontrol edip sayfayı yenile.</p>}
      {!gruplar && !hata && <p className="kart text-silik">Görüntü listesi hazırlanıyor…</p>}

      {arka === true && (
        <p className="text-xs text-iyi">
          Bu tarayıcı arka planda indirebiliyor: indirme başladıktan sonra sayfadan, sekmeden çıkabilirsin; ilerleme bildirimde görünür.
        </p>
      )}
      {arka === false && (
        <p className="text-xs text-orta">
          Bu tarayıcı (iPad/Safari gibi) arka planda indirmeye izin vermiyor: indirirken bu sayfa önde ve ekran açık kalsın. Yarıda
          kalırsa tekrar bas, kaldığı yerden sürer. &quot;Kendiliğinden indir&quot; açıksa uygulamayı her açışında da devam eder.
        </p>
      )}
      {bg.adet > 0 && (
        <div className="kart text-sm">
          <p className="font-semibold">Arka planda iniyor…</p>
          <p className="text-xs text-silik tabular-nums">
            {bg.adet} parça sürüyor · şu ana kadar {mb(bg.inen)}. Sayfadan çıkabilirsin; bitince görüntüler tablete yazılır.
          </p>
        </div>
      )}
      {bgHata && <p className="text-xs text-silik">{bgHata}</p>}

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
                ? is.yarina
                  ? `Bugünkü indirme payı doldu; kalan ${is.yarina} görüntü yarın (03:00'ten sonra) iner.`
                  : "Hepsi zaten tablette."
                : is.hatali || is.biten < is.toplam
                  ? `${is.biten - (is.hatali ?? 0)}/${is.toplam} görüntü indi (${mb(is.bayt)}). Tekrar bas, kalanlar iner.`
                  : `✓ ${is.toplam} görüntü indi (${mb(is.bayt)}).${is.yarina ? ` ${is.yarina} tanesi yarın (günlük pay).` : ""}`}
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
            <button type="button" className="btn-ana px-4 py-2 text-sm" disabled={calisiyor || eksik === 0} onClick={hepsiniIndir}>
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
                    onClick={() => indir(`${g.ders} · ${g.kaynak}`, g.urller, g.anahtar)}
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
