"use client";

import { useEffect, useState } from "react";
import CozumEkrani, { type CozumSorusu } from "@/components/CozumEkrani";
import { bekleyenSayisi, bolumOku, bolumSakla, izSil, izUygula, kuyruguBosalt } from "@/lib/cevrimdisi";
import { denemeSorulari } from "@/lib/denemeVeri";
import { sablonHaritasi } from "@/lib/gorselYardim";
import { gorselSablonuAl, veriIstemcisi } from "@/lib/veriIstemci";

const BEKLE_MS = 10000;

/**
 * Çözüm ekranı: sorular tarayıcıda doğrudan Supabase'den (Vercel'den geçmez, HATALAR E10). Her açılışta tablete
 * de kaydedilir; internet yoksa (ya da yanıt gecikirse) bölüm tabletteki kopyadan açılır (src/lib/cevrimdisi.ts).
 */
export default function CozumYukleyici({ denemeId, ad, anlik }: { denemeId: string; ad: string; anlik: boolean }) {
  const [sorular, setSorular] = useState<CozumSorusu[] | null>(null);
  const [yerel, setYerel] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  useEffect(() => {
    let bitti = false;
    const yerelden = async () => {
      const k = await bolumOku(denemeId);
      if (!k || bitti) return false;
      bitti = true;
      setYerel(true);
      setSorular(izUygula(denemeId, k, anlik));
      return true;
    };
    // Önce doğrudan Supabase (Vercel'siz); hata ya da boş sonuçta yedek yol (/api/deneme-veri, Vercel üzerinden)
    const yedek = () =>
      fetch(`/api/deneme-veri?id=${denemeId}&tur=cozum`, { credentials: "same-origin" })
        .then((c) => (c.ok ? c.json() : Promise.reject(new Error(`sunucu ${c.status}`))))
        .then((v) => v.veri as CozumSorusu[]);
    const agdan = async () => {
      // Bekleyen kayıtlar önce gitsin ki sunucudan gelen veri güncel olsun
      await kuyruguBosalt();
      const v = await denemeSorulari(veriIstemcisi(), denemeId, { anlik }, async (yollar) => sablonHaritasi(yollar, await gorselSablonuAl()))
        .then((v) => (v.length > 0 ? v : yedek()))
        .catch(() => yedek());
      return v;
    };

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      void yerelden().then((oldu) => {
        if (!oldu) setHata("İnternet bağlantısı yok ve bu bölüm tablete kaydedilmemiş");
      });
      return () => {
        bitti = true;
      };
    }
    // Ağ yavaşsa tabletteki kopya
    const t = setTimeout(() => void yerelden(), BEKLE_MS);
    agdan()
      .then((v) => {
        clearTimeout(t);
        if (v.length > 0) void bolumSakla(denemeId, v);
        if (bitti) return;
        bitti = true;
        // Gönderilmemiş kayıt kaldıysa sunucu verisi eksik: tabletteki izle tamamla
        if (bekleyenSayisi(denemeId) > 0) setSorular(izUygula(denemeId, v, anlik));
        else {
          izSil(denemeId);
          setSorular(v);
        }
      })
      .catch(async (e) => {
        clearTimeout(t);
        if (await yerelden()) return;
        if (!bitti) setHata(e instanceof Error ? e.message : "Yüklenemedi");
      });
    return () => {
      bitti = true;
      clearTimeout(t);
    };
  }, [denemeId, anlik]);
  if (hata) return <p className="kart text-kotu">Sorular yüklenemedi: {hata}. Sayfayı yenile.</p>;
  if (!sorular) return <p className="kart text-silik">Sorular yükleniyor…</p>;
  if (sorular.length === 0) return <p className="kart">Bu denemede soru yok.</p>;
  return (
    <>
      {yerel && (
        <p className="mb-3 rounded-lg border border-orta/40 bg-orta/10 px-3 py-2 text-xs text-orta">
          Tabletteki kopyadan açıldı (internet yok ya da yavaş). Cevapların tablette saklanır, bağlantı gelince kaydedilir.
        </p>
      )}
      <CozumEkrani denemeId={denemeId} ad={ad} anlik={anlik} sorular={sorular} />
    </>
  );
}
