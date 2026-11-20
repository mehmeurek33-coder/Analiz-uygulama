import Link from "next/link";
import YedekDugmeleri, { IndirDugmesi } from "@/components/YedekDugmeleri";
import { oturumKullanicisi } from "@/lib/supabase/server";
import { yedekleriListele } from "@/lib/yedek";

export const dynamic = "force-dynamic";

function boyut(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function tarih(klasor: string) {
  // "2026-11-20_0230" -> "20.11.2026 02:30"
  const m = klasor.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]}` : klasor;
}

export default async function YedekSayfasi() {
  const user = await oturumKullanicisi();
  if (!user) return null;

  let liste: Awaited<ReturnType<typeof yedekleriListele>> = [];
  let hata: string | null = null;
  try {
    liste = await yedekleriListele();
  } catch (e) {
    hata = (e as Error).message;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-silik hover:text-metin">
          ← Panel
        </Link>
        <h1 className="mt-1 text-xl font-bold sm:text-2xl">Yedekler</h1>
        <p className="ince mt-1">
          Bütün veriler (sorular, setler, denemeler, cevaplar) 3 günde bir otomatik yedeklenir. Son 10
          yedek saklanır.
        </p>
      </div>

      <section className="kart space-y-3">
        <YedekDugmeleri />
        <p className="text-xs text-silik">
          Yedekler aynı Supabase projesinde gizli bir depoda durur: yanlışlıkla silinen ya da bozulan
          veriyi geri getirmeye yarar. Projenin kendisine bir şey olursa diye ara sıra en son yedeği
          indirip telefonunda veya Drive&apos;da sakla. Geri yüklemek için dosyaları Claude&apos;a gönder.
        </p>
      </section>

      <section className="kart">
        <h2 className="mb-3 font-semibold">Alınan yedekler</h2>
        {hata ? (
          <p className="text-sm text-kotu">Liste alınamadı: {hata}</p>
        ) : liste.length === 0 ? (
          <p className="ince">Henüz yedek yok. İlk otomatik yedek en geç 3 gün içinde alınır.</p>
        ) : (
          <ul className="divide-y divide-cizgi">
            {liste.map((y) => {
              const veriler = y.dosyalar.filter((f) => f.ad.endsWith(".json.gz"));
              const toplam = veriler.reduce((a, f) => a + f.bayt, 0);
              return (
                <li key={y.klasor} className="py-3">
                  <p className="text-sm font-medium tabular-nums">
                    {tarih(y.klasor)} <span className="text-xs text-silik">· {boyut(toplam)}</span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {veriler.map((f) => (
                      <IndirDugmesi key={f.ad} yol={`${y.klasor}/${f.ad}`} etiket={f.ad.replace(".json.gz", "")} />
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
