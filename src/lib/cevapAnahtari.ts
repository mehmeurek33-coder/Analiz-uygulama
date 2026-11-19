/**
 * Serbest metin cevap anahtarini ayristirir.
 * Kabul edilen bicimler:  "1-A 2-C 3.B"  |  "1) A"  |  "1 A"  |  satir satir
 * Dondurur: { 1: "A", 2: "C", ... }
 */
export function cevapAnahtariniAyristir(metin?: string | null): Record<number, string> {
  const sonuc: Record<number, string> = {};
  if (!metin) return sonuc;
  const re = /(\d{1,3})\s*[-.)\s:]\s*([A-Ea-e])(?![a-zA-Z])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(metin)) !== null) {
    sonuc[Number(m[1])] = m[2].toUpperCase();
  }
  return sonuc;
}
