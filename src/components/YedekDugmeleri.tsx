"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** "Şimdi yedekle" düğmesi. */
export default function YedekDugmeleri() {
  const router = useRouter();
  const [durum, setDurum] = useState<"bos" | "suruyor" | "tamam">("bos");
  const [hata, setHata] = useState<string | null>(null);

  async function yedekle() {
    setDurum("suruyor");
    setHata(null);
    try {
      const cevap = await fetch("/api/yedek", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const veri = await cevap.json().catch(() => null);
      if (!cevap.ok || !veri) throw new Error(veri?.hata || "Yedek alınamadı.");
      setDurum("tamam");
      router.refresh();
    } catch (e) {
      setHata((e as Error).message);
      setDurum("bos");
    }
  }

  return (
    <div>
      <button type="button" className="btn-ana w-full sm:w-auto" onClick={yedekle} disabled={durum === "suruyor"}>
        {durum === "suruyor" ? "Yedekleniyor..." : durum === "tamam" ? "✓ Yedek alındı" : "Şimdi yedekle"}
      </button>
      {hata && <p className="mt-2 text-sm text-kotu">{hata}</p>}
    </div>
  );
}

/** Tek bir yedek dosyasını indirir (10 dakikalık imzalı bağlantı). */
export function IndirDugmesi({ yol, etiket }: { yol: string; etiket: string }) {
  const [bekle, setBekle] = useState(false);
  async function indir() {
    setBekle(true);
    try {
      const cevap = await fetch("/api/yedek", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ indir: yol }),
      });
      const veri = await cevap.json();
      if (!cevap.ok) throw new Error(veri.hata);
      window.location.href = veri.url;
    } catch {
      alert("İndirme bağlantısı alınamadı.");
    } finally {
      setBekle(false);
    }
  }
  return (
    <button type="button" onClick={indir} disabled={bekle} className="btn-ikincil px-3 py-1.5 text-xs">
      {bekle ? "..." : `↓ ${etiket}`}
    </button>
  );
}
