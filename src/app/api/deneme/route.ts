import { NextResponse } from "next/server";
import { ONCELIK_ALANLARI, ONCELIKLI_KONU_SAYISI, oncelikSatiri, payDagit } from "@/lib/oncelik";
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
    // Tek bir ders/konudan: önce tekrar zamanı gelenler, sonra hiç çözülmemişler, sonra en eski çözülenler
    if (!ders || !konu) {
      return NextResponse.json({ hata: "Ders ve konu gerekli." }, { status: 400 });
    }
    soruIdleri = karistir(await konudanSec(supabase, user.id, ders, konu, limit));
  } else if (mod === "yanlis") {
    // Tekrar listesi (aralıklı tekrar): yanlış, boş, "emin değilim" ya da açıklamasına bakılmış
    // sorulardan TEKRAR ZAMANI GELENLER. Bir kez doğru yapınca soru düşmez, sonraki tekrarı
    // 2 → 7 → 21 gün ileri atılır; farklı günlerde art arda 4 emin doğrudan sonra öğrenilmiş sayılır.
    let sorgu = supabase
      .from("v_tekrar_vadesi")
      .select("soru_id, kutu, sonraki_tekrar")
      .eq("user_id", user.id);
    if (ders) sorgu = sorgu.eq("ders", ders);
    const { data } = await sorgu
      .order("kutu", { ascending: true })
      .order("sonraki_tekrar", { ascending: true })
      .limit(1000);
    soruIdleri = karistir((data ?? []).slice(0, limit).map((c) => c.soru_id as string));
    if (soruIdleri.length === 0) {
      let yakin = supabase
        .from("v_soru_durum")
        .select("sonraki_tekrar")
        .eq("user_id", user.id)
        .eq("acik_hata", true)
        .not("sonraki_tekrar", "is", null);
      if (ders) yakin = yakin.eq("ders", ders);
      const { data: ilk } = await yakin.order("sonraki_tekrar", { ascending: true }).limit(1);
      const t = ilk?.[0]?.sonraki_tekrar as string | undefined;
      return NextResponse.json(
        {
          hata: t
            ? `Bugün tekrar zamanı gelen soru yok. Sıradaki tekrar: ${new Date(t).toLocaleDateString("tr-TR", {
                day: "numeric",
                month: "long",
                timeZone: "Europe/Istanbul",
              })}.`
            : "Tekrar edilecek soru yok.",
        },
        { status: 400 },
      );
    }
  } else if (mod === "zayif") {
    // Öncelikli konular (v_konu_oncelik): çalışılmış konular öncelik sırasıyla, soru payı öncelikle orantılı
    let sorgu = supabase
      .from("v_konu_oncelik")
      .select(ONCELIK_ALANLARI)
      .eq("user_id", user.id)
      .gt("deneme", 0);
    if (ders) sorgu = sorgu.eq("ders", ders);
    const { data: oncelik } = await sorgu.order("oncelik", { ascending: false }).limit(ONCELIKLI_KONU_SAYISI);
    const konular = (oncelik ?? []).map((x) => oncelikSatiri(x as Record<string, unknown>));
    if (konular.length === 0) {
      return NextResponse.json(
        { hata: "Öncelikli konuları belirlemek için önce biraz soru çözmelisin." },
        { status: 400 },
      );
    }
    const paylar = payDagit(konular, limit);
    const parcalar = await Promise.all(
      konular.map((k, i) => konudanSec(supabase, user.id, k.ders, k.konu, paylar[i])),
    );
    soruIdleri = karistir([...new Set(parcalar.flat())]).slice(0, limit);
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
    soruIdleri = mod === "rastgele" ? karistir(hepsi).slice(0, limit) : hepsi;
  }

  if (soruIdleri.length === 0) {
    return NextResponse.json({ hata: "Seçilen kriterlere uygun soru bulunamadı." }, { status: 400 });
  }

  // Karışık denemede aynı vakayı paylaşan seçilmiş sorular art arda gelsin (vaka bir kez açık gösterilir)
  if (mod !== "tumu") soruIdleri = await vakaGrupla(supabase, user.id, soruIdleri);

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

type Istemci = Awaited<ReturnType<typeof sunucuIstemcisi>>;

/**
 * Bir konudan `adet` soru seçer. Sıra: tekrar zamanı gelen hatalar (düşük kutu önce), hiç
 * çözülmemiş sorular (rastgele), hiç hata yapılmamış sorular (en uzun süredir bakılmayan önce),
 * en son tekrarı henüz gelmemiş hatalar (gerekirse).
 */
async function konudanSec(supabase: Istemci, userId: string, ders: string, konu: string, adet: number) {
  if (adet <= 0) return [];
  const [havuzQ, durumQ] = await Promise.all([
    supabase
      .from("sorular")
      .select("id, set_id")
      .eq("user_id", userId)
      .eq("ders", ders)
      .eq("konu", konu)
      .limit(1000),
    supabase
      .from("v_soru_durum")
      .select("soru_id, kutu, bilinen, acik_hata, sonraki_tekrar, son_zaman")
      .eq("user_id", userId)
      .eq("ders", ders)
      .eq("konu", konu)
      .limit(1000),
  ]);
  // Kaynak bilgisi: aynı konunun farklı kitaplardaki soruları sırayla karışsın
  const setIdleri = [...new Set((havuzQ.data ?? []).map((x) => x.set_id as string | null).filter(Boolean))] as string[];
  const { data: setler } = setIdleri.length
    ? await supabase.from("soru_setleri").select("id, kaynak").in("id", setIdleri)
    : { data: [] as { id: string; kaynak: string | null }[] };
  const kaynakOf = new Map((setler ?? []).map((x) => [x.id as string, (x.kaynak as string | null) ?? "?"]));
  const setOf = new Map((havuzQ.data ?? []).map((x) => [x.id as string, x.set_id as string | null]));
  const kaynak = (id: string) => kaynakOf.get(setOf.get(id) ?? "") ?? "?";

  const simdi = Date.now();
  const durum = new Map((durumQ.data ?? []).map((d) => [d.soru_id as string, d]));
  const vade: { id: string; kutu: number; t: number }[] = [];
  const yeni: string[] = [];
  const bilinen: { id: string; t: number }[] = [];
  const bekleyen: { id: string; t: number }[] = [];
  for (const { id } of havuzQ.data ?? []) {
    const d = durum.get(id as string);
    if (!d) yeni.push(id as string);
    else if (d.bilinen) bilinen.push({ id: id as string, t: Date.parse(d.son_zaman as string) || 0 });
    else if (d.acik_hata && d.sonraki_tekrar && Date.parse(d.sonraki_tekrar as string) <= simdi)
      vade.push({ id: id as string, kutu: Number(d.kutu), t: Date.parse(d.sonraki_tekrar as string) });
    else bekleyen.push({ id: id as string, t: Date.parse((d.sonraki_tekrar ?? d.son_zaman) as string) || 0 });
  }
  return [
    ...vade.sort((a, b) => a.kutu - b.kutu || a.t - b.t).map((x) => x.id),
    ...kaynaklaraDagit(karistir(yeni), kaynak),
    ...bilinen.sort((a, b) => a.t - b.t).map((x) => x.id),
    ...bekleyen.sort((a, b) => a.t - b.t).map((x) => x.id),
  ].slice(0, adet);
}

/** Aynı vaka metnini paylaşan soruları ilk geçtikleri yerde, kitap sırasıyla bir araya toplar. */
async function vakaGrupla(supabase: Istemci, userId: string, idler: string[]) {
  const { data } = await supabase
    .from("sorular")
    .select("id, set_id, sira, vaka_metni")
    .eq("user_id", userId)
    .in("id", idler)
    .not("vaka_metni", "is", null);
  if (!data?.length) return idler;
  const anahtar = new Map(data.map((s) => [s.id as string, `${s.set_id}|${s.vaka_metni}`]));
  const sira = new Map(data.map((s) => [s.id as string, Number(s.sira) || 0]));
  const gruplar = new Map<string, string[]>();
  for (const id of idler) {
    const a = anahtar.get(id);
    if (a) gruplar.set(a, [...(gruplar.get(a) ?? []), id]);
  }
  const sonuc: string[] = [];
  const yazildi = new Set<string>();
  for (const id of idler) {
    const a = anahtar.get(id);
    if (!a) sonuc.push(id);
    else if (!yazildi.has(a)) {
      yazildi.add(a);
      sonuc.push(...(gruplar.get(a) ?? []).sort((x, y) => (sira.get(x) ?? 0) - (sira.get(y) ?? 0)));
    }
  }
  return sonuc;
}

/** Listeyi kaynaklar arasında sırayla dağıtır (A, B, A, B, ...); her kaynağın kendi sırası korunur. */
function kaynaklaraDagit(idler: string[], kaynak: (id: string) => string) {
  const gruplar = new Map<string, string[]>();
  for (const id of idler) {
    const k = kaynak(id);
    gruplar.set(k, [...(gruplar.get(k) ?? []), id]);
  }
  const listeler = karistir([...gruplar.values()]);
  const sonuc: string[] = [];
  for (let i = 0; sonuc.length < idler.length; i++) {
    for (const l of listeler) if (i < l.length) sonuc.push(l[i]);
  }
  return sonuc;
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
    zayif: "Öncelikli konular",
    yanlis: "Yanlışlarım tekrarı",
  };
  return `${adlar[mod] ?? "Deneme"} - ${tarih}`;
}
