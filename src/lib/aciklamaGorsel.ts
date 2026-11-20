import { yoneticiIstemcisi } from "@/lib/supabase/admin";

/**
 * Açıklama görüntüleri gizli "aciklamalar" deposunda. Sayfa yüklenirken tek istekle
 * imzalı bağlantılar üretilir (6 saat geçerli). Hata olursa boş döner; arayüz metne düşer.
 */
export async function gorselBaglantilari(yollar: (string | null | undefined)[]): Promise<Map<string, string>> {
  const tekil = [...new Set(yollar.filter((y): y is string => Boolean(y)))];
  const harita = new Map<string, string>();
  if (tekil.length === 0) return harita;
  try {
    const { data } = await yoneticiIstemcisi().storage.from("aciklamalar").createSignedUrls(tekil, 6 * 3600);
    for (const x of data ?? []) if (x.path && x.signedUrl) harita.set(x.path, x.signedUrl);
  } catch {
    // depo erişilemezse metin açıklama gösterilir
  }
  return harita;
}
