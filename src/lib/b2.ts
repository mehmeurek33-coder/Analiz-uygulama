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
  yetenekler?: string[];
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
  // Kopyalarken araya giren boşluk/satır sonu sık görülür: temizle
  const keyId = (process.env.B2_KEY_ID ?? "").trim();
  const appKey = (process.env.B2_APPLICATION_KEY ?? "").trim();
  const kimlik = Buffer.from(`${keyId}:${appKey}`).toString("base64");
  const c = await fetch(`${API}/b2_authorize_account`, { headers: { Authorization: `Basic ${kimlik}` } });
  if (!c.ok) {
    // Teşhis: gizli kısmı göstermeden biçim (keyID ~25 karakter "00" ile, applicationKey ~31 karakter "K" ile başlar)
    const bicim = `keyID ${keyId.length} karakter, "${keyId.slice(0, 2)}" ile başlıyor; applicationKey ${appKey.length} karakter, "${appKey.slice(0, 1)}" ile başlıyor`;
    throw new Error(`B2 yetki hatası: ${c.status} (${bicim})`);
  }
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
    yetenekler: depo.allowed?.capabilities ?? [],
    bitis: Date.now() + 20 * 3600 * 1000, // jeton 24 saat geçerli
  };
  return yetki;
}

/**
 * Görüntü yolları için imzalı indirme bağlantıları. Jeton 26 saat geçerli, sunucuda en çok 2 saat
 * önbellekte: verilen her bağlantı en az 24 saat çalışır (eskiden 6/5 saatti; önbelleğin sonunda
 * açılan sayfanın görselleri ~1 saat sonra yüklenmiyordu — HATALAR.md E7).
 */
export async function b2Baglantilari(yollar: string[], mutlak = false): Promise<Map<string, string>> {
  const y = await yetkilen();
  if (!indirme || indirme.bitis < Date.now()) {
    const c = await fetch(`${y.apiUrl}/b2api/v3/b2_get_download_authorization`, {
      method: "POST",
      headers: { Authorization: y.token },
      body: JSON.stringify({ bucketId: y.bucketId, fileNamePrefix: "", validDurationInSeconds: 26 * 3600 }),
    });
    if (!c.ok) throw new Error(`B2 indirme yetkisi: ${c.status}`);
    indirme = { token: (await c.json()).authorizationToken, bitis: Date.now() + 2 * 3600 * 1000 };
  }
  const harita = new Map<string, string>();
  for (const yol of yollar) {
    const ad = yol.split("/").map(encodeURIComponent).join("/");
    // Tarayıcıya giden bağlantılar aynı alan adından (/b2/...): operatör B2 indirme adresini (fNNN.backblazeb2.com)
    // engelleyince görseller açılmıyordu (HATALAR.md E8). /b2/* Cloudflare Worker'da doğrudan B2'ye, Vercel'de
    // next.config rewrite ile B2'ye iletilir. `mutlak`: sunucu/araç kullanımı için doğrudan B2 adresi.
    const yolKismi = `/file/${encodeURIComponent(y.bucketName)}/${ad}?Authorization=${indirme.token}`;
    harita.set(yol, mutlak ? `${y.downloadUrl}${yolKismi}` : `/b2${yolKismi}`);
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
    let c: Response;
    try {
      c = await fetch(yukleme.url, {
        method: "POST",
        headers: {
          Authorization: yukleme.token,
          "X-Bz-File-Name": yol.split("/").map(encodeURIComponent).join("/"),
          "Content-Type": tur,
          "X-Bz-Content-Sha1": sha1,
        },
        body: new Uint8Array(icerik),
      });
    } catch (e) {
      // Önbellekteki yükleme adresinin sunucusu kapanmış olabilir ("fetch failed"): adresi bırak, yenisiyle dene.
      // Bırakılmazsa sıcak kalan örnekteki bütün yüklemeler aynı ölü adrese gidip başarısız oluyordu (HATALAR E9).
      yukleme = null;
      if (deneme === 2) throw e;
      continue;
    }
    if (c.ok) return (await c.json()).fileId as string;
    // Yükleme adresi meşgul/süresi dolmuş olabilir: yenisini al ve tekrar dene
    yukleme = null;
    if (c.status === 401) yetki = null;
    if (deneme === 2) throw new Error(`B2 yükleme: ${c.status} ${(await c.text()).slice(0, 200)}`);
  }
  throw new Error("B2 yükleme başarısız");
}

/** Depodaki dosyaları listeler (en fazla 1000; kullanıcının yüklediği kaynak PDF'leri bulmak için). */
export async function b2Listele(onek = "") {
  const y = await yetkilen();
  const c = await fetch(`${y.apiUrl}/b2api/v3/b2_list_file_names`, {
    method: "POST",
    headers: { Authorization: y.token },
    body: JSON.stringify({ bucketId: y.bucketId, prefix: onek, maxFileCount: 1000 }),
  });
  if (!c.ok) throw new Error(`B2 listeleme: ${c.status}`);
  const v = await c.json();
  return (v.files ?? []).map((f: { fileName: string; contentLength: number; uploadTimestamp: number }) => ({
    ad: f.fileName,
    boyut: f.contentLength,
    yuklendi: new Date(f.uploadTimestamp).toISOString(),
  }));
}

/** Tüm dosya sürümleri (bakım için; sayfa sayfa). */
export async function b2Surumler() {
  const y = await yetkilen();
  const sonuc: { ad: string; id: string; boyut: number; zaman: number; eylem: string }[] = [];
  let ad: string | null = null;
  let id: string | null = null;
  for (let i = 0; i < 50; i++) {
    const c: Response = await fetch(`${y.apiUrl}/b2api/v3/b2_list_file_versions`, {
      method: "POST",
      headers: { Authorization: y.token },
      body: JSON.stringify({ bucketId: y.bucketId, maxFileCount: 10000, startFileName: ad ?? undefined, startFileId: id ?? undefined }),
    });
    if (!c.ok) throw new Error(`B2 sürüm listesi: ${c.status} ${(await c.text()).slice(0, 150)}`);
    const v: {
      files?: { fileName: string; fileId: string; contentLength: number; uploadTimestamp: number; action: string }[];
      nextFileName?: string | null;
      nextFileId?: string | null;
    } = await c.json();
    for (const f of v.files ?? [])
      sonuc.push({ ad: f.fileName, id: f.fileId, boyut: f.contentLength, zaman: f.uploadTimestamp, eylem: f.action });
    ad = v.nextFileName ?? null;
    id = v.nextFileId ?? null;
    if (!ad) break;
  }
  return { surumler: sonuc, yetenekler: y.yetenekler ?? [] };
}

/** Tek bir dosya sürümünü siler. */
export async function b2SurumSil(ad: string, id: string) {
  const y = await yetkilen();
  const c = await fetch(`${y.apiUrl}/b2api/v3/b2_delete_file_version`, {
    method: "POST",
    headers: { Authorization: y.token },
    body: JSON.stringify({ fileName: ad, fileId: id }),
  });
  if (!c.ok) throw new Error(`B2 silme: ${c.status} ${(await c.text()).slice(0, 150)}`);
}
