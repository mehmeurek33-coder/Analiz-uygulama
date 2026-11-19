"use client";

import { useState } from "react";
import { gunAdi, yuzde } from "@/lib/analiz";

type Gun = { gun: string; toplam: number; dogru: number };

/**
 * Son 12 haftanın çalışma yoğunluğu.
 * Tek hue sıralı (sequential) mavi rampa: açık = az, koyu = çok.
 * Koyu zeminde en açık adım yüzeyden ayrışsın diye 600'den açılmaz.
 */
const RAMPA = ["#18223c", "#184f95", "#256abf", "#3987e5", "#6da7ec"];

function seviye(toplam: number) {
  if (toplam === 0) return 0;
  if (toplam < 10) return 1;
  if (toplam < 25) return 2;
  if (toplam < 50) return 3;
  return 4;
}

export default function AktiviteTakvimi({ gunler }: { gunler: Gun[] }) {
  const [aktif, setAktif] = useState<Gun | null>(null);

  // Satırlar pazartesi-pazar olsun diye ilk haftanın başını boş hücreyle doldur
  const ilkGun = gunler[0] ? new Date(`${gunler[0].gun}T00:00:00`).getDay() : 1;
  const bosluk = (ilkGun + 6) % 7; // pazartesi = 0
  const hucreler: (Gun | null)[] = [...Array<null>(bosluk).fill(null), ...gunler];

  const haftalar: (Gun | null)[][] = [];
  for (let i = 0; i < hucreler.length; i += 7) haftalar.push(hucreler.slice(i, i + 7));

  const toplamSoru = gunler.reduce((a, g) => a + g.toplam, 0);
  const aktifGun = gunler.filter((g) => g.toplam > 0).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="text-sm">
          <span className="font-semibold tabular-nums">{aktifGun}</span>
          <span className="text-silik"> günde </span>
          <span className="font-semibold tabular-nums">{toplamSoru}</span>
          <span className="text-silik"> soru</span>
        </p>
        <p className="text-xs text-silik">son 12 hafta</p>
      </div>

      <div className="relative">
        <div className="flex gap-[3px] overflow-x-auto pb-1">
          <div className="mr-1 flex shrink-0 flex-col gap-[3px] text-[9px] leading-[14px] text-silik">
            {["Pzt", "", "Çar", "", "Cum", "", "Paz"].map((g, i) => (
              <span key={i} className="h-3.5">
                {g}
              </span>
            ))}
          </div>
          {haftalar.map((hafta, i) => (
            <div key={i} className="flex flex-col gap-[3px]">
              {hafta.map((g, j) =>
                g === null ? (
                  <span key={`bos-${j}`} className="h-3.5 w-3.5 shrink-0" />
                ) : (
                <button
                  key={g.gun}
                  type="button"
                  onMouseEnter={() => setAktif(g)}
                  onMouseLeave={() => setAktif(null)}
                  onFocus={() => setAktif(g)}
                  onBlur={() => setAktif(null)}
                  aria-label={`${gunAdi(g.gun)}: ${g.toplam} soru`}
                  className="h-3.5 w-3.5 shrink-0 rounded-[3px] transition hover:ring-2 hover:ring-vurgu/60"
                  style={{ background: RAMPA[seviye(g.toplam)] }}
                />
                ),
              )}
            </div>
          ))}
        </div>

        {aktif && (
          <div className="pointer-events-none absolute -top-2 right-0 rounded-xl border border-cizgi bg-kart2 px-3 py-2 text-xs shadow-lg">
            <p className="font-semibold">{gunAdi(aktif.gun)}</p>
            <p className="text-silik tabular-nums">
              {aktif.toplam === 0
                ? "soru çözülmemiş"
                : `${aktif.toplam} soru · ${yuzde(aktif.dogru / aktif.toplam)} doğru`}
            </p>
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-xs text-silik">
        <span>az</span>
        {RAMPA.map((renk) => (
          <span
            key={renk}
            className="h-3 w-3 rounded-[3px]"
            style={{ background: renk }}
            aria-hidden
          />
        ))}
        <span>çok</span>
      </div>
    </div>
  );
}
