/** Yüklenirken gösterilen yer tutucu bloklar. */
export function IskeletKutu({ yukseklik = "h-24" }: { yukseklik?: string }) {
  return <div className={`${yukseklik} animate-pulse rounded-2xl border border-cizgi bg-kart`} />;
}

export function IskeletSatir({ genislik = "w-40" }: { genislik?: string }) {
  return <div className={`${genislik} h-4 animate-pulse rounded bg-kart2`} />;
}
