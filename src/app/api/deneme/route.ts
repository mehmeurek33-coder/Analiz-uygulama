import { NextResponse } from "next/server";
import { oturumKullanicisi, sunucuIstemcisi } from "@/lib/supabase/server";

export const maxDuration = 60;

type Govde = {
  setId?: string | null;
  mod?: "tumu" | "rastgele" | "zayif" | "yanlis" | "konu";
  adet?: number;
  ad?: string;
  ders?: string;
  konu?: string;
};

/** Yeni deneme olusturur ve icine girecek sorulari secer. */
export async function POST(request: Request) {
  const user = await oturumKullanicisi();
  if (!user) return NextResponse.json({ hata: "Oturum yok." }, { status: 401 });

  const { setId = null, mod = "tumu", adet = 20, ad, ders, konu }: Govde = await request.json();
  const supabase = await sunucuIstemcisi();
  const limit = Math.max(1, Math.min(200, Number(adet) || 20));

  let soruIdleri: string[] = [];

  if (mod === "konu") {
    // Tek bir ders/konudan deneme
    if (!ders || !konu) {
      return NextResponse.json({ hata: "Ders ve konu gerekli." }, { status: 400 });
    }
    const { data } = await supabase
      .from("sorular")
      .select("id")
      .eq("user_id", user.id)
      .eq("ders", ders)
      .eq("konu", konu)
      .limit(500);
    soruIdleri = karistir((data ?? []).map((s) => s.id)).slice(0, limit);
  } else if (mod === "yanlis") {
    // Daha once yanlis cevaplanmis sorular
    const { data } = await supabase
      .from("cevaplar")
      .select("soru_id, cevaplandi_at")
      .eq("user_id", user.id)
      .eq("dogru", false)
      .not("isaretlenen", "is", null)
      .order("cevaplandi_at", { ascending: false })
      .limit(500);
    soruIdleri = [...new Set((data ?? []).map((c) => c.soru_id))].slice(0, limit);
  } else if (mod === "zayif") {
    // En zayif konulardan soru topla
    const { data: perf } = await supabase
      .from("v_konu_performans")
      .select("ders, konu, toplam, dogru")
      .eq("user_id", user.id);

    const toplamlar = new Map<string, { ders: string; konu: string; t: number; d: number }>();
    for (const p of perf ?? []) {
      const k = `${p.ders}||${p.konu}`;
      const mevcut = toplamlar.get(k) ?? { ders: p.ders, konu: p.konu, t: 0, d: 0 };
      mevcut.t += Number(p.toplam) || 0;
      mevcut.d += Number(p.dogru) || 0;
      toplamlar.set(k, mevcut);
    }
    const zayif = [...toplamlar.values()]
      .filter((x) => x.t >= 3)
      .sort((a, b) => a.d / a.t - b.d / b.t)
      .slice(0, 6);

    if (zayif.length === 0) {
      return NextResponse.json(
        { hata: "Zayıf konu analizi icin once birkac deneme cozmelisiniz." },
        { status: 400 },
      );
    }

    for (const z of zayif) {
      const { data } = await supabase
        .from("sorular")
        .select("id")
        .eq("user_id", user.id)
        .eq("ders", z.ders)
        .eq("konu", z.konu)
        .limit(Math.ceil(limit / zayif.length) * 2);
      soruIdleri.push(...(data ?? []).map((s) => s.id));
    }
    soruIdleri = karistir([...new Set(soruIdleri)]).slice(0, limit);
  } else {
    let sorgu = supabase.from("sorular").select("id, sira").eq("user_id", user.id);
    if (setId) sorgu = sorgu.eq("set_id", setId);
    const { data, error } = await sorgu.order("sira", { ascending: true }).limit(1000);
    if (error) return NextResponse.json({ hata: error.message }, { status: 500 });
    const hepsi = (data ?? []).map((s) => s.id);
    soruIdleri = mod === "rastgele" ? karistir(hepsi).slice(0, limit) : hepsi.slice(0, 200);
  }

  if (soruIdleri.length === 0) {
    return NextResponse.json({ hata: "Seçilen kriterlere uygun soru bulunamadı." }, { status: 400 });
  }

  const { data: deneme, error: denemeHatasi } = await supabase
    .from("denemeler")
    .insert({
      user_id: user.id,
      set_id: setId,
      ad: (ad || (mod === "konu" && konu ? `${konu} - ${bugunMetni()}` : varsayilanAd(mod))).slice(0, 120),
      soru_sayisi: soruIdleri.length,
    })
    .select("id")
    .single();

  if (denemeHatasi || !deneme) {
    return NextResponse.json({ hata: denemeHatasi?.message ?? "Deneme oluşmadı." }, { status: 500 });
  }

  const { error: cevapHatasi } = await supabase.from("cevaplar").insert(
    soruIdleri.map((soruId, i) => ({
      deneme_id: deneme.id,
      user_id: user.id,
      soru_id: soruId,
      sira: i,
    })),
  );
  if (cevapHatasi) {
    await supabase.from("denemeler").delete().eq("id", deneme.id);
    return NextResponse.json({ hata: cevapHatasi.message }, { status: 500 });
  }

  return NextResponse.json({ id: deneme.id, soruSayisi: soruIdleri.length });
}

function karistir<T>(dizi: T[]): T[] {
  const d = [...dizi];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function bugunMetni() {
  return new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "long" });
}

function varsayilanAd(mod: string) {
  const tarih = bugunMetni();
  const adlar: Record<string, string> = {
    konu: "Konu denemesi",
    tumu: "Set denemesi",
    rastgele: "Rastgele deneme",
    zayif: "Zayıf konu denemesi",
    yanlis: "Yanlışlarım denemesi",
  };
  return `${adlar[mod] ?? "Deneme"} - ${tarih}`;
}
