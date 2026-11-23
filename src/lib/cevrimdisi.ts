"use client";

/**
 * İnternetsiz çalışma (tablet). Üç parça:
 * 1. Kayıt kuyruğu: cevap / "emin değilim" / "açıklamaya bakıldı" kaydı ağ yokken localStorage'da bekler,
 *    bağlantı gelince sırayla gönderilir (sıra korunur: aynı soruya sonraki işlem öncekini ezer).
 * 2. Yerel iz: bir bölümde yapılan her işlem (soru → son durum). Bölüm internetsiz açılınca ya da kuyrukta
 *    gönderilmemiş iş varken, sunucudan gelen eski veri bu izle tamamlanır.
 * 3. Bölüm verisi: çözüm ekranının sorular listesi Cache API'de (`veri-v1`, public/sw.js ile ortak); internet
 *    yokken bölüm buradan açılır. Görseller servis çalışanının önbelleğinde (public/sw.js).
 */

import type { CozumSorusu } from "@/components/CozumEkrani";

type Is = { url: string; govde: { denemeId?: string; [k: string]: unknown } };
const KUYRUK = "sa-kuyruk";
const OLAY = "sa-kuyruk";

function kuyrukOku(): Is[] {
  try {
    return JSON.parse(localStorage.getItem(KUYRUK) || "[]") as Is[];
  } catch {
    return [];
  }
}
function kuyrukYaz(l: Is[]) {
  try {
    localStorage.setItem(KUYRUK, JSON.stringify(l));
  } catch {
    /* depolama dolu/kapalı */
  }
  window.dispatchEvent(new Event(OLAY));
}

export function bekleyenSayisi(denemeId?: string) {
  const l = kuyrukOku();
  return denemeId ? l.filter((i) => i.govde.denemeId === denemeId).length : l.length;
}

/** Kuyruk değişince (ekleme/gönderme) çağrılır; kaldırma fonksiyonu döner. */
export function kuyrukDinle(f: () => void) {
  window.addEventListener(OLAY, f);
  window.addEventListener("storage", f);
  return () => {
    window.removeEventListener(OLAY, f);
    window.removeEventListener("storage", f);
  };
}

let bosaltma: Promise<boolean> | null = null;

/** Kuyruktakileri sırayla gönderir. Hepsi gittiyse true; ağ yoksa ya da sunucu hata verdiyse false (iş kalır). */
export function kuyruguBosalt(): Promise<boolean> {
  if (bosaltma) return bosaltma;
  bosaltma = (async () => {
    try {
      for (;;) {
        const l = kuyrukOku();
        if (l.length === 0) return true;
        const is = l[0];
        let durum: number;
        try {
          const c = await fetch(is.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(is.govde),
            credentials: "same-origin",
          });
          durum = c.status;
        } catch {
          return false; // ağ yok
        }
        // 401: oturum düşmüş, 5xx: sunucu geçici; iş kalır. Diğer 4xx (ör. bitmiş deneme): gönderilemez, atılır.
        if (durum === 401 || durum >= 500) return false;
        const simdi = kuyrukOku();
        if (simdi.length && simdi[0].url === is.url && JSON.stringify(simdi[0].govde) === JSON.stringify(is.govde)) simdi.shift();
        kuyrukYaz(simdi);
      }
    } finally {
      bosaltma = null;
    }
  })();
  return bosaltma;
}

/** Ağ hatası mı (ya da Worker'ın Vercel'e ulaşamadığı geçici hata)? Bu durumda iş kuyruğa alınır. */
export function gecici(e: unknown, durum?: number) {
  return e instanceof TypeError || durum === 502 || durum === 503 || durum === 504;
}

/**
 * Kaydı gönderir; ağ yoksa (ya da kuyrukta sırası gelmemiş iş varsa) kuyruğa alır.
 * Dönen değer: sunucu yanıtı (ağdan gittiyse) ya da "kuyrukta".
 */
export async function kaydet(url: string, govde: Is["govde"]): Promise<Response | "kuyrukta"> {
  if (kuyrukOku().length > 0) {
    kuyrukYaz([...kuyrukOku(), { url, govde }]);
    void kuyruguBosalt();
    return "kuyrukta";
  }
  try {
    const c = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(govde),
      credentials: "same-origin",
    });
    if (gecici(null, c.status)) {
      kuyrukYaz([...kuyrukOku(), { url, govde }]);
      return "kuyrukta";
    }
    return c;
  } catch (e) {
    if (!gecici(e)) throw e;
    kuyrukYaz([...kuyrukOku(), { url, govde }]);
    return "kuyrukta";
  }
}

// ---------------------------------------------------------------- yerel iz
type Iz = { i?: string | null; b?: boolean; e?: boolean };
const izAnahtari = (denemeId: string) => `sa-iz:${denemeId}`;

function izOku(denemeId: string): Record<string, Iz> {
  try {
    return JSON.parse(localStorage.getItem(izAnahtari(denemeId)) || "{}") as Record<string, Iz>;
  } catch {
    return {};
  }
}

export function izYaz(denemeId: string, soruId: string, deg: Iz) {
  try {
    const iz = izOku(denemeId);
    iz[soruId] = { ...iz[soruId], ...deg };
    localStorage.setItem(izAnahtari(denemeId), JSON.stringify(iz));
  } catch {
    /* depolama yok */
  }
}

export function izSil(denemeId: string) {
  try {
    localStorage.removeItem(izAnahtari(denemeId));
  } catch {
    /* */
  }
}

/** Yüklenen (eski olabilecek) veriyi yerel izle tamamlar: cevaplanmamış görünen ama tablette cevaplanmış sorular. */
export function izUygula(denemeId: string, sorular: CozumSorusu[], anlik: boolean): CozumSorusu[] {
  const iz = izOku(denemeId);
  return sorular.map((s) => {
    const z = iz[s.soruId];
    if (!z) return s;
    const k = { ...s };
    if (z.i !== undefined && (!anlik || !k.isaretlenen)) k.isaretlenen = z.i;
    if (z.b && !k.aciklamaBakildi && !k.isaretlenen) k.aciklamaBakildi = true;
    if (z.e !== undefined) k.eminDegil = z.e;
    if (anlik && k.anahtar && !k.sonuc && (k.isaretlenen || k.aciklamaBakildi)) {
      const a = k.anahtar;
      k.sonuc = {
        dogru: k.isaretlenen && a.dogruCevap ? k.isaretlenen === a.dogruCevap : null,
        dogruCevap: a.dogruCevap,
        aciklama: a.aciklama,
        aciklamaGorsel: a.aciklamaGorsel,
        aciklamaBloklar: a.aciklamaBloklar,
        aciklamaKitap: a.aciklamaKitap,
      };
    }
    return k;
  });
}

// ---------------------------------------------------------------- bölüm verisi (Cache API)
const VERI = "veri-v1";
const veriAnahtari = (denemeId: string) => `/yerel/deneme/${denemeId}`;

export async function bolumSakla(denemeId: string, sorular: CozumSorusu[]) {
  try {
    const c = await caches.open(VERI);
    await c.put(veriAnahtari(denemeId), new Response(JSON.stringify(sorular), { headers: { "Content-Type": "application/json" } }));
  } catch {
    /* Cache API yok (özel pencere vb.) */
  }
}

export async function bolumOku(denemeId: string): Promise<CozumSorusu[] | null> {
  try {
    const c = await caches.open(VERI);
    const y = await c.match(veriAnahtari(denemeId));
    return y ? ((await y.json()) as CozumSorusu[]) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- görseller (public/sw.js ile aynı önbellek ve anahtar)
const GORSEL = "gorsel-v1";
/** Önbellek anahtarı: bağlantıdaki geçici jeton (?Authorization=) atılır, yol kalır (sw.js ile aynı). */
const gorselAnahtari = (url: string) => {
  const u = new URL(url, window.location.origin);
  return u.origin + u.pathname;
};

/** Tablette kayıtlı görsellerin anahtarları. */
export async function tablettekiGorseller(): Promise<Set<string>> {
  try {
    const c = await caches.open(GORSEL);
    return new Set((await c.keys()).map((r) => gorselAnahtari(r.url)));
  } catch {
    return new Set();
  }
}

export function tablettemi(url: string, kayitli: Set<string>) {
  return kayitli.has(gorselAnahtari(url));
}

/**
 * Görselleri indirip doğrudan önbelleğe yazar (servis çalışanı etkin olmasa da olur); tablette olanlar atlanır.
 * `iptal.dur = true` yapılınca durur. Ekran kapanmasın diye mümkünse ekran kilidi alınır.
 */
export async function gorselleriIndir(
  urller: string[],
  ilerleme: (biten: number, toplam: number, bayt: number) => void,
  iptal: { dur: boolean } = { dur: false },
) {
  const kayitli = await tablettekiGorseller();
  const liste = [...new Set(urller)].filter((u) => !kayitli.has(gorselAnahtari(u)));
  const toplam = liste.length;
  let biten = 0;
  let hatali = 0;
  let bayt = 0;
  // Backblaze günlük ücretsiz sınırı (403 download/transaction cap) ya da istek sınırı (429): art arda gelirse dur
  let sinirArt = 0;
  let sinir = false;
  ilerleme(0, toplam, 0);
  let kilit: { release: () => Promise<void> } | null = null;
  try {
    kilit = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen") ?? null;
  } catch {
    /* desteklenmiyor */
  }
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* */
  }
  const c = await caches.open(GORSEL);
  const isci = async () => {
    for (;;) {
      if (iptal.dur) return;
      const u = liste.pop();
      if (!u) return;
      try {
        const y = await fetch(u, { credentials: "same-origin", cache: "no-store" });
        if (y.status === 403 || y.status === 429) {
          if (++sinirArt >= 5) {
            sinir = true;
            iptal.dur = true;
          }
          throw new Error(String(y.status));
        }
        if (y.status !== 200) throw new Error(String(y.status));
        sinirArt = 0;
        const govde = await y.blob();
        bayt += govde.size;
        await c.put(
          gorselAnahtari(u),
          new Response(govde, {
            headers: { "Content-Type": y.headers.get("Content-Type") || "image/webp", "x-sa-zaman": String(Date.now()) },
          }),
        );
      } catch {
        hatali++;
      }
      ilerleme(++biten, toplam, bayt);
    }
  };
  await Promise.all(Array.from({ length: 6 }, isci));
  try {
    await kilit?.release();
  } catch {
    /* */
  }
  return { toplam, biten, hatali, bayt, durdu: iptal.dur, sinir };
}

/** Bir bölümün görsel bağlantıları (soru + kitaptaki açıklama; kitap hâli yoksa blok şekilleri). */
export function bolumGorselleri(sorular: CozumSorusu[]) {
  const urller: string[] = [];
  for (const s of sorular) {
    if (s.kitapGorsel) urller.push(s.kitapGorsel);
    if (s.soruGorsel) urller.push(s.soruGorsel);
    const a = s.anahtar ?? s.sonuc;
    if (!a) continue;
    if (a.aciklamaKitap?.length) {
      for (const k of a.aciklamaKitap) if (k.url) urller.push(k.url);
    } else {
      for (const b of a.aciklamaBloklar ?? []) if (b.t === "g" && b.url) urller.push(b.url);
    }
  }
  return urller;
}

const SON = "sa-son-deneme";

/** "Devam et" internetsiz basılınca açılacak deneme: istek gövdesi → deneme id. */
export function sonDenemeYaz(anahtar: string, id: string) {
  try {
    const h = JSON.parse(localStorage.getItem(SON) || "{}") as Record<string, string>;
    h[anahtar] = id;
    localStorage.setItem(SON, JSON.stringify(h));
  } catch {
    /* */
  }
}
export function sonDenemeOku(anahtar: string): string | null {
  try {
    return (JSON.parse(localStorage.getItem(SON) || "{}") as Record<string, string>)[anahtar] ?? null;
  } catch {
    return null;
  }
}
export function sonDenemeSil(id: string) {
  try {
    const h = JSON.parse(localStorage.getItem(SON) || "{}") as Record<string, string>;
    for (const k of Object.keys(h)) if (h[k] === id) delete h[k];
    localStorage.setItem(SON, JSON.stringify(h));
  } catch {
    /* */
  }
}

/**
 * Çıkışta tabletteki kişisel veriyi sil (görseller kalır, kitap görüntüleri kişisel değil). Gönderilmemiş
 * cevaplar (kuyruk) silinmez: tekrar girişte gönderilir.
 */
export async function yerelVeriyiSil() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("sa-") && k !== KUYRUK) localStorage.removeItem(k);
    await caches.delete(VERI);
    await caches.delete("sayfa-v1");
  } catch {
    /* */
  }
}
