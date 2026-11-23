// Soru Analiz servis çalışanı (tablette önbellek, internetsiz çalışma).
// - Görseller (/b2/file/...): bağlantıdaki geçici jeton (?Authorization=) yok sayılır, yol anahtar olur;
//   bir kez inen görüntü tablette kalır, tekrar açılışta ağa gitmeden gelir. 7 günden eskiyse arka planda tazelenir.
// - Uygulama dosyaları (/_next/static/, adları içerik özetli): önce önbellek.
// - Sayfalar: önce ağ; ağ yoksa (ya da 8 sn'de yanıt gelmezse) son açılan hâli.
// - POST istekleri (cevap kaydı) buraya girmez; çevrimdışı cevaplar sayfadaki kuyrukta bekler (src/lib/cevrimdisi.ts).
const GORSEL = "gorsel-v1";
const STATIK = "statik-v1";
const SAYFA = "sayfa-v1";
const VERI = "veri-v1"; // sayfanın kendisi yazar: bölümlerin soru verisi (internetsiz açılış için)
const TUTULAN = [GORSEL, STATIK, SAYFA, VERI];
const TAZELE_MS = 7 * 24 * 3600 * 1000;
const SAYFA_BEKLE_MS = 8000;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const ad of await caches.keys()) if (!TUTULAN.includes(ad)) await caches.delete(ad);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.origin !== self.location.origin) return;
  if (u.pathname.startsWith("/b2/file/")) e.respondWith(gorsel(e, r, u));
  else if (u.pathname.startsWith("/_next/static/")) e.respondWith(statik(r));
  else if (r.mode === "navigate" && !u.pathname.startsWith("/api/")) e.respondWith(sayfa(r, u));
});

// Arka plan indirmesi (Background Fetch, /indir sayfası): bitince ya da kısmen bitince inenleri önbelleğe yaz
self.addEventListener("backgroundfetchsuccess", (e) => e.waitUntil(bgKaydet(e, true)));
self.addEventListener("backgroundfetchfail", (e) => e.waitUntil(bgKaydet(e, false)));
self.addEventListener("backgroundfetchclick", (e) => e.waitUntil(self.clients.openWindow("/indir")));

async function bgKaydet(e, tamam) {
  const c = await caches.open(GORSEL);
  let inen = 0;
  let inmeyen = 0;
  for (const k of await e.registration.matchAll()) {
    try {
      const y = await k.responseReady;
      if (!y || y.status !== 200) throw new Error();
      const govde = await y.blob();
      const u = new URL(k.request.url);
      await c.put(
        u.origin + u.pathname,
        new Response(govde, { headers: { "Content-Type": y.headers.get("Content-Type") || "image/webp", "x-sa-zaman": String(Date.now()) } }),
      );
      inen++;
    } catch {
      inmeyen++;
    }
  }
  try {
    await e.updateUI({
      title: tamam && !inmeyen ? `✓ ${inen} görüntü tablete indi` : `${inen} görüntü indi, ${inmeyen} inmedi: İndir sayfasından tekrar başlat`,
    });
  } catch {
    /* */
  }
}

async function gorsel(e, r, u) {
  const anahtar = u.origin + u.pathname;
  const c = await caches.open(GORSEL);
  const eski = await c.match(anahtar);
  if (eski) {
    const zaman = Number(eski.headers.get("x-sa-zaman") || 0);
    if (Date.now() - zaman > TAZELE_MS) e.waitUntil(gorselIndir(r, c, anahtar).catch(() => {}));
    return eski;
  }
  return gorselIndir(r, c, anahtar);
}

async function gorselIndir(r, c, anahtar) {
  const y = await fetch(r.url, { credentials: "same-origin" });
  if (y.status === 200) {
    const govde = await y.clone().blob();
    await c.put(
      anahtar,
      new Response(govde, {
        headers: { "Content-Type": y.headers.get("Content-Type") || "image/webp", "x-sa-zaman": String(Date.now()) },
      }),
    );
  }
  return y;
}

async function statik(r) {
  const c = await caches.open(STATIK);
  const eski = await c.match(r, { ignoreVary: true });
  if (eski) return eski;
  const y = await fetch(r);
  if (y.status === 200) {
    await c.put(r, y.clone());
    budamaDene(c, 600);
  }
  return y;
}

let budaniyor = false;
async function budamaDene(c, sinir) {
  if (budaniyor) return;
  budaniyor = true;
  try {
    const anahtarlar = await c.keys();
    // En eski eklenenler önce (eski sürümlerin dosyaları)
    for (const k of anahtarlar.slice(0, Math.max(0, anahtarlar.length - sinir))) await c.delete(k);
  } finally {
    budaniyor = false;
  }
}

async function sayfa(r, u) {
  const anahtar = u.origin + u.pathname;
  const c = await caches.open(SAYFA);
  const ag = fetch(r).then(async (y) => {
    if (y.status === 200 && y.type === "basic" && !y.redirected) {
      await c.put(anahtar, y.clone());
      budamaDene(c, 200);
    }
    return y;
  });
  const eski = c.match(anahtar);
  try {
    return await Promise.race([
      ag,
      new Promise((coz, red) =>
        setTimeout(async () => {
          // Ağ yavaş: elde eski hâli varsa onu ver, yoksa ağı beklemeye devam et
          const k = await eski;
          if (k) coz(k);
          else ag.then(coz, red);
        }, SAYFA_BEKLE_MS),
      ),
    ]);
  } catch {
    const k = await eski;
    if (k) return k;
    return new Response(CEVRIMDISI, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}

const CEVRIMDISI = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>İnternet yok</title><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#0b1120;color:#e5e7eb;font:16px system-ui,sans-serif;padding:16px}
a{color:#34d399}div{max-width:28rem}</style></head><body><div><h1 style="font-size:20px">İnternet bağlantısı yok</h1>
<p>Bu sayfa tablete henüz kaydedilmemiş. İnternet varken bir kez açılan bölümler (ve "Tablete indir" ile indirilenler) bağlantısız da açılır.</p>
<p><a href="/">Panele dön</a></p></div></body></html>`;
