import DenemeBaslat from "@/components/DenemeBaslat";
import { yuzde, type KonuOzeti } from "@/lib/analiz";

/** Boş/yanlış dağılımına ve orana göre somut tavsiye. */
function oneri(k: KonuOzeti): string {
  if (k.bos > k.yanlis) {
    return "Çoğunu boş bıraktın: konuyu hiç bilmiyorsun, önce ders notundan okuyup sonra soru çöz.";
  }
  if (k.oran < 0.4) {
    return "Neredeyse hepsini yanlış yaptın: ezberin karışmış olabilir, konuyu baştan tekrar et.";
  }
  if (k.oran < 0.55) {
    return "Yarısından azını bildin: temel var ama oturmamış, bol soru çözerek ayrıntıları pekiştir.";
  }
  return "Sınıra yakınsın: çeldiricilerde kaybediyorsun, yanlışlarının çözümünü tek tek oku.";
}

/**
 * Analizi somut bir eyleme çevirir: "şu konuya çalış" + o konudan deneme başlat.
 */
export default function CalismaOnerisi({ konular }: { konular: KonuOzeti[] }) {
  if (konular.length === 0) {
    return (
      <p className="ince">
        Bu dönemde belirgin bir eksik çıkmadı. Daha fazla soru çözdükçe öneriler netleşir.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {konular.map((k, i) => {
        const kacirilan = k.yanlis + k.bos;
        return (
          <li key={k.anahtar} className="rounded-xl border border-cizgi bg-kart2 p-3">
            <div className="flex flex-wrap items-start gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-zemin text-sm font-bold text-silik">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{k.konu}</p>
                <p className="text-xs text-silik">{k.ders}</p>
                <p className="mt-1.5 text-sm">
                  {k.toplam} sorudan <span className="font-semibold text-zayif">{kacirilan}</span>{" "}
                  tanesini kaçırdın ({yuzde(k.oran)} doğru).{" "}
                  {oneri(k)}
                </p>
              </div>
              <div className="shrink-0">
                <DenemeBaslat
                  mod="konu"
                  ders={k.ders}
                  konu={k.konu}
                  adet={20}
                  etiket="Bu konudan çöz"
                  ikincil
                  kucuk
                />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
