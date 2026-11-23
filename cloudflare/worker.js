// <proje>.vercel.app için ara adres (operatör vercel.app'i engellediğinde).
// Hedef adres Worker ayarlarında HEDEF değişkeniyle verilir (yoksa aşağıdaki varsayılan).
const VARSAYILAN_HEDEF = "https://analiz-uygulama.vercel.app";
// Görseller: /b2/file/<depo>/<yol>?Authorization=... doğrudan Backblaze'e (operatör B2 adresini engelleyebiliyor)
const VARSAYILAN_B2 = "https://f003.backblazeb2.com";
// Ağır sayfa verisi (sorular, açıklamalar) tarayıcıdan doğrudan Supabase'e: /sb/* -> Supabase (Vercel'den geçmez,
// Vercel Fast Origin Transfer kotası, HATALAR E10). Yetki tarayıcının Supabase oturum jetonu (RLS).
const VARSAYILAN_SUPABASE = "https://lbprozrznswlyqwybenw.supabase.co";

export default {
  async fetch(istek, env) {
    const HEDEF = (env && env.HEDEF) || VARSAYILAN_HEDEF;
    const url = new URL(istek.url);
    // Toplu yükleme: dosya doğrudan B2'ye (Vercel'den geçmez). Hedef yalnızca B2 yükleme sunucusu olabilir;
    // yetki, Vercel'in verdiği B2 yükleme jetonudur (jetonsuz istek B2'de reddedilir).
    if (url.pathname === "/b2-yukle" && istek.method === "POST") {
      const hedef = istek.headers.get("x-b2-url") || "";
      if (!/^https:\/\/pod-[\w-]+\.backblaze\.com\/b2api\/v\d\/b2_upload_file\//.test(hedef)) {
        return new Response(JSON.stringify({ hata: "gecersiz hedef" }), { status: 400 });
      }
      const b = new Headers();
      for (const k of ["authorization", "x-bz-file-name", "content-type", "x-bz-content-sha1"]) {
        const v = istek.headers.get(k);
        if (v) b.set(k, v);
      }
      const c = await fetch(hedef, { method: "POST", headers: b, body: istek.body });
      return new Response(c.body, { status: c.status, headers: { "content-type": "application/json" } });
    }
    if (url.pathname.startsWith("/sb/")) {
      const SB = (env && env.SUPABASE) || VARSAYILAN_SUPABASE;
      const b = new Headers(istek.headers);
      b.delete("cookie"); // uygulama çerezleri Supabase'e gitmesin
      return fetch(SB + url.pathname.slice(3) + url.search, {
        method: istek.method,
        headers: b,
        body: ["GET", "HEAD"].includes(istek.method) ? undefined : istek.body,
      });
    }
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
