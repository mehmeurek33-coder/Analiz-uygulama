/**
 * Claude Code oturumunda PDF'ten çıkarılan soruları veritabanına ekleyen SQL'i üretir.
 *
 * Kullanım (ayrıntı için CLAUDE.md):
 *   node --experimental-strip-types --no-warnings scripts/soru-ekle.ts \
 *        <girdi.json> <kullanici_id> [--set <mevcut_set_id>] [--serbest] > istek.json
 *   curl -sS -X POST "https://api.supabase.com/v1/projects/<ref>/database/query" \
 *        -H "Content-Type: application/json" -d @istek.json
 *
 *   --set      Yeni set açmak yerine mevcut sete ekler (büyük kitaplar parça parça).
 *              Aynı numaralı soru o sette zaten varsa atlanır, yani tekrar çalıştırmak güvenli.
 *   --serbest  Müfredatta olmayan konu adlarına izin verir (varsayılan: hata).
 *
 * Girdi biçimi:
 *   {
 *     "ad": "Meditus Farmakoloji · 03 Otonom Sinir Sistemi",
 *     "kaynak": "Meditus",                     (yeni set için zorunlu: kitabın/serinin adı)
 *     "ders": "Farmakoloji",                   (isteğe bağlı: yoksa soruların en sık dersi)
 *     "bolum_no": 3,                           (isteğe bağlı: kaynak içindeki sıra)
 *     "sayfa_sayisi": 40,
 *     "cevap_anahtari": "1-A 2-C ...",        (isteğe bağlı, kayıt için)
 *     "tur": "deneme",                         (isteğe bağlı: deneme sınavı; varsayılan soru bankası)
 *     "sorular": [
 *       { "numara": 1, "metin": "...", "secenekler": {"A": "...", "B": "..."},
 *         "dogru_cevap": "C", "ders": "Farmakoloji", "konu": "Antibiyotikler",
 *         "alt_konu": "Beta-laktamlar", "zorluk": "orta", "aciklama": "..." }
 *     ]
 *   }
 *
 * Çıktı: stdout'a {"query": "..."} gövdesi, stderr'e özet ve uyarılar.
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { MUFREDAT, konuOturt } from "../src/lib/mufredat.ts";

type GirdiSoru = {
  numara?: number | null;
  metin?: string;
  secenekler?: Record<string, string>;
  dogru_cevap?: string | null;
  ders?: string | null;
  konu?: string | null;
  alt_konu?: string | null;
  zorluk?: string | null;
  aciklama?: string | null;
};

type Girdi = {
  ad?: string;
  kaynak?: string;
  ders?: string;
  bolum_no?: number;
  /** "deneme": sonuçlar test sonunda; "calisma" (varsayılan): soru bankası, anında geri bildirim */
  tur?: "deneme" | "calisma";
  sayfa_sayisi?: number;
  cevap_anahtari?: string;
  sorular?: GirdiSoru[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function dur(mesaj: string): never {
  process.stderr.write(`HATA: ${mesaj}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------- argümanlar
const arg = process.argv.slice(2);
const dosya = arg[0];
const kullaniciId = arg[1];
const setIdx = arg.indexOf("--set");
const setId = setIdx >= 0 ? arg[setIdx + 1] : null;
const serbest = arg.includes("--serbest");

if (!dosya || !kullaniciId) dur("kullanım: soru-ekle.ts <girdi.json> <kullanici_id> [--set <id>] [--serbest]");
if (!UUID.test(kullaniciId)) dur(`kullanici_id UUID değil: ${kullaniciId}`);
if (setId !== null && !UUID.test(setId)) dur(`set_id UUID değil: ${setId}`);

let girdi: Girdi;
try {
  girdi = JSON.parse(readFileSync(dosya, "utf-8"));
} catch (e) {
  dur(`girdi okunamadı: ${(e as Error).message}`);
}

const ad = (girdi.ad || "").trim();
if (!setId && !ad) dur("yeni set için 'ad' alanı zorunlu");
const kaynak = (girdi.kaynak || "").trim();
if (!setId && !kaynak) dur("yeni set için 'kaynak' alanı zorunlu (örn. \"Tüm TUS Soruları\", \"Meditus\")");
if (!Array.isArray(girdi.sorular) || girdi.sorular.length === 0) dur("'sorular' boş");

// ---------------------------------------------------------------- doğrulama
const konuKumesi = new Map(MUFREDAT.map((d) => [d.ders, new Set(d.konular)]));
const hatalar: string[] = [];
const uyarilar: string[] = [];
const numaralar = new Set<number>();

const temiz = girdi.sorular.map((s, i) => {
  const etiket = `soru ${i + 1}${Number.isInteger(s.numara) ? ` (PDF no ${s.numara})` : ""}`;

  const metin = (s.metin || "").trim();
  if (!metin) hatalar.push(`${etiket}: metin boş`);

  const secenekler: Record<string, string> = {};
  for (const [harf, yazi] of Object.entries(s.secenekler || {})) {
    const h = harf.trim().toUpperCase();
    if (!/^[A-E]$/.test(h)) {
      hatalar.push(`${etiket}: geçersiz şık harfi "${harf}"`);
      continue;
    }
    const y = String(yazi ?? "").trim();
    if (!y) hatalar.push(`${etiket}: ${h} şıkkı boş`);
    secenekler[h] = y;
  }
  if (Object.keys(secenekler).length < 2) hatalar.push(`${etiket}: en az 2 şık gerekli`);

  let dogru: string | null = (s.dogru_cevap || "").trim().toUpperCase() || null;
  if (dogru && !/^[A-E]$/.test(dogru)) {
    hatalar.push(`${etiket}: doğru cevap "${dogru}" geçersiz`);
    dogru = null;
  }
  if (dogru && !(dogru in secenekler)) hatalar.push(`${etiket}: doğru cevap ${dogru} şıklarda yok`);
  if (!dogru) uyarilar.push(`${etiket}: cevap anahtarı yok (orana katılmaz)`);

  const numara = Number.isInteger(s.numara) ? (s.numara as number) : null;
  if (numara !== null) {
    if (numaralar.has(numara)) hatalar.push(`${etiket}: numara tekrar ediyor`);
    numaralar.add(numara);
  }

  const { ders, konu, altKonu } = konuOturt(s.ders, s.konu);
  const gecerli = konu === "Belirsiz" || konuKumesi.get(ders)?.has(konu);
  if (!gecerli) {
    const m = `${etiket}: "${ders} / ${konu}" müfredatta yok`;
    if (serbest) uyarilar.push(m);
    else hatalar.push(m);
  }

  const z = (s.zorluk || "").trim().toLowerCase();
  const zorluk = ["kolay", "orta", "zor"].includes(z) ? z : null;

  return {
    numara,
    sira: i,
    metin,
    secenekler,
    dogru_cevap: dogru,
    ders,
    konu,
    alt_konu: (s.alt_konu || "").trim() || altKonu || null,
    zorluk,
    aciklama: (s.aciklama || "").trim() || null,
  };
});

if (hatalar.length) {
  process.stderr.write(`${hatalar.length} hata:\n  ${hatalar.join("\n  ")}\n`);
  process.exit(1);
}

// Setin dersi: verilmişse müfredatta olmalı; yoksa soruların en sık dersi
let setDers = (girdi.ders || "").trim();
if (setDers && !konuKumesi.has(setDers)) dur(`set dersi "${setDers}" müfredatta yok`);
if (!setDers) {
  const say = new Map<string, number>();
  for (const s of temiz) say.set(s.ders, (say.get(s.ders) ?? 0) + 1);
  setDers = [...say.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
const bolumNo = Number.isInteger(girdi.bolum_no) ? girdi.bolum_no : null;

// ---------------------------------------------------------------- SQL
const veri = JSON.stringify({
  ad,
  kaynak,
  ders: setDers,
  bolum_no: bolumNo,
  sayfa_sayisi: Number.isInteger(girdi.sayfa_sayisi) ? girdi.sayfa_sayisi : 0,
  cevap_anahtari: (girdi.cevap_anahtari || "").trim(),
  tur: girdi.tur === "deneme" ? "deneme" : "calisma",
  sorular: temiz,
});

// Dollar-quote etiketi: içerikte geçmeyen rastgele bir etiket
let etiket = "";
do {
  etiket = `$q${randomBytes(6).toString("hex")}$`;
} while (veri.includes(etiket));

const kolonlar =
  "numara int, sira int, metin text, secenekler jsonb, dogru_cevap text, " +
  "ders text, konu text, alt_konu text, zorluk text, aciklama text";

const sql = setId
  ? `with girdi as (select ${etiket}${veri}${etiket}::jsonb as j),
hedef as (
  select id, soru_sayisi from public.soru_setleri
  where id = '${setId}'::uuid and user_id = '${kullaniciId}'::uuid
),
eklenen as (
  insert into public.sorular
    (set_id, user_id, numara, sira, metin, secenekler, dogru_cevap, ders, konu, alt_konu, zorluk, aciklama)
  select h.id, '${kullaniciId}'::uuid, q.numara, h.soru_sayisi + q.sira, q.metin, q.secenekler,
         q.dogru_cevap, q.ders, q.konu, q.alt_konu, q.zorluk, q.aciklama
  from hedef h
  cross join girdi g
  cross join lateral jsonb_to_recordset(g.j->'sorular') as q(${kolonlar})
  where not (q.numara is not null and exists (
    select 1 from public.sorular x where x.set_id = h.id and x.numara = q.numara))
  returning id
),
guncel as (
  update public.soru_setleri
     set soru_sayisi = soru_sayisi + (select count(*) from eklenen),
         sayfa_sayisi = sayfa_sayisi + coalesce(((select j from girdi)->>'sayfa_sayisi')::int, 0)
   where id = (select id from hedef)
  returning id
)
select (select id from hedef) as set_id,
       (select count(*) from eklenen) as eklenen_soru,
       (select count(*) from guncel) as set_guncellendi;`
  : `with girdi as (select ${etiket}${veri}${etiket}::jsonb as j),
yeni_set as (
  insert into public.soru_setleri
    (user_id, ad, sayfa_sayisi, parca_sayisi, islenen_parca, soru_sayisi, cevap_anahtari, durum, tur,
     ders, kaynak, bolum_no)
  select '${kullaniciId}'::uuid, j->>'ad', coalesce((j->>'sayfa_sayisi')::int, 0), 0, 0,
         jsonb_array_length(j->'sorular'), nullif(j->>'cevap_anahtari', ''), 'hazir',
         case when j->>'tur' = 'deneme' then 'deneme' else 'calisma' end,
         j->>'ders', j->>'kaynak', (j->>'bolum_no')::int
  from girdi
  returning id
),
eklenen as (
  insert into public.sorular
    (set_id, user_id, numara, sira, metin, secenekler, dogru_cevap, ders, konu, alt_konu, zorluk, aciklama)
  select s.id, '${kullaniciId}'::uuid, q.numara, q.sira, q.metin, q.secenekler,
         q.dogru_cevap, q.ders, q.konu, q.alt_konu, q.zorluk, q.aciklama
  from yeni_set s
  cross join girdi g
  cross join lateral jsonb_to_recordset(g.j->'sorular') as q(${kolonlar})
  returning id
)
select (select id from yeni_set) as set_id, (select count(*) from eklenen) as eklenen_soru;`;

process.stdout.write(JSON.stringify({ query: sql }));

// ---------------------------------------------------------------- özet
const dagilim = new Map<string, number>();
for (const s of temiz) {
  const k = `${s.ders} / ${s.konu}`;
  dagilim.set(k, (dagilim.get(k) ?? 0) + 1);
}
const ozet = [...dagilim.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([k, n]) => `  ${String(n).padStart(3)}  ${k}`)
  .join("\n");

process.stderr.write(
  `${temiz.length} soru hazır (${setId ? `mevcut sete ekleme: ${setId}` : `yeni set: "${ad}" · ${kaynak} · ${setDers}${bolumNo !== null ? ` · bölüm ${bolumNo}` : ""}`})\n` +
    `${ozet}\n` +
    (uyarilar.length ? `${uyarilar.length} uyarı:\n  ${uyarilar.join("\n  ")}\n` : ""),
);
