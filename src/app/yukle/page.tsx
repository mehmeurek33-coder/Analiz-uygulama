import Link from "next/link";
import YukleFormu from "@/components/YukleFormu";
import { oturumKullanicisi, sunucuIstemcisi } from "@/lib/supabase/server";
import type { SoruSeti } from "@/lib/tipler";
import { pdfYuklemeAcik } from "@/lib/ozellikler";

export const dynamic = "force-dynamic";

export default async function YuklePage({
  searchParams,
}: {
  searchParams: Promise<{ set?: string }>;
}) {
  const { set: setId } = await searchParams;
  const user = await oturumKullanicisi();
  if (!user) return null;

  if (!pdfYuklemeAcik()) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <Link href="/" className="ince hover:text-metin">
          &larr; Panel
        </Link>
        <div className="kart space-y-3">
          <h1 className="text-lg font-semibold">Sorular Claude üzerinden ekleniyor</h1>
          <p className="ince">
            Bu kurulumda uygulama içinden PDF ayrıştırma kapalı (Anthropic API anahtarı
            tanımlı değil). Soru PDF&apos;lerini Claude Code oturumuna gönder; sorular
            ayrıştırılıp ders/konu etiketiyle doğrudan havuzuna eklenir.
          </p>
          <p className="ince">
            Uygulama içinden yüklemeyi açmak istersen ortam değişkenlerine{" "}
            <code className="rounded bg-kart2 px-1.5 py-0.5 text-xs">ANTHROPIC_API_KEY</code>{" "}
            eklemen yeterli.
          </p>
        </div>
      </div>
    );
  }

  let devamEdilecek: SoruSeti | null = null;
  if (setId) {
    const supabase = await sunucuIstemcisi();
    const { data } = await supabase.from("soru_setleri").select("*").eq("id", setId).single();
    devamEdilecek = (data as SoruSeti) ?? null;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <Link href="/" className="ince hover:text-metin">
          &larr; Panel
        </Link>
        <h1 className="mt-2 text-xl font-bold sm:text-2xl">Soru PDF&apos;i yükle</h1>
        <p className="ince mt-1">
          PDF&apos;i yükle, Claude soruları tek tek ayırsın ve her birini ders/konu olarak
          etiketlesin.
        </p>
      </div>
      <YukleFormu devamEdilecek={devamEdilecek} />
    </div>
  );
}
