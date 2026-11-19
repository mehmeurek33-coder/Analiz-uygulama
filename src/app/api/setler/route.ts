import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { PARCA_SAYFA, cevapAnahtariniBul } from "@/lib/anthropic";
import { oturumKullanicisi, sunucuIstemcisi } from "@/lib/supabase/server";
import { yoneticiIstemcisi } from "@/lib/supabase/admin";

export const maxDuration = 60;

/** Yuklenen PDF icin soru seti kaydi acar, sayfa/parca sayisini hesaplar. */
export async function POST(request: Request) {
  const user = await oturumKullanicisi();
  if (!user) return NextResponse.json({ hata: "Oturum yok." }, { status: 401 });

  const { ad, dosyaYolu, cevapAnahtari } = await request.json();
  if (!dosyaYolu || typeof dosyaYolu !== "string" || !dosyaYolu.startsWith(`${user.id}/`)) {
    return NextResponse.json({ hata: "Geçersiz dosya yolu." }, { status: 400 });
  }

  const admin = yoneticiIstemcisi();
  const { data: dosya, error: indirmeHatasi } = await admin.storage
    .from("pdfler")
    .download(dosyaYolu);
  if (indirmeHatasi || !dosya) {
    return NextResponse.json({ hata: "PDF okunamadı. Yüklemeyi tekrar deneyin." }, { status: 400 });
  }

  const baytlar = await dosya.arrayBuffer();
  let kaynak: PDFDocument;
  try {
    kaynak = await PDFDocument.load(baytlar, { ignoreEncryption: true });
  } catch {
    return NextResponse.json({ hata: "Bu dosya geçerli bir PDF gibi görünmüyor." }, { status: 400 });
  }

  const sayfaSayisi = kaynak.getPageCount();
  if (sayfaSayisi === 0) return NextResponse.json({ hata: "PDF boş." }, { status: 400 });

  // Kullanici anahtar girmediyse kitapcigin son sayfalarindaki
  // cevap anahtarini okumayi dene (cogu soru PDF'inde oradadir).
  let anahtarMetni = cevapAnahtari ? String(cevapAnahtari).slice(0, 20000) : "";
  let anahtarOtomatik = false;
  if (!anahtarMetni.trim() && sayfaSayisi > 1) {
    try {
      const sonPdf = await PDFDocument.create();
      const basla = Math.max(0, sayfaSayisi - 2);
      const kopyalar = await sonPdf.copyPages(
        kaynak,
        Array.from({ length: sayfaSayisi - basla }, (_, i) => basla + i),
      );
      for (const s of kopyalar) sonPdf.addPage(s);
      anahtarMetni = await cevapAnahtariniBul(Buffer.from(await sonPdf.save()).toString("base64"));
      anahtarOtomatik = anahtarMetni.trim().length > 0;
    } catch {
      anahtarMetni = "";
    }
  }

  const supabase = await sunucuIstemcisi();
  const { data, error } = await supabase
    .from("soru_setleri")
    .insert({
      user_id: user.id,
      ad: (ad || "İsimsiz set").toString().slice(0, 120),
      dosya_yolu: dosyaYolu,
      sayfa_sayisi: sayfaSayisi,
      parca_sayisi: Math.ceil(sayfaSayisi / PARCA_SAYFA),
      cevap_anahtari: anahtarMetni.trim() || null,
      durum: "kuyrukta",
    })
    .select("id, parca_sayisi, sayfa_sayisi")
    .single();

  if (error) return NextResponse.json({ hata: error.message }, { status: 500 });
  return NextResponse.json({ ...data, anahtarOtomatik });
}
