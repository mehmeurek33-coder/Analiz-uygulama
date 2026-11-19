import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { PARCA_SAYFA, pdfParcasiniAyristir } from "@/lib/anthropic";
import { cevapAnahtariniAyristir } from "@/lib/cevapAnahtari";
import { konuOturt } from "@/lib/mufredat";
import { oturumKullanicisi, sunucuIstemcisi } from "@/lib/supabase/server";
import { yoneticiIstemcisi } from "@/lib/supabase/admin";

export const maxDuration = 60;

/**
 * PDF'in TEK bir parcasini isler. Istemci bu ucu parca parca cagirir,
 * boylece uzun PDF'ler sunucu zaman asimina takilmaz ve ilerleme gosterilebilir.
 * Govde: { setId: string, parca: number }   (parca 0'dan baslar)
 */
export async function POST(request: Request) {
  const user = await oturumKullanicisi();
  if (!user) return NextResponse.json({ hata: "Oturum yok." }, { status: 401 });

  const { setId, parca } = await request.json();
  const parcaNo = Number(parca) || 0;

  const supabase = await sunucuIstemcisi();
  const { data: set, error: setHatasi } = await supabase
    .from("soru_setleri")
    .select("*")
    .eq("id", setId)
    .single();

  if (setHatasi || !set) return NextResponse.json({ hata: "Set bulunamadı." }, { status: 404 });
  if (parcaNo >= set.parca_sayisi) {
    return NextResponse.json({ bitti: true, soruSayisi: set.soru_sayisi });
  }

  const admin = yoneticiIstemcisi();

  try {
    await supabase.from("soru_setleri").update({ durum: "isleniyor", hata: null }).eq("id", set.id);

    const { data: dosya, error: indirmeHatasi } = await admin.storage
      .from("pdfler")
      .download(set.dosya_yolu);
    if (indirmeHatasi || !dosya) throw new Error("PDF depodan okunamadı.");

    // Parcaya denk gelen sayfalari ayri bir PDF'e kopyala
    const kaynak = await PDFDocument.load(await dosya.arrayBuffer(), { ignoreEncryption: true });
    const ilk = parcaNo * PARCA_SAYFA;
    const son = Math.min(ilk + PARCA_SAYFA, kaynak.getPageCount());
    const parcaPdf = await PDFDocument.create();
    const sayfalar = await parcaPdf.copyPages(
      kaynak,
      Array.from({ length: son - ilk }, (_, i) => ilk + i),
    );
    for (const s of sayfalar) parcaPdf.addPage(s);
    const base64 = Buffer.from(await parcaPdf.save()).toString("base64");

    const cikan = await pdfParcasiniAyristir(base64, {
      ilkSayfa: ilk + 1,
      sonSayfa: son,
      cevapAnahtariMetni: set.cevap_anahtari || undefined,
    });

    const anahtar = cevapAnahtariniAyristir(set.cevap_anahtari);

    const satirlar = cikan
      .filter((s) => s.metin?.trim() && s.secenekler?.length >= 2)
      .map((s, i) => {
        const { ders, konu, altKonu } = konuOturt(s.ders, s.konu);
        const secenekler: Record<string, string> = {};
        for (const sec of s.secenekler) {
          const harf = (sec.harf || "").trim().toUpperCase().slice(0, 1);
          if (harf) secenekler[harf] = sec.metin;
        }
        const anahtardan = s.numara ? anahtar[s.numara] : undefined;
        const modelden = (s.dogru_cevap || "").trim().toUpperCase().slice(0, 1);
        const zorluk = ["kolay", "orta", "zor"].includes((s.zorluk || "").toLowerCase())
          ? s.zorluk.toLowerCase()
          : null;

        return {
          set_id: set.id,
          user_id: user.id,
          numara: s.numara || null,
          sira: set.soru_sayisi + i,
          metin: s.metin.trim(),
          secenekler,
          dogru_cevap: anahtardan || (/^[A-E]$/.test(modelden) ? modelden : null),
          ders,
          konu,
          alt_konu: s.alt_konu?.trim() || altKonu || null,
          zorluk,
          aciklama: s.aciklama?.trim() || null,
        };
      });

    if (satirlar.length > 0) {
      const { error } = await supabase.from("sorular").insert(satirlar);
      if (error) throw new Error(error.message);
    }

    const islenen = parcaNo + 1;
    const toplamSoru = set.soru_sayisi + satirlar.length;
    const bitti = islenen >= set.parca_sayisi;

    await supabase
      .from("soru_setleri")
      .update({
        islenen_parca: islenen,
        soru_sayisi: toplamSoru,
        durum: bitti ? "hazır" : "isleniyor",
      })
      .eq("id", set.id);

    return NextResponse.json({
      bitti,
      parca: parcaNo,
      eklenen: satirlar.length,
      soruSayisi: toplamSoru,
      sonrakiParca: bitti ? null : islenen,
      parcaSayisi: set.parca_sayisi,
    });
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : "Bilinmeyen hata";
    await supabase
      .from("soru_setleri")
      .update({ durum: "hata", hata: mesaj.slice(0, 500) })
      .eq("id", set.id);
    return NextResponse.json({ hata: mesaj }, { status: 500 });
  }
}
