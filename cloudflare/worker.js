// <proje>.vercel.app için ara adres (operatör vercel.app'i engellediğinde).
// Hedef adres Worker ayarlarında HEDEF değişkeniyle verilir (yoksa aşağıdaki varsayılan).
const VARSAYILAN_HEDEF = "https://analiz-uygulama.vercel.app";
// Görseller: /b2/file/<depo>/<yol>?Authorization=... doğrudan Backblaze'e (operatör B2 adresini engelleyebiliyor)
const VARSAYILAN_B2 = "https://f003.backblazeb2.com";

export default {
  async fetch(istek, env) {
    const HEDEF = (env && env.HEDEF) || VARSAYILAN_HEDEF;
    const url = new URL(istek.url);
    if (url.pathname.startsWith("/b2/file/")) {
      const B2 = (env && env.B2) || VARSAYILAN_B2;
      const c = await fetch(B2 + url.pathname.slice(3) + url.search, { cf: { cacheEverything: true, cacheTtl: 86400 } });
      const b = new Headers(c.headers);
      if (c.ok) b.set("cache-control", "private, max-age=86400");
      return new Response(c.body, { status: c.status, headers: b });
    }
    const cevap = await fetch(new Request(HEDEF + url.pathname + url.search, istek), { redirect: "manual" });
    const basliklar = new Headers(cevap.headers);
    const yon = basliklar.get("location");
    if (yon) basliklar.set("location", yon.replace(HEDEF, url.origin));
    return new Response(cevap.body, { status: cevap.status, statusText: cevap.statusText, headers: basliklar });
  },
};
