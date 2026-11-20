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

  // Mod: deneme setleri sonuçları sonda gösterir; soru bankası ve karışık
  // denemeler (rastgele, zayıf konu, yanlışlarım, konu) anında geri bildirim verir.
  let anlik = true;
  let setAdi: string | null = null;
  if (mod === "tumu" && setId) {
    const { data: set } = await supabase
      .from("soru_setleri")
      .select("tur, ad")
      .eq("id", setId)
      .eq("user_id", user.id)
      .single();
    anlik = set?.tur !== "deneme";
    setAdi = set?.ad ?? null;

    // Bu setten yarım kalmış bir oturum varsa yenisini açma, ona devam et
    const { data: yarim } = await supabase
      .from("denemeler")
      .select("id, soru_sayisi")
      .eq("user_id", user.id)
      .eq("set_id", setId)
      .is("bitti_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (yarim) return NextResponse.json({ id: yarim.id, soruSayisi: yarim.soru_sayisi, devam: true });
  }

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
    // Son cevabı yanlış olan sorular: sonradan doğru yaptığın soru listeden düşer.
    // ders verilirse yalnızca o dersin soruları.
    let sorgu = supabase
      .from("cevaplar")
      .select(ders ? "soru_id, dogru, cevaplandi_at, sorular!inner(ders)" : "soru_id, dogru, cevaplandi_at")
      .eq("user_id", user.id)
      .not("dogru", "is", null)
      .not("isaretlenen", "is", null);
    if (ders) sorgu = sorgu.eq("sorular.ders", ders);
    const { data } = await sorgu.order("cevaplandi_at", { ascending: false }).limit(1000);
    const son = new Map<string, boolean>();
    for (const c of (data ?? []) as unknown as { soru_id: string; dogru: boolean }[]) {
      if (!son.has(c.soru_id)) son.set(c.soru_id, c.dogru);
    }
    soruIdleri = [...son.entries()].filter(([, d]) => d === false).map(([id]) => id).slice(0, limit);
  } else if (mod === "zayif") {
    // En zayif konulardan soru topla
    let perfSorgu = supabase
      .from("v_konu_toplam")
      .select("ders, konu, toplam, dogru")
      .eq("user_id", user.id);
    if (ders) perfSorgu = perfSorgu.eq("ders", ders);
    const { data: perf } = await perfSorgu;

    // En az 3 soru çözülmüş, %70 altındaki konular; en düşük orandan başla
    const zayif = (perf ?? [])
      .map((p) => ({ ders: p.ders, konu: p.konu, t: Number(p.toplam) || 0, d: Number(p.dogru) || 0 }))
      .filter((x) => x.t >= 3 && x.d / x.t < 0.7)
      .sort((a, b) => a.d / a.t - b.d / b.t || b.t - b.d - (a.t - a.d))
      .slice(0, 6);

    if (zayif.length === 0) {
      return NextResponse.json(
        {
          hata: (perf ?? []).some((p) => Number(p.toplam) >= 3)
            ? "%70'in altında konun yok, iyi gidiyorsun."
            : "Zayıf konuları bulmak için önce biraz soru çözmelisin.",
        },
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
  } else if (mod === "rastgele" && !setId) {
    // Havuz büyüdükçe hepsini çekmek yerine rastgele bir UUID'den başlayıp id sırasıyla al
    // (UUID'ler rastgele olduğu için bu, sorulardan rastgele bir örneklem verir).
    const parca = async (bas: string | null, kac: number) => {
      let q = supabase.from("sorular").select("id").eq("user_id", user.id);
      if (ders) q = q.eq("ders", ders);
      if (bas) q = q.gte("id", bas);
      const { data } = await q.order("id", { ascending: true }).limit(kac);
      return (data ?? []).map((x) => x.id as string);
    };
    const ilk = await parca(crypto.randomUUID(), limit * 3);
    const ek = ilk.length < limit * 3 ? await parca(null, limit * 3 - ilk.length) : [];
    soruIdleri = karistir([...new Set([...ilk, ...ek])]).slice(0, limit);
  } else {
    let sorgu = supabase.from("sorular").select("id, sira").eq("user_id", user.id);
    if (setId) sorgu = sorgu.eq("set_id", setId);
    else if (ders) sorgu = sorgu.eq("ders", ders);
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
      ad: (
        ad ||
        setAdi ||
        (mod === "konu" && konu
          ? `${konu} - ${bugunMetni()}`
          : `${ders ? `${ders} · ` : ""}${varsayilanAd(mod)}`)
      ).slice(0, 120),
      soru_sayisi: soruIdleri.length,
      anlik,
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
