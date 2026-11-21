"use client";

import { useState } from "react";

const TURLER: { deger: string; ad: string }[] = [
  { deger: "metin", ad: "Soru metni bozuk/eksik" },
  { deger: "sik", ad: "Şık bozuk/eksik" },
  { deger: "anahtar", ad: "Cevap anahtarı şüpheli" },
  { deger: "aciklama", ad: "Açıklama yanlış/başka soruya ait" },
  { deger: "gorsel", ad: "Görsel okunmuyor" },
  { deger: "konu", ad: "Konu etiketi yanlış" },
  { deger: "diger", ad: "Diğer" },
];

/**
 * Sorunun altında küçük "Hata bildir" bağlantısı. Bildirim kaydedilir; Claude sonraki oturumda
 * kitaptaki görüntüyle kontrol edip düzeltir.
 */
export default function HataBildir({ soruId }: { soruId: string }) {
  const [acik, setAcik] = useState(false);
  const [tur, setTur] = useState("metin");
  const [not, setNot] = useState("");
  const [durum, setDurum] = useState<"bos" | "gonderiliyor" | "tamam" | "hata">("bos");

  async function gonder() {
    setDurum("gonderiliyor");
    try {
      const yanit = await fetch("/api/bildirim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ soruId, tur, not }),
      });
      setDurum(yanit.ok ? "tamam" : "hata");
      if (yanit.ok) setAcik(false);
    } catch {
      setDurum("hata");
    }
  }

  if (durum === "tamam" && !acik) {
    return <p className="mt-3 text-xs text-iyi">Bildirildi ✓ Bir sonraki düzeltmede kontrol edilecek.</p>;
  }

  if (!acik) {
    return (
      <div className="mt-3 text-right">
        <button type="button" className="text-xs text-silik hover:text-metin hover:underline" onClick={() => setAcik(true)}>
          ⚑ Hata bildir
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-cizgi bg-kart2 p-3 text-sm">
      <select className="w-full rounded-lg border border-cizgi bg-kart px-2 py-1.5" value={tur} onChange={(e) => setTur(e.target.value)}>
        {TURLER.map((t) => (
          <option key={t.deger} value={t.deger}>
            {t.ad}
          </option>
        ))}
      </select>
      <textarea
        className="w-full rounded-lg border border-cizgi bg-kart px-2 py-1.5"
        rows={2}
        maxLength={1000}
        placeholder="İsteğe bağlı not (ör. C şıkkı kesik, kitapta 'B19' yazıyor)"
        value={not}
        onChange={(e) => setNot(e.target.value)}
      />
      {durum === "hata" && <p className="text-xs text-kotu">Gönderilemedi, tekrar dene.</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-ikincil flex-1 py-1.5 text-sm" onClick={() => setAcik(false)}>
          Vazgeç
        </button>
        <button type="button" className="btn-ana flex-1 py-1.5 text-sm" onClick={gonder} disabled={durum === "gonderiliyor"}>
          {durum === "gonderiliyor" ? "Gönderiliyor…" : "Gönder"}
        </button>
      </div>
    </div>
  );
}
