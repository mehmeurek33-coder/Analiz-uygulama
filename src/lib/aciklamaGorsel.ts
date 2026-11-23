import { b2Baglantilari, b2Hazir } from "@/lib/b2";
import { yoneticiIstemcisi } from "@/lib/supabase/admin";

export { blokYollari, bloklariHazirla, kitapYollari, kitabiHazirla } from "@/lib/gorselYardim";

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

/**
 * Tarayıcının görsel bağlantılarını kendisi kurması için şablon: bağlantı = onek + kodlanmış yol + ek.
 * (Sayfa verisi tarayıcıya Vercel'den geçmeden gelir; Vercel'den yalnızca bu küçük şablon alınır, HATALAR E10.)
 */
export async function gorselSablonu(): Promise<{ onek: string; ek: string } | null> {
  if (process.env.GORSEL_DEPO !== "b2" || !b2Hazir()) return null;
  const ornek = (await b2Baglantilari(["x"])).get("x")!;
  const i = ornek.indexOf("/x?");
  return { onek: ornek.slice(0, i + 1), ek: ornek.slice(i + 2) };
}
