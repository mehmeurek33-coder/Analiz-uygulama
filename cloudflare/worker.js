// analiz-uygulama.vercel.app için ara adres (operatör vercel.app'i engellediğinde)
const HEDEF = "https://analiz-uygulama.vercel.app";

export default {
  async fetch(istek) {
    const url = new URL(istek.url);
    const cevap = await fetch(new Request(HEDEF + url.pathname + url.search, istek), { redirect: "manual" });
    const basliklar = new Headers(cevap.headers);
    const yon = basliklar.get("location");
    if (yon) basliklar.set("location", yon.replace(HEDEF, url.origin));
    return new Response(cevap.body, { status: cevap.status, statusText: cevap.statusText, headers: basliklar });
  },
};
