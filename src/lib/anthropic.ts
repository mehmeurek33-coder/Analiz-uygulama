import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { mufredatMetni } from "./mufredat";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const EFFORT = (process.env.ANTHROPIC_EFFORT || "low") as "low" | "medium" | "high" | "max";

/** Bir parcada kac PDF sayfasi Claude'a gonderilir. */
export const PARCA_SAYFA = 4;

const SecenekSemasi = z.object({
  harf: z.string().describe("A, B, C, D veya E"),
  metin: z.string(),
});

const SoruSemasi = z.object({
  numara: z.number().describe("PDF uzerinde yazan soru numarasi. Yoksa 0."),
  metin: z.string().describe("Sorunun tam koku. Tablo/sekil varsa kisaca tarif et."),
  secenekler: z.array(SecenekSemasi),
  dogru_cevap: z.string().describe("PDF'te belirtilmisse A-E, belirtilmemisse bos string."),
  ders: z.string().describe("Verilen ders listesinden tam ad."),
  konu: z.string().describe("O dersin verilen konu listesinden tam ad."),
  alt_konu: z.string().describe("Daha ince baslik, orn. 'Beta-laktam antibiyotikler'. Yoksa bos."),
  zorluk: z.string().describe("kolay, orta veya zor"),
  aciklama: z.string().describe("Dogru cevabin tek cumlelik gerekcesi. Bilinmiyorsa bos."),
});

const CikisSemasi = z.object({
  sorular: z.array(SoruSemasi),
});

export type AyristirilmisSoru = z.infer<typeof SoruSemasi>;

const SISTEM = `Sen bir TUS soru bankası dijitalleştirme asistanısın.
Sana bir soru kitapçığının birkaç sayfası PDF olarak verilir. Görevin:

1. Sayfalardaki her çoktan seçmeli soruyu eksiksiz çıkarmak.
2. Soru kökünü ve A-E seçenekleriyle birlikte, PDF'teki numarasıyla vermek.
3. Her soruyu aşağıdaki ders/konu listesine oturtmak.

KURALLAR
- Sadece gerçekten sayfada olan soruları döndür; soru uydurma.
- Yarım kalan soru (sayfa ortasında kesilmiş, seçenekleri eksik) varsa ONU ATLA.
- Metni olduğu gibi aktar, sadeleştirme veya düzeltme yapma. Türkçe karakterleri koru.
- Şekil/tablo/grafik içeren soruda, kökün sonuna köşeli parantez içinde kısa tarif ekle.
- ders ve konu alanlarında ASLA yeni isim uydurma; listedeki adları harfi harfine yaz.
  Hiçbiri uymuyorsa ders alanına en yakın dersi, konu alanına "Belirsiz" yaz.
- Cevap anahtarı sana ayrıca verilebilir; verilmediyse ve PDF'te de yoksa dogru_cevap boş kalsın.
- aciklama alanına doğru cevabın tek cümlelik gerekçesini yaz; emin değilsen boş bırak.

DERS VE KONU LISTESI
${mufredatMetni()}`;

function istemci() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY tanımlı değil. console.anthropic.com adresinden anahtar alıp ortam değişkenlerine ekleyin.",
    );
  }
  return new Anthropic();
}

/** Bir PDF parcasindaki sorulari cikarir. */
export async function pdfParcasiniAyristir(
  pdfBase64: string,
  bilgi: { ilkSayfa: number; sonSayfa: number; cevapAnahtariMetni?: string },
): Promise<AyristirilmisSoru[]> {
  const client = istemci();

  const notlar: string[] = [
    `Bu parça kitapçığın ${bilgi.ilkSayfa}-${bilgi.sonSayfa}. sayfalarını kapsıyor.`,
  ];
  if (bilgi.cevapAnahtariMetni?.trim()) {
    notlar.push(
      `Cevap anahtarı (soru numarası - doğru seçenek):\n${bilgi.cevapAnahtariMetni.trim()}`,
    );
  }

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SISTEM,
    output_config: { effort: EFFORT, format: zodOutputFormat(CikisSemasi) },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
          },
          { type: "text", text: `${notlar.join("\n\n")}\n\nSoruları çıkar.` },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Model bu içeriği işleyemedi (refusal).");
  }
  return response.parsed_output?.sorular ?? [];
}

/* ------------------------------------------------------------------ *
 *  Cevap anahtarini PDF'in son sayfalarindan okuma
 * ------------------------------------------------------------------ */

const AnahtarSemasi = z.object({
  bulundu: z.boolean().describe("Sayfada bir cevap anahtari tablosu var mi?"),
  cevaplar: z.array(
    z.object({
      numara: z.number(),
      cevap: z.string().describe("A-E"),
    }),
  ),
});

/**
 * Soru kitapciklarinda cevap anahtari genelde son sayfadadir.
 * Kullanici elle anahtar girmediyse son sayfalardan okumayi dener.
 * Bulamazsa bos string doner.
 */
export async function cevapAnahtariniBul(pdfBase64: string): Promise<string> {
  const client = istemci();

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system:
      "Verilen sayfalarda bir CEVAP ANAHTARI tablosu/listesi varsa (soru numarası -> seçenek) " +
      "tamamını çıkar. Yoksa bulundu=false döndür ve cevaplar boş kalsın. " +
      "Soru köklerinden veya seçeneklerden cevap TAHMİN ETME, sadece açıkça yazılmış anahtarı oku.",
    output_config: { effort: "low", format: zodOutputFormat(AnahtarSemasi) },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
          },
          { type: "text", text: "Bu sayfalarda cevap anahtarı var mı?" },
        ],
      },
    ],
  });

  const cikan = response.parsed_output;
  if (!cikan?.bulundu || !cikan.cevaplar?.length) return "";
  return cikan.cevaplar
    .filter((c) => /^[A-Ea-e]$/.test((c.cevap || "").trim()))
    .map((c) => `${c.numara}-${c.cevap.trim().toUpperCase()}`)
    .join(" ");
}
