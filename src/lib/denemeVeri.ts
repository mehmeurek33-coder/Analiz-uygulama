import type { SupabaseClient } from "@supabase/supabase-js";
import type { CozumSorusu } from "@/components/CozumEkrani";
import type { SonucSatiri } from "@/components/SonucListesi";
import { blokYollari, bloklariHazirla, kitabiHazirla, kitapYollari } from "@/lib/gorselYardim";

/**
 * Çözüm ekranının verisi (sunucuda ya da tarayıcıda aynı kod). `baglantiFn` görsel yollarından bağlantı haritası
 * üretir (sunucuda imzalı, tarayıcıda şablonla).
 */
export async function denemeSorulari(
  supabase: SupabaseClient,
  id: string,
  deneme: { anlik: boolean | null },
  baglantiFn: (yollar: (string | null | undefined)[]) => Promise<Map<string, string>>,
): Promise<CozumSorusu[]> {
  // DİKKAT: Deneme modunda dogru_cevap ve aciklama istemciye HİÇ gönderilmez.
  // Soru bankası modunda (kişisel çalışma) anında geri bildirim için önceden gönderilir;
  // arayüz cevap verilene kadar göstermez. Puanlama yine sunucuda yapılır.
  const alanlar = deneme.anlik
    ? "numara, metin, secenekler, ders, konu, vaka_metni, soru_gorsel, soru_kitap_gorsel, soru_kitap_w, soru_kitap_h, dogru_cevap, aciklama, aciklama_gorsel, aciklama_bloklar, aciklama_kitap"
    : "numara, metin, secenekler, ders, konu, vaka_metni, soru_gorsel, soru_kitap_gorsel, soru_kitap_w, soru_kitap_h";

  const { data: satirlar } = await supabase
    .from("cevaplar")
    .select(`id, soru_id, sira, isaretlenen, dogru, sure_sn, emin_degil, aciklama_bakildi, sorular(${alanlar})`)
    .eq("deneme_id", id)
    .order("sira", { ascending: true });

  // Kök görseli her iki modda da gerekir; açıklama görselleri yalnızca soru bankası modunda
  const baglantilar = await baglantiFn(
    (satirlar ?? []).flatMap((s) => {
      const q = s.sorular as unknown as {
        soru_gorsel?: string | null;
        soru_kitap_gorsel?: string | null;
        aciklama_gorsel?: string | null;
        aciklama_bloklar?: unknown;
        aciklama_kitap?: unknown;
      };
      return [
        q?.soru_gorsel,
        q?.soru_kitap_gorsel,
        ...(deneme.anlik ? [q?.aciklama_gorsel, ...blokYollari(q?.aciklama_bloklar), ...kitapYollari(q?.aciklama_kitap)] : []),
      ];
    }),
  );

  const sorular: CozumSorusu[] = (satirlar ?? []).map((s) => {
    const soru = s.sorular as unknown as {
      numara: number | null;
      metin: string;
      secenekler: Record<string, string>;
      ders: string | null;
      konu: string | null;
      vaka_metni?: string | null;
      soru_gorsel?: string | null;
      soru_kitap_gorsel?: string | null;
      soru_kitap_w?: number | null;
      soru_kitap_h?: number | null;
      dogru_cevap?: string | null;
      aciklama?: string | null;
      aciklama_gorsel?: string | null;
      aciklama_bloklar?: unknown;
      aciklama_kitap?: unknown;
    };
    const kitap = kitabiHazirla(soru?.aciklama_kitap, baglantilar);
    const bloklar = bloklariHazirla(soru?.aciklama_bloklar, baglantilar);
    const gorsel = soru?.aciklama_gorsel ? (baglantilar.get(soru.aciklama_gorsel) ?? null) : null;
    const acik = Boolean(deneme.anlik && (s.isaretlenen || s.aciklama_bakildi));
    const anahtar = deneme.anlik
      ? { dogruCevap: soru?.dogru_cevap ?? null, aciklama: soru?.aciklama ?? null, aciklamaGorsel: gorsel, aciklamaBloklar: bloklar, aciklamaKitap: kitap }
      : null;
    return {
      cevapId: s.id,
      soruId: s.soru_id,
      sira: s.sira,
      isaretlenen: s.isaretlenen,
      sureSn: s.sure_sn,
      numara: soru?.numara ?? null,
      metin: soru?.metin ?? "",
      secenekler: soru?.secenekler ?? {},
      ders: soru?.ders ?? null,
      konu: soru?.konu ?? null,
      vakaMetni: soru?.vaka_metni ?? null,
      soruGorsel: soru?.soru_gorsel ? (baglantilar.get(soru.soru_gorsel) ?? null) : null,
      kitapGorsel: soru?.soru_kitap_gorsel ? (baglantilar.get(soru.soru_kitap_gorsel) ?? null) : null,
      kitapBoyut: soru?.soru_kitap_w && soru?.soru_kitap_h ? ([soru.soru_kitap_w, soru.soru_kitap_h] as [number, number]) : null,
      sonuc: acik
        ? { dogru: s.dogru, dogruCevap: soru?.dogru_cevap ?? null, aciklama: soru?.aciklama ?? null, aciklamaGorsel: gorsel, aciklamaBloklar: bloklar, aciklamaKitap: kitap }
        : null,
      anahtar,
      eminDegil: Boolean(s.emin_degil),
      aciklamaBakildi: Boolean(s.aciklama_bakildi),
    };
  });

  return sorular;
}

/** Sonuç ekranının soru satırları (sunucuda ya da tarayıcıda aynı kod). */
export async function sonucSatirlari(
  supabase: SupabaseClient,
  id: string,
  baglantiFn: (yollar: (string | null | undefined)[]) => Promise<Map<string, string>>,
): Promise<SonucSatiri[]> {
  const { data: satirlar } = await supabase
    .from("cevaplar")
    .select(
      "id, soru_id, sira, isaretlenen, dogru, sure_sn, sorular(numara, metin, vaka_metni, soru_gorsel, soru_kitap_gorsel, soru_kitap_w, soru_kitap_h, secenekler, dogru_cevap, aciklama, aciklama_gorsel, aciklama_bloklar, aciklama_kitap, ders, konu, alt_konu)",
    )
    .eq("deneme_id", id)
    .order("sira", { ascending: true });

  const baglantilar = await baglantiFn(
    (satirlar ?? []).flatMap((s) => {
      const q = s.sorular as unknown as {
        soru_gorsel?: string | null;
        soru_kitap_gorsel?: string | null;
        aciklama_gorsel?: string | null;
        aciklama_bloklar?: unknown;
        aciklama_kitap?: unknown;
      };
      return [q?.soru_gorsel, q?.soru_kitap_gorsel, q?.aciklama_gorsel, ...blokYollari(q?.aciklama_bloklar), ...kitapYollari(q?.aciklama_kitap)];
    }),
  );

  const sonuclar: SonucSatiri[] = (satirlar ?? []).map((s) => {
    const soru = s.sorular as unknown as {
      numara: number | null;
      metin: string;
      vaka_metni: string | null;
      soru_gorsel: string | null;
      soru_kitap_gorsel?: string | null;
      soru_kitap_w?: number | null;
      soru_kitap_h?: number | null;
      secenekler: Record<string, string>;
      dogru_cevap: string | null;
      aciklama: string | null;
      aciklama_gorsel: string | null;
      aciklama_bloklar: unknown;
      aciklama_kitap?: unknown;
      ders: string | null;
      konu: string | null;
      alt_konu: string | null;
    };
    return {
      id: s.id,
      soruId: s.soru_id,
      sira: s.sira,
      isaretlenen: s.isaretlenen,
      dogru: s.dogru,
      sureSn: s.sure_sn,
      numara: soru?.numara ?? null,
      metin: soru?.metin ?? "",
      vakaMetni: soru?.vaka_metni ?? null,
      soruGorsel: soru?.soru_gorsel ? (baglantilar.get(soru.soru_gorsel) ?? null) : null,
      kitapGorsel: soru?.soru_kitap_gorsel ? (baglantilar.get(soru.soru_kitap_gorsel) ?? null) : null,
      kitapBoyut: soru?.soru_kitap_w && soru?.soru_kitap_h ? ([soru.soru_kitap_w, soru.soru_kitap_h] as [number, number]) : null,
      secenekler: soru?.secenekler ?? {},
      dogruCevap: soru?.dogru_cevap ?? null,
      aciklama: soru?.aciklama ?? null,
      aciklamaGorsel: soru?.aciklama_gorsel ? (baglantilar.get(soru.aciklama_gorsel) ?? null) : null,
      aciklamaBloklar: bloklariHazirla(soru?.aciklama_bloklar, baglantilar),
      aciklamaKitap: kitabiHazirla(soru?.aciklama_kitap, baglantilar),
      ders: soru?.ders ?? null,
      konu: soru?.konu ?? null,
      altKonu: soru?.alt_konu ?? null,
    };
  });

  return sonuclar;
}
