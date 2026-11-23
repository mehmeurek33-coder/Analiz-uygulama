"use client";

import { useEffect, useState } from "react";
import CozumEkrani, { type CozumSorusu } from "@/components/CozumEkrani";
import { denemeSorulari } from "@/lib/denemeVeri";
import { sablonHaritasi } from "@/lib/gorselYardim";
import { gorselSablonuAl, veriIstemcisi } from "@/lib/veriIstemci";

/** Çözüm ekranı: sorular tarayıcıda doğrudan Supabase'den (Vercel'den geçmez, HATALAR E10). */
export default function CozumYukleyici({ denemeId, ad, anlik }: { denemeId: string; ad: string; anlik: boolean }) {
  const [sorular, setSorular] = useState<CozumSorusu[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  useEffect(() => {
    // Önce doğrudan Supabase (Vercel'siz); hata ya da boş sonuçta yedek yol (/api/deneme-veri, Vercel üzerinden)
    const yedek = () =>
      fetch(`/api/deneme-veri?id=${denemeId}&tur=cozum`, { credentials: "same-origin" })
        .then((c) => (c.ok ? c.json() : Promise.reject(new Error(`sunucu ${c.status}`))))
        .then((v) => v.veri);
    denemeSorulari(veriIstemcisi(), denemeId, { anlik }, async (yollar) => sablonHaritasi(yollar, await gorselSablonuAl()))
      .then((v) => (v.length > 0 ? v : yedek()))
      .catch(() => yedek())
      .then(setSorular)
      .catch((e) => setHata(e instanceof Error ? e.message : "Yüklenemedi"));
  }, [denemeId, anlik]);
  if (hata) return <p className="kart text-kotu">Sorular yüklenemedi: {hata}. Sayfayı yenile.</p>;
  if (!sorular) return <p className="kart text-silik">Sorular yükleniyor…</p>;
  if (sorular.length === 0) return <p className="kart">Bu denemede soru yok.</p>;
  return <CozumEkrani denemeId={denemeId} ad={ad} anlik={anlik} sorular={sorular} />;
}
