/**
 * Tekrar ve öncelik algoritması (veritabanı tarafı: supabase/schema.sql göç 10).
 *
 * Soru düzeyi (v_soru_durum): hiç hata yapılmamış soru "bilinen"dir. Hata yapılan soru kutu 0'dan
 * başlar ve FARKLI günlerde art arda emin doğrularla yükselir; tekrar aralığı 0 → 2 → 7 → 21 gün,
 * kutu 4 = öğrenildi. Araya giren yanlış, boş ya da "emin değilim" kutuyu sıfırlar. Yani bir kez
 * doğru yapmak soruyu listeden düşürmez, yalnızca bir sonraki tekrarı ileri atar.
 *
 * Konu düzeyi (v_konu_oncelik):
 *   ustalık = (2 + Σ w·başarı) / (4 + Σ w), w = e^(-gün/30): yeni cevaplar ağır basar, az veride %50
 *   önem    = ln(1 + konudaki soru) / ln(1 + dersin en kalabalık konusu): çok sorulan konu önemli
 *   öncelik = [önem·(1 − ustalık)·(0,25 + 0,75·güven) + 0,10·√açık hata + 0,08·√vadesi gelen]
 *             / (1 + son 36 saatteki cevap / 20)   (güven = kanıt/(kanıt+4); tek yanlış takıntı yapmaz)
 * Konu içinde farklı kaynakların soruları sırayla karışır (api/deneme konudanSec).
 */

export type KonuOncelik = {
  ders: string;
  konu: string;
  soru: number;
  cozulen: number;
  deneme: number;
  ustalik: number;
  kanit: number;
  acik_hata: number;
  vadesi_gelen: number;
  ogrenilen: number;
  son36: number;
  onem: number;
  oncelik: number;
};

export const ONCELIK_ALANLARI =
  "ders, konu, soru, cozulen, deneme, son36, ustalik, kanit, acik_hata, vadesi_gelen, ogrenilen, onem, oncelik";

/** PostgREST numeric alanları metin döndürür: sayıya çevir. */
export function oncelikSatiri(x: Record<string, unknown>): KonuOncelik {
  const s = (k: string) => Number(x[k]) || 0;
  return {
    ders: String(x.ders ?? ""),
    konu: String(x.konu ?? "Belirsiz"),
    soru: s("soru"),
    cozulen: s("cozulen"),
    deneme: s("deneme"),
    ustalik: s("ustalik"),
    kanit: s("kanit"),
    acik_hata: s("acik_hata"),
    vadesi_gelen: s("vadesi_gelen"),
    ogrenilen: s("ogrenilen"),
    son36: s("son36"),
    onem: s("onem"),
    oncelik: s("oncelik"),
  };
}

/** Öncelikli konu denemesine giren en fazla konu sayısı. */
export const ONCELIKLI_KONU_SAYISI = 6;

/**
 * Toplam soru sayısını konulara öncelikle orantılı dağıtır (en büyük kalan yöntemi).
 * Vadesi gelen tekrarı olan konu en az o kadar (payı yetiyorsa), her konu en az 1 soru alır.
 * Konunun havuzundaki soru sayısını aşmaz; artan pay sıradaki konulara geçer.
 */
export function payDagit(konular: KonuOncelik[], toplam: number): number[] {
  const n = konular.length;
  if (n === 0 || toplam <= 0) return konular.map(() => 0);
  const agirlik = konular.map((k) => Math.max(k.oncelik, 0.01));
  const top = agirlik.reduce((a, b) => a + b, 0);
  const ham = agirlik.map((w) => (w / top) * toplam);
  const pay = ham.map((h) => Math.floor(h));
  let kalan = toplam - pay.reduce((a, b) => a + b, 0);
  ham
    .map((h, i) => [h - Math.floor(h), i] as const)
    .sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => {
      if (kalan > 0) {
        pay[i]++;
        kalan--;
      }
    });
  // en az 1, en fazla havuz. Az çalışılmış konu (tek yanlışla listeye girmiş olabilir) denemeyi
  // doldurmasın: o konudan en fazla max(3, 1,5 × çözülen soru) soru gelir, artan pay diğerlerine geçer.
  const tavan = (k: KonuOncelik) => Math.min(Math.max(k.soru, 0), Math.max(3, Math.ceil(1.5 * k.cozulen)));
  for (let i = 0; i < n; i++) pay[i] = Math.min(Math.max(pay[i], 1), tavan(konular[i]));
  // toplamı tuttur: fazlayı en düşük öncelikliden al, eksiği yer olan en yüksek öncelikliye ver
  let fark = toplam - pay.reduce((a, b) => a + b, 0);
  for (let i = n - 1; fark < 0 && i >= 0; i--) {
    const al = Math.min(pay[i] - 1, -fark);
    pay[i] -= al;
    fark += al;
  }
  for (let i = 0; fark > 0 && i < n; i++) {
    const ver = Math.min(tavan(konular[i]) - pay[i], fark);
    if (ver > 0) {
      pay[i] += ver;
      fark -= ver;
    }
  }
  return pay;
}

/** Ustalığın güvenilir sayılması için gereken ağırlıklı cevap (≈ son bir ayda 5 cevap). */
export const AZ_KANIT = 5;

export function ustalikMetni(k: KonuOncelik) {
  return `ustalık %${Math.round(k.ustalik * 100)}`;
}
