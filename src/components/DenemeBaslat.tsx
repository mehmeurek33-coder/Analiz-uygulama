"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { sonDenemeOku, sonDenemeYaz } from "@/lib/cevrimdisi";

type Mod = "rastgele" | "zayif" | "yanlis" | "tumu" | "konu";

export default function DenemeBaslat({
  mod,
  setId,
  adet,
  etiket,
  aciklama,
  ikincil = false,
  ders,
  konu,
  kucuk = false,
  yeni = false,
}: {
  mod: Mod;
  setId?: string;
  adet?: number;
  etiket: string;
  aciklama?: string;
  ikincil?: boolean;
  ders?: string;
  konu?: string;
  kucuk?: boolean;
  /** Set turu: yarıda bitirilmiş bölümü baştan başlat (yoksa kalan sorularla devam) */
  yeni?: boolean;
}) {
  const router = useRouter();
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  async function basla() {
    setBekle(true);
    setHata(null);
    // İnternetsiz "Devam et": bu düğmeyle en son açılan deneme tabletteki kopyasından açılır
    const anahtar = JSON.stringify({ mod, setId: setId ?? null, ders, konu });
    try {
      let cevap: Response;
      try {
        cevap = await fetch("/api/deneme", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mod, setId: setId ?? null, adet: adet ?? 20, ders, konu, yeni }),
        });
      } catch {
        // Kayıt bitirilince silinir: varsa o tur hâlâ açık (sunucu da onu döndürürdü)
        const son = sonDenemeOku(anahtar);
        if (son) {
          window.location.href = `/deneme/${son}`;
          return;
        }
        throw new Error("İnternet yok ve bu bölüm tablette açılmamış. Bağlanınca bir kez aç.");
      }
      const veri = await cevap.json();
      if (!cevap.ok) throw new Error(veri.hata || "Deneme başlatılamadı.");
      if (mod === "tumu") sonDenemeYaz(anahtar, veri.id);
      router.push(`/deneme/${veri.id}`);
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Hata");
      setBekle(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={basla}
        disabled={bekle}
        className={`${ikincil ? "btn-ikincil" : "btn-ana"} ${kucuk ? "px-3 py-1.5 text-xs" : "w-full"}`}
      >
        {bekle ? "Hazırlanıyor..." : etiket}
      </button>
      {aciklama && <p className="mt-1.5 text-center text-xs text-silik">{aciklama}</p>}
      {hata && <p className="mt-1.5 text-center text-xs text-kotu">{hata}</p>}
    </div>
  );
}
