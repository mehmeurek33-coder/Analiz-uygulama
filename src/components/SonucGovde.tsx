"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import BandAciklama from "@/components/BandAciklama";
import IstatistikKarti from "@/components/IstatistikKarti";
import KonuMetre from "@/components/KonuMetre";
import SonucListesi, { type SonucSatiri } from "@/components/SonucListesi";
import { band, yuzde, type KonuOzeti } from "@/lib/analiz";
import { sonucSatirlari } from "@/lib/denemeVeri";
import { sablonHaritasi } from "@/lib/gorselYardim";
import { gorselSablonuAl, veriIstemcisi } from "@/lib/veriIstemci";

type Deneme = { id: string; ad: string; bitti_at: string | null };

/** Sonuç sayfası: soru verisi tarayıcıda doğrudan Supabase'den (Vercel'den geçmez, HATALAR E10). */
export default function SonucGovde({ deneme }: { deneme: Deneme }) {
  const [sonuclar, setSonuclar] = useState<SonucSatiri[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  useEffect(() => {
    // Önce doğrudan Supabase (Vercel'siz); hata ya da boş sonuçta yedek yol (/api/deneme-veri, Vercel üzerinden)
    const yedek = () =>
      fetch(`/api/deneme-veri?id=${deneme.id}&tur=sonuc`, { credentials: "same-origin" })
        .then((c) => (c.ok ? c.json() : Promise.reject(new Error(`sunucu ${c.status}`))))
        .then((v) => v.veri);
    sonucSatirlari(veriIstemcisi(), deneme.id, async (yollar) => sablonHaritasi(yollar, await gorselSablonuAl()))
      .then((v) => (v.length > 0 ? v : yedek()))
      .catch(() => yedek())
      .then(setSonuclar)
      .catch((e) => setHata(e instanceof Error ? e.message : "Yüklenemedi"));
  }, [deneme.id]);
  if (hata) return <p className="kart text-kotu">Sonuçlar yüklenemedi: {hata}. Sayfayı yenile.</p>;
  if (!sonuclar) return <p className="kart text-silik">Sonuçlar yükleniyor…</p>;
  return <SonucIcerik deneme={deneme} sonuclar={sonuclar} />;
}

function SonucIcerik({ deneme, sonuclar }: { deneme: Deneme; sonuclar: SonucSatiri[] }) {
  const dogru = sonuclar.filter((s) => s.dogru === true).length;
  const yanlis = sonuclar.filter((s) => s.dogru === false && s.isaretlenen).length;
  const bos = sonuclar.filter((s) => !s.isaretlenen).length;
  const anahtarsiz = sonuclar.filter((s) => s.isaretlenen && !s.dogruCevap).length;
  const degerlendirilen = dogru + yanlis;
  const oran = degerlendirilen ? dogru / degerlendirilen : 0;
  const net = dogru - yanlis / 4;

  // Bu denemenin konu kirilimi
  const harita = new Map<string, KonuOzeti>();
  for (const s of sonuclar) {
    const ders = s.ders ?? "Belirsiz";
    const konu = s.konu ?? "Belirsiz";
    const anahtar = `${ders} / ${konu}`;
    const k =
      harita.get(anahtar) ?? { anahtar, ders, konu, toplam: 0, dogru: 0, yanlis: 0, bos: 0, oran: 0 };
    k.toplam += 1;
    if (s.dogru === true) k.dogru += 1;
    else if (s.dogru === false && s.isaretlenen) k.yanlis += 1;
    if (!s.isaretlenen) k.bos += 1;
    harita.set(anahtar, k);
  }
  const konular = [...harita.values()]
    .map((k) => ({ ...k, oran: k.toplam ? k.dogru / k.toplam : 0 }))
    .sort((a, b) => a.oran - b.oran);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="ince hover:text-metin">
          &larr; Panel
        </Link>
        <h1 className="mt-2 text-xl font-bold sm:text-2xl">{deneme.ad}</h1>
        <p className="ince mt-1">
          {deneme.bitti_at
            ? new Date(deneme.bitti_at).toLocaleString("tr-TR", {
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "Devam ediyor"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <IstatistikKarti baslik="Doğru" deger={dogru} renk="text-iyi" />
        <IstatistikKarti baslik="Yanlış" deger={yanlis} renk="text-zayif" />
        <IstatistikKarti baslik="Boş" deger={bos} />
        <IstatistikKarti
          baslik="Doğru oranı"
          deger={degerlendirilen ? yuzde(oran) : "-"}
          alt={`net ${net.toFixed(2)}`}
          renk={
            degerlendirilen
              ? band(oran) === "iyi"
                ? "text-iyi"
                : band(oran) === "orta"
                  ? "text-orta"
                  : "text-zayif"
              : "text-metin"
          }
        />
      </div>

      {anahtarsiz > 0 && (
        <p className="rounded-xl border border-orta/40 bg-orta/10 px-3 py-2 text-sm text-orta">
          {anahtarsiz} sorunun cevap anahtarı bilinmiyor, bunlar orana katılmadı. Seti düzenleyerek
          anahtarı sonradan girebilirsin.
        </p>
      )}

      <section className="kart">
        <h2 className="mb-3 font-semibold">Bu testte konu dağılımı</h2>
        <div className="mb-3">
          <BandAciklama />
        </div>
        <KonuMetre satirlar={konular} />
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Soru soru inceleme</h2>
        <SonucListesi satirlar={sonuclar} />
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link href="/analiz" className="btn-ana flex-1">
          Genel analizi gör
        </Link>
        <Link href="/" className="btn-ikincil flex-1">
          Panele dön
        </Link>
      </div>
    </div>
  );
}
