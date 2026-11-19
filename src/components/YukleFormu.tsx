"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { tarayiciIstemcisi } from "@/lib/supabase/client";
import type { SoruSeti } from "@/lib/tipler";

type Durum = "bos" | "yukleniyor" | "isleniyor" | "bitti" | "hata";

export default function YukleFormu({ devamEdilecek }: { devamEdilecek: SoruSeti | null }) {
  const router = useRouter();
  const [dosya, setDosya] = useState<File | null>(null);
  const [ad, setAd] = useState(devamEdilecek?.ad ?? "");
  const [anahtar, setAnahtar] = useState("");
  const [durum, setDurum] = useState<Durum>(devamEdilecek ? "isleniyor" : "bos");
  const [mesaj, setMesaj] = useState<string>("");
  const [hata, setHata] = useState<string | null>(null);
  const [ilerleme, setIlerleme] = useState({
    parca: devamEdilecek?.islenen_parca ?? 0,
    toplam: devamEdilecek?.parca_sayisi ?? 0,
    soru: devamEdilecek?.soru_sayisi ?? 0,
  });
  const [setId, setSetId] = useState<string | null>(devamEdilecek?.id ?? null);

  /** Parcalari sirayla isler; her istek tek parca = zaman asimi riski yok. */
  async function parcalariIsle(id: string, baslangic: number, toplamParca: number) {
    setDurum("isleniyor");
    let parca = baslangic;

    while (parca < toplamParca) {
      setMesaj(`Sorular çıkarılıyor... (${parca + 1}/${toplamParca}. parça)`);
      const cevap = await fetch("/api/ayristir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setId: id, parca }),
      });
      const veri = await cevap.json();
      if (!cevap.ok) throw new Error(veri.hata || "Ayrıştırma hatası.");

      parca = veri.sonrakiParca ?? toplamParca;
      setIlerleme({ parca, toplam: toplamParca, soru: veri.soruSayisi ?? 0 });
      if (veri.bitti) break;
    }

    setDurum("bitti");
    setMesaj("");
    router.refresh();
  }

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    setHata(null);

    try {
      if (devamEdilecek && setId) {
        await parcalariIsle(setId, devamEdilecek.islenen_parca, devamEdilecek.parca_sayisi);
        return;
      }

      if (!dosya) throw new Error("Önce bir PDF seçin.");
      if (dosya.type !== "application/pdf") throw new Error("Sadece PDF yükleyebilirsiniz.");
      if (dosya.size > 32 * 1024 * 1024) throw new Error("PDF 32 MB'dan büyük olmamalı.");

      setDurum("yukleniyor");
      setMesaj("PDF yükleniyor...");

      const supabase = tarayiciIstemcisi();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Oturum düşmüş, tekrar giriş yapın.");

      const yol = `${user.id}/${crypto.randomUUID()}.pdf`;
      const { error: yuklemeHatasi } = await supabase.storage
        .from("pdfler")
        .upload(yol, dosya, { contentType: "application/pdf" });
      if (yuklemeHatasi) throw new Error(`Yükleme hatası: ${yuklemeHatasi.message}`);

      setMesaj("Cevap anahtarı aranıyor...");
      const setCevap = await fetch("/api/setler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ad: ad || dosya.name.replace(/\.pdf$/i, ""),
          dosyaYolu: yol,
          cevapAnahtari: anahtar,
        }),
      });
      const set = await setCevap.json();
      if (!setCevap.ok) throw new Error(set.hata || "Set oluşturulamadı.");

      setSetId(set.id);
      setIlerleme({ parca: 0, toplam: set.parca_sayisi, soru: 0 });
      await parcalariIsle(set.id, 0, set.parca_sayisi);
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Hata");
      setDurum("hata");
      setMesaj("");
    }
  }

  const calisiyor = durum === "yukleniyor" || durum === "isleniyor";
  const oran = ilerleme.toplam ? Math.round((ilerleme.parca / ilerleme.toplam) * 100) : 0;

  if (durum === "bitti") {
    return (
      <div className="kart space-y-4 text-center">
        <p className="text-4xl">✅</p>
        <div>
          <h2 className="text-lg font-semibold">{ilerleme.soru} soru hazır</h2>
          <p className="ince mt-1">Sorular ders ve konu olarak etiketlendi.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link href="/" className="btn-ana">
            Panele git ve çöz
          </Link>
          <button
            type="button"
            className="btn-ikincil"
            onClick={() => {
              setDurum("bos");
              setDosya(null);
              setAd("");
              setAnahtar("");
              setIlerleme({ parca: 0, toplam: 0, soru: 0 });
            }}
          >
            Başka PDF yükle
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={gonder} className="kart space-y-4">
      {devamEdilecek ? (
        <div className="rounded-xl border border-cizgi bg-kart2 p-3">
          <p className="font-medium">{devamEdilecek.ad}</p>
          <p className="ince mt-0.5">
            {devamEdilecek.islenen_parca}/{devamEdilecek.parca_sayisi} parça işlendi ·{" "}
            {devamEdilecek.soru_sayisi} soru çıktı
          </p>
          {devamEdilecek.hata && (
            <p className="mt-1 text-xs text-kotu">Son hata: {devamEdilecek.hata}</p>
          )}
        </div>
      ) : (
        <>
          <div>
            <label className="etiket" htmlFor="dosya">
              Soru PDF&apos;i
            </label>
            <input
              id="dosya"
              type="file"
              accept="application/pdf"
              className="giris-alani file:mr-3 file:rounded-lg file:border-0 file:bg-kart2 file:px-3 file:py-1.5 file:text-metin"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setDosya(f);
                if (f && !ad) setAd(f.name.replace(/\.pdf$/i, ""));
              }}
              disabled={calisiyor}
            />
            <p className="mt-1 text-xs text-silik">En fazla 32 MB. Taranmış PDF de olur.</p>
          </div>

          <div>
            <label className="etiket" htmlFor="ad">
              Set adı
            </label>
            <input
              id="ad"
              className="giris-alani"
              value={ad}
              onChange={(e) => setAd(e.target.value)}
              placeholder="Örn. 2024 TUS Temel Bilimler"
              disabled={calisiyor}
            />
          </div>

          <div>
            <label className="etiket" htmlFor="anahtar">
              Cevap anahtarı <span className="normal-case">(isteğe bağlı)</span>
            </label>
            <textarea
              id="anahtar"
              rows={3}
              className="giris-alani font-mono text-sm"
              value={anahtar}
              onChange={(e) => setAnahtar(e.target.value)}
              placeholder="1-A 2-C 3-B 4-E ..."
              disabled={calisiyor}
            />
            <p className="mt-1 text-xs text-silik">
              Boş bırakırsan anahtar PDF&apos;in son sayfalarından okunmaya çalışılır.
            </p>
          </div>
        </>
      )}

      {calisiyor && (
        <div className="space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-[4px] bg-kart2">
            <div
              className="h-full rounded-[4px] bg-vurgu transition-all"
              style={{ width: `${Math.max(oran, 4)}%` }}
            />
          </div>
          <p className="ince">
            {mesaj} {ilerleme.soru > 0 && `· ${ilerleme.soru} soru çıkarıldı`}
          </p>
          <p className="text-xs text-silik">
            Bu işlem PDF uzunluğuna göre birkaç dakika sürebilir, sayfadan ayrılma.
          </p>
        </div>
      )}

      {hata && (
        <div className="rounded-xl border border-kotu/40 bg-kotu/10 px-3 py-2 text-sm text-kotu">
          {hata}
          {setId && (
            <>
              {" "}
              <Link href={`/yukle?set=${setId}`} className="underline">
                Kaldığı yerden devam et
              </Link>
            </>
          )}
        </div>
      )}

      <button type="submit" className="btn-ana w-full" disabled={calisiyor}>
        {calisiyor ? "İşleniyor..." : devamEdilecek ? "İşlemeye devam et" : "Yükle ve ayrıştır"}
      </button>
    </form>
  );
}
