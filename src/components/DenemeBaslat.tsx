"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Mod = "rastgele" | "zayif" | "yanlis" | "tumu";

export default function DenemeBaslat({
  mod,
  setId,
  adet,
  etiket,
  aciklama,
  ikincil = false,
}: {
  mod: Mod;
  setId?: string;
  adet?: number;
  etiket: string;
  aciklama?: string;
  ikincil?: boolean;
}) {
  const router = useRouter();
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  async function basla() {
    setBekle(true);
    setHata(null);
    try {
      const cevap = await fetch("/api/deneme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mod, setId: setId ?? null, adet: adet ?? 20 }),
      });
      const veri = await cevap.json();
      if (!cevap.ok) throw new Error(veri.hata || "Deneme başlatılamadı.");
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
        className={ikincil ? "btn-ikincil w-full" : "btn-ana w-full"}
      >
        {bekle ? "Hazırlanıyor..." : etiket}
      </button>
      {aciklama && <p className="mt-1.5 text-center text-xs text-silik">{aciklama}</p>}
      {hata && <p className="mt-1.5 text-center text-xs text-kotu">{hata}</p>}
    </div>
  );
}
