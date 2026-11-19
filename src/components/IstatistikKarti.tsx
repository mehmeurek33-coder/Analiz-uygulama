/** Tek sayiyi one cikaran kart (grafik degil - kasitli olarak sade). */
export default function IstatistikKarti({
  baslik,
  deger,
  alt,
  renk = "text-metin",
}: {
  baslik: string;
  deger: string | number;
  alt?: string;
  renk?: string;
}) {
  return (
    <div className="kart">
      <p className="text-xs font-medium tracking-wide text-silik uppercase">{baslik}</p>
      <p className={`mt-1.5 text-3xl font-bold tabular-nums ${renk}`}>{deger}</p>
      {alt && <p className="mt-0.5 text-xs text-silik">{alt}</p>}
    </div>
  );
}
