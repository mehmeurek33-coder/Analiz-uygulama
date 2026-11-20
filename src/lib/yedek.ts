import { gzipSync } from "node:zlib";
import { yoneticiIstemcisi } from "@/lib/supabase/admin";

/**
 * Veritabanı yedeği: her tablo ayrı bir .json.gz dosyası olarak gizli "yedekler"
 * deposuna yazılır (yedekler/<YYYY-MM-DD_HHmm>/<tablo>.json.gz). Son SAKLA adet tutulur.
 * Vercel cron 3 günde bir çağırır; uygulamadaki Yedek sayfasından elle de alınabilir.
 */
export const TABLOLAR = ["kullanici_profil", "soru_setleri", "sorular", "denemeler", "cevaplar"] as const;
const DEPO = "yedekler";
const SAKLA = 10;

export type YedekOzeti = { klasor: string; dosyalar: { ad: string; satir: number; bayt: number }[] };

export async function yedekAl(): Promise<YedekOzeti> {
  const db = yoneticiIstemcisi();
  const d = new Date();
  const iki = (n: number) => String(n).padStart(2, "0");
  // Türkiye saatiyle klasör adı (UTC+3)
  const tr = new Date(d.getTime() + 3 * 3600 * 1000);
  const klasor = `${tr.getUTCFullYear()}-${iki(tr.getUTCMonth() + 1)}-${iki(tr.getUTCDate())}_${iki(tr.getUTCHours())}${iki(tr.getUTCMinutes())}`;

  const dosyalar: YedekOzeti["dosyalar"] = [];
  for (const tablo of TABLOLAR) {
    // PostgREST bir istekte en fazla 1000 satır verir: sayfa sayfa çek
    const satirlar: unknown[] = [];
    for (let bas = 0; ; bas += 1000) {
      const { data, error } = await db
        .from(tablo)
        .select("*")
        .order("id", { ascending: true })
        .range(bas, bas + 999);
      if (error) throw new Error(`${tablo}: ${error.message}`);
      satirlar.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const icerik = gzipSync(Buffer.from(JSON.stringify(satirlar)));
    const ad = `${tablo}.json.gz`;
    const { error } = await db.storage
      .from(DEPO)
      .upload(`${klasor}/${ad}`, icerik, { contentType: "application/gzip", upsert: true });
    if (error) throw new Error(`${ad} yüklenemedi: ${error.message}`);
    dosyalar.push({ ad, satir: satirlar.length, bayt: icerik.length });
  }

  // Bilgi dosyası: hangi tabloda kaç satır var (geri yüklerken kontrol için)
  await db.storage
    .from(DEPO)
    .upload(`${klasor}/bilgi.json`, Buffer.from(JSON.stringify({ tarih: d.toISOString(), dosyalar }, null, 1)), {
      contentType: "application/json",
      upsert: true,
    });

  await eskileriSil();
  return { klasor, dosyalar };
}

/** Yedek klasörleri, yeniden eskiye. */
export async function yedekleriListele() {
  const db = yoneticiIstemcisi();
  const { data, error } = await db.storage.from(DEPO).list("", { limit: 1000, sortBy: { column: "name", order: "desc" } });
  if (error) throw new Error(error.message);
  const klasorler = (data ?? []).filter((x) => !x.id).map((x) => x.name); // klasörlerin id'si yok
  return Promise.all(
    klasorler.map(async (klasor) => {
      const { data: icerik } = await db.storage.from(DEPO).list(klasor, { limit: 100 });
      const dosyalar = (icerik ?? []).map((f) => ({
        ad: f.name,
        bayt: Number((f.metadata as { size?: number } | null)?.size ?? 0),
      }));
      return { klasor, dosyalar };
    }),
  );
}

export async function indirmeBaglantisi(yol: string) {
  const db = yoneticiIstemcisi();
  const { data, error } = await db.storage.from(DEPO).createSignedUrl(yol, 600, { download: true });
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

async function eskileriSil() {
  const db = yoneticiIstemcisi();
  const liste = await yedekleriListele();
  for (const eski of liste.slice(SAKLA)) {
    await db.storage.from(DEPO).remove(eski.dosyalar.map((f) => `${eski.klasor}/${f.ad}`));
  }
}
