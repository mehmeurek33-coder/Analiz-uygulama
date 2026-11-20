import { createHash } from "node:crypto";

/**
 * Backblaze B2 (yerel API v3). Açıklama/soru görüntüleri burada: gizli depo, 10 GB ücretsiz.
 * Ortam: B2_KEY_ID, B2_APPLICATION_KEY (gizli, kullanıcı Vercel'e girer), B2_BUCKET (depo adı).
 * Endpoint gerekmez: b2_authorize_account cevabından öğrenilir.
 *
 * İndirme: depo genelinde geçerli tek bir "download authorization" jetonu alınır (saatler
 * geçerli, önbellekte), her görüntü bağlantısı ağ isteği olmadan bununla kurulur.
 */
const API = "https://api.backblazeb2.com/b2api/v3";

type Yetki = {
  apiUrl: string;
  downloadUrl: string;
  token: string;
  bucketId: string;
  bucketName: string;
  bitis: number;
};

let yetki: Yetki | null = null;
let indirme: { token: string; bitis: number } | null = null;
let yukleme: { url: string; token: string } | null = null;

export function b2Hazir() {
  return Boolean(process.env.B2_KEY_ID && process.env.B2_APPLICATION_KEY && process.env.B2_BUCKET);
}

async function yetkilen(): Promise<Yetki> {
  if (yetki && yetki.bitis > Date.now()) return yetki;
  const kimlik = Buffer.from(`${process.env.B2_KEY_ID}:${process.env.B2_APPLICATION_KEY}`).toString("base64");
  const c = await fetch(`${API}/b2_authorize_account`, { headers: { Authorization: `Basic ${kimlik}` } });
  if (!c.ok) throw new Error(`B2 yetki hatası: ${c.status}`);
  const v = await c.json();
  const depo = v.apiInfo.storageApi;
  const ad = process.env.B2_BUCKET!;
  let bucketId: string | undefined = (depo.allowed?.buckets ?? []).find((b: { name: string }) => b.name === ad)?.id;
  if (!bucketId) {
    const l = await fetch(`${depo.apiUrl}/b2api/v3/b2_list_buckets`, {
      method: "POST",
      headers: { Authorization: v.authorizationToken },
      body: JSON.stringify({ accountId: v.accountId, bucketName: ad }),
    });
    bucketId = (await l.json()).buckets?.[0]?.bucketId;
  }
  if (!bucketId) throw new Error(`B2 deposu bulunamadı: ${ad}`);
  yetki = {
    apiUrl: depo.apiUrl,
    downloadUrl: depo.downloadUrl,
    token: v.authorizationToken,
    bucketId,
    bucketName: ad,
    bitis: Date.now() + 20 * 3600 * 1000, // jeton 24 saat geçerli
  };
  return yetki;
}

/** Görüntü yolları için imzalı indirme bağlantıları (tek ağ isteği, 6 saat geçerli). */
export async function b2Baglantilari(yollar: string[]): Promise<Map<string, string>> {
  const y = await yetkilen();
  if (!indirme || indirme.bitis < Date.now()) {
    const c = await fetch(`${y.apiUrl}/b2api/v3/b2_get_download_authorization`, {
      method: "POST",
      headers: { Authorization: y.token },
      body: JSON.stringify({ bucketId: y.bucketId, fileNamePrefix: "", validDurationInSeconds: 6 * 3600 }),
    });
    if (!c.ok) throw new Error(`B2 indirme yetkisi: ${c.status}`);
    indirme = { token: (await c.json()).authorizationToken, bitis: Date.now() + 5 * 3600 * 1000 };
  }
  const harita = new Map<string, string>();
  for (const yol of yollar) {
    const ad = yol.split("/").map(encodeURIComponent).join("/");
    harita.set(yol, `${y.downloadUrl}/file/${encodeURIComponent(y.bucketName)}/${ad}?Authorization=${indirme.token}`);
  }
  return harita;
}

/** Dosya yükler (aynı adla yeniden yükleme yeni sürüm olur; indirme hep en yenisini verir). */
export async function b2Yukle(yol: string, icerik: Buffer, tur: string) {
  const sha1 = createHash("sha1").update(icerik).digest("hex");
  for (let deneme = 0; deneme < 3; deneme++) {
    const y = await yetkilen();
    if (!yukleme) {
      const c = await fetch(`${y.apiUrl}/b2api/v3/b2_get_upload_url`, {
        method: "POST",
        headers: { Authorization: y.token },
        body: JSON.stringify({ bucketId: y.bucketId }),
      });
      if (!c.ok) throw new Error(`B2 yükleme adresi: ${c.status}`);
      const v = await c.json();
      yukleme = { url: v.uploadUrl, token: v.authorizationToken };
    }
    const c = await fetch(yukleme.url, {
      method: "POST",
      headers: {
        Authorization: yukleme.token,
        "X-Bz-File-Name": yol.split("/").map(encodeURIComponent).join("/"),
        "Content-Type": tur,
        "X-Bz-Content-Sha1": sha1,
      },
      body: new Uint8Array(icerik),
    });
    if (c.ok) return (await c.json()).fileId as string;
    // Yükleme adresi meşgul/süresi dolmuş olabilir: yenisini al ve tekrar dene
    yukleme = null;
    if (c.status === 401) yetki = null;
    if (deneme === 2) throw new Error(`B2 yükleme: ${c.status} ${(await c.text()).slice(0, 200)}`);
  }
  throw new Error("B2 yükleme başarısız");
}
