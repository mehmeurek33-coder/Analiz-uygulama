import { b2Baglantilari, b2Hazir } from "@/lib/b2";
import { yoneticiIstemcisi } from "@/lib/supabase/admin";

/**
 * Açıklama/soru görüntüleri için imzalı bağlantılar. GORSEL_DEPO=b2 ve B2 anahtarları
 * tanımlıysa Backblaze B2'den (ağ isteği önbellekli), değilse Supabase "aciklamalar"
 * deposundan (tek istek). Hata olursa boş döner; arayüz metin açıklamaya düşer.
 */
export async function gorselBaglantilari(yollar: (string | null | undefined)[]): Promise<Map<string, string>> {
  const tekil = [...new Set(yollar.filter((y): y is string => Boolean(y)))];
  if (tekil.length === 0) return new Map();
  try {
    if (process.env.GORSEL_DEPO === "b2" && b2Hazir()) return await b2Baglantilari(tekil);
    const harita = new Map<string, string>();
    const { data } = await yoneticiIstemcisi().storage.from("aciklamalar").createSignedUrls(tekil, 6 * 3600);
    for (const x of data ?? []) if (x.path && x.signedUrl) harita.set(x.path, x.signedUrl);
    return harita;
  } catch {
    return new Map();
  }
}
