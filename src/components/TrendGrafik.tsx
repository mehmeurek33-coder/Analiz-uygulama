"use client";

import { useRef, useState } from "react";
import { gunAdi, yuzde, type GunNoktasi } from "@/lib/analiz";

const G = 600;
const Y = 180;
const PAD = { sol: 34, sag: 22, ust: 12, alt: 26 };

/** Gun gun dogru orani - tek seri cizgi grafigi (crosshair + ipucu). */
export default function TrendGrafik({ noktalar }: { noktalar: GunNoktasi[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [aktif, setAktif] = useState<number | null>(null);

  if (noktalar.length === 0) {
    return <p className="ince">Grafik için önce bir deneme bitirmelisin.</p>;
  }

  const ic = { g: G - PAD.sol - PAD.sag, y: Y - PAD.ust - PAD.alt };
  const x = (i: number) =>
    PAD.sol + (noktalar.length === 1 ? ic.g / 2 : (i / (noktalar.length - 1)) * ic.g);
  const yy = (oran: number) => PAD.ust + (1 - oran) * ic.y;

  const cizgi = noktalar.map((n, i) => `${i === 0 ? "M" : "L"}${x(i)},${yy(n.oran)}`).join(" ");

  function hareket(e: React.MouseEvent<SVGSVGElement>) {
    const kutu = svgRef.current?.getBoundingClientRect();
    if (!kutu) return;
    const oran = (e.clientX - kutu.left) / kutu.width;
    const sanal = oran * G;
    let enYakin = 0;
    let mesafe = Infinity;
    noktalar.forEach((_, i) => {
      const d = Math.abs(x(i) - sanal);
      if (d < mesafe) {
        mesafe = d;
        enYakin = i;
      }
    });
    setAktif(enYakin);
  }

  const a = aktif != null ? noktalar[aktif] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${G} ${Y}`}
        className="h-44 w-full touch-none"
        role="img"
        aria-label="Günlere göre doğru oranı"
        onMouseMove={hareket}
        onMouseLeave={() => setAktif(null)}
      >
        {[0, 0.5, 1].map((o) => (
          <g key={o}>
            <line
              x1={PAD.sol}
              x2={G - PAD.sag}
              y1={yy(o)}
              y2={yy(o)}
              stroke="var(--color-izgara)"
              strokeWidth="1"
            />
            <text x={4} y={yy(o) + 4} fill="#93a3c0" fontSize="11">
              {Math.round(o * 100)}%
            </text>
          </g>
        ))}

        {a && aktif != null && (
          <line
            x1={x(aktif)}
            x2={x(aktif)}
            y1={PAD.ust}
            y2={Y - PAD.alt}
            stroke="#93a3c0"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}

        <path d={cizgi} fill="none" stroke="var(--color-seri)" strokeWidth="2" strokeLinejoin="round" />

        {noktalar.map((n, i) => (
          <circle
            key={n.gun}
            cx={x(i)}
            cy={yy(n.oran)}
            r={aktif === i ? 6 : 4.5}
            fill="var(--color-seri)"
            stroke="var(--color-zemin)"
            strokeWidth="2"
          />
        ))}

        {noktalar.length <= 10 &&
          noktalar.map((n, i) => (
            <text
              key={n.gun}
              x={x(i)}
              y={Y - 8}
              fill="#93a3c0"
              fontSize="11"
              textAnchor={i === 0 ? "start" : i === noktalar.length - 1 ? "end" : "middle"}
            >
              {gunAdi(n.gun)}
            </text>
          ))}
      </svg>

      {a && (
        <div
          className={`pointer-events-none absolute top-1 rounded-xl border border-cizgi bg-kart2 px-3 py-2 text-xs shadow-lg ${
            aktif != null && aktif > noktalar.length / 2 ? "left-1" : "right-1"
          }`}
        >
          <p className="font-semibold">{gunAdi(a.gun)}</p>
          <p className="text-silik tabular-nums">
            {yuzde(a.oran)} · {a.dogru}/{a.toplam} doğru
          </p>
        </div>
      )}

      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-silik hover:text-metin">
          Tablo olarak gör
        </summary>
        <table className="mt-2 w-full text-left text-xs">
          <thead className="text-silik">
            <tr>
              <th className="py-1">Gün</th>
              <th className="py-1">Soru</th>
              <th className="py-1">Doğru</th>
              <th className="py-1">Oran</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {noktalar.map((n) => (
              <tr key={n.gun} className="border-t border-cizgi">
                <td className="py-1">{gunAdi(n.gun)}</td>
                <td className="py-1">{n.toplam}</td>
                <td className="py-1">{n.dogru}</td>
                <td className="py-1">{yuzde(n.oran)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
