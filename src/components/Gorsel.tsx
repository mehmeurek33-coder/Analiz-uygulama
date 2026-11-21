"use client";

import { useState, type ImgHTMLAttributes } from "react";

/** İmzalı bağlantıdan depo yolunu çıkarır (B2: /file/<depo>/<yol>, Supabase: /object/sign/<depo>/<yol>). */
export function depoYolu(url: string | null | undefined): string | null {
  const m = url?.match(/\/(?:file|object\/sign)\/[^/]+\/([^?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * İmzalı bağlantılı görsel. Bağlantı yüklenemezse (sayfa uzun süre açık kaldı, jeton bitti)
 * bir kez /api/gorsel üzerinden taze bağlantıyla dener; o da olmazsa onBasarisiz çağrılır.
 */
export default function Gorsel({
  src,
  yol,
  onBasarisiz,
  ...geri
}: ImgHTMLAttributes<HTMLImageElement> & { src: string; yol?: string | null; onBasarisiz?: () => void }) {
  const [kaynak, setKaynak] = useState(src);
  const [denendi, setDenendi] = useState(false);
  const depo = yol ?? depoYolu(src);
  return (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img
      {...geri}
      src={kaynak}
      onError={() => {
        if (!denendi && depo) {
          setDenendi(true);
          setKaynak(`/api/gorsel?yol=${encodeURIComponent(depo)}&t=${Date.now()}`);
        } else onBasarisiz?.();
      }}
    />
  );
}
