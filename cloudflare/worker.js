// <proje>.vercel.app için ara adres (operatör vercel.app'i engellediğinde).
// Hedef adres Worker ayarlarında HEDEF değişkeniyle verilir (yoksa aşağıdaki varsayılan).
const VARSAYILAN_HEDEF = "https://analiz-uygulama.vercel.app";

export default {
  async fetch(istek, env) {
    const HEDEF = (env && env.HEDEF) || VARSAYILAN_HEDEF;
    const url = new URL(istek.url);
    const cevap = await fetch(new Request(HEDEF + url.pathname + url.search, istek), { redirect: "manual" });
    const basliklar = new Headers(cevap.headers);
    const yon = basliklar.get("location");
    if (yon) basliklar.set("location", yon.replace(HEDEF, url.origin));
    return new Response(cevap.body, { status: cevap.status, statusText: cevap.statusText, headers: basliklar });
  },
};
