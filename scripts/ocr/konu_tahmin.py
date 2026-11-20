#!/usr/bin/env python3
"""
Etiketli sorulardan (TTS) en yakin komsu ile konu tahmini.
Kullanim: python3 -I konu_tahmin.py <D>   (<D>/tts_etiket.json, <D>/sorular.json, <D>/yapi.json)
Cikti: <D>/konu.json {anahtar: {konu, alt_konu, guven, ikinci}} + birini-disarida-birak dogrulugu
"""
import collections, json, math, re, sys
import numpy as np

D = sys.argv[1]
sys.argv = [sys.argv[0], D]
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
import yeni_baski as yb  # noqa: E402

BOLUM = {
    1: ["Mikroorganizmaların Sınıflandırılması", "Bakterilerin Tanılama Yöntemi", "Bakteri Hücrelerinin Yapısı",
        "Bakterilerin Metabolizması ve Üretimi", "Bakteri Genetiği", "Bakteri Patogenezi",
        "Normal Vücut Florası (Mikrobiyota)", "Sterilizasyon ve Dezenfeksiyon Yöntemleri", "Antimikrobiyaller ve Aşılar"],
    2: ["Lenfoid Organlar", "İmmünite", "Sitokinler", "Bağışık Yanıt Hücrelerinin Olgunlaşma Süreci",
        "Bağışık Yanıt Hücrelerinin Özellikleri", "Büyük Doku Uygunluk Antijenleri", "Antijen Sunumu", "Antijen",
        "Antikor", "Kompleman Sistemi", "Aşırı Duyarlılık Reaksiyonları"],
    3: ["Gram Pozitif Koklar", "Gram Pozitif Sporlu Basiller", "Sporlu Gram Pozitif Anaerop Basiller",
        "Sporsuz Gram Pozitif Aerop Basiller", "Gram Negatif Diplokoklar",
        "Gram Negatif Enterik Bakteriler (Enterobacteriaceae)", "Oksidaz Pozitif Kıvrık Gram Negatif Basiller",
        "Gram Negatif Kokobasiller", "Non-fermentatif Gram Negatif Basiller", "Çeşitli Gram Negatif Bakteriler",
        "Mikobakteriler", "Spiroketler", "Borelyalar", "Leptospiralar", "Mikoplazmalar ve Üreplazmalar",
        "Riketsiyalar", "Coxiella, Anaplasma", "Klamidyalar", "Çeşitli Anaerop Bakteriler"],
    4: ["Genel Mikoloji", "Yüzeyel ve Kutanöz Mikozlar", "Subkutan (Deri Altı) Mikozlar",
        "Endemik (Sistemik, Derin) Dimorfik Mikozlar", "Fırsatçı Mikozlar", "Antifungal İlaçlar"],
    5: ["Genel Viroloji", "Antiviral İlaçlar ve Aşılar", "DNA Virüsleri", "RNA Virüsleri", "Negatif Kutuplu RNA Virüsleri",
        "Pozitif Kutuplu RNA Virüsleri", "Retrovirüsler", "Primer Hepatotrop Virüsler",
        "Prionlar ve Neden Olduğu Hastalıklar", "Serolojik Testler", "Enfeksiyon Hastalıklarında İstatistik"],
    6: ["Genel Parazitoloji", "Kan ve Doku Protozoonları", "Gastrointestinal Sistem Protozoonları",
        "Ürogenital Sistem Protozoonları", "Helmintler", "Sestodların Genel Özellikleri", "Trematodların Genel Özellikleri",
        "Safra Yolu Trematodları", "Venalar İçinde Yaşayan Trematodlar", "Akciğer Trematodu",
        "Gastrointestinal Sistem Trematodları", "Nematodların Genel Özellikleri", "İntestinal Nematodlar",
        "Kancalı Kurtlar (Çengelli Solucanlar)", "İntestinal ve Doku Nematodları", "Doku Nematodları", "Filaryalar"],
}
DUR = set("aşağıdakilerden hangisidir hangisi hangileri yukarıdaki olarak olan olup ilişkin neden olur ile için veya ve bir "
          "daha en sık doğru yanlış seçeneklerde yer alan diğer gibi ise bu da de".split())


def kokler(t):
    t = (t or "").replace("İ", "i").replace("I", "ı").lower()
    return [w[:6] for w in re.findall(r"[a-zçğıöşü0-9]{3,}", t) if w not in DUR]


def vektor(parcalar):
    c = collections.Counter()
    for metin, agirlik in parcalar:
        for k in kokler(metin):
            c[k] += agirlik
    return c


tts = json.load(open(f"{D}/tts_etiket.json", encoding="utf-8"))
etiket = [(vektor([(x["metin"], 2), (x["dogru"] or "", 3), (x["ac"], 1)]), x["konu"], x["alt_konu"]) for x in tts]
df = collections.Counter(k for v, _, _ in etiket for k in v)
N = len(etiket)
idf = {k: math.log((N + 1) / (n + 1)) + 1 for k, n in df.items()}


def norm(v):
    w = {k: (1 + math.log(c)) * idf.get(k, math.log(N + 1) + 1) for k, c in v.items()}
    z = math.sqrt(sum(x * x for x in w.values())) or 1
    return {k: x / z for k, x in w.items()}


E = [(norm(v), k, a) for v, k, a in etiket]


def tahmin(v, izinli, haric=None, k=7):
    q = norm(v)
    puan = []
    for i, (e, konu, alt) in enumerate(E):
        if i == haric or konu not in izinli:
            continue
        s = sum(x * e.get(t, 0) for t, x in q.items())
        puan.append((s, konu, alt))
    puan.sort(key=lambda x: -x[0])
    oy = collections.Counter()
    for s, konu, _ in puan[:k]:
        oy[konu] += s
    if not oy:
        return None, None, 0, None
    sira = oy.most_common(2)
    top = sum(oy.values()) or 1
    alt = next(a for s, kk, a in puan if kk == sira[0][0])
    return sira[0][0], alt, sira[0][1] / top, (sira[1][0] if len(sira) > 1 else None)


# birini disarida birak (bolum icinde)
konu_bolum = {k: b for b, ks in BOLUM.items() for k in ks}
dogru = toplam = 0
for i, (v, konu, _) in enumerate(etiket):
    b = konu_bolum.get(konu)
    if not b:
        continue
    t, _, _, _ = tahmin(v, set(BOLUM[b]), haric=i)
    dogru += t == konu
    toplam += 1
print(json.dumps({"loo_dogruluk": round(dogru / max(toplam, 1), 3), "n": toplam}))

YAPI = {y["eski_id"]: y for y in json.load(open(f"{D}/yapi.json", encoding="utf-8"))}
sonuc = {}
for s in json.load(open(f"{D}/sorular.json", encoding="utf-8")):
    y = YAPI[s["anahtar"]]
    ac = " ".join(yb.satirlar[i][4] for i in range(y["sik_son"] + 1, y["bitis"])) if y["bitis"] else ""
    v = vektor([(s["metin"], 2), (s["secenekler"].get(s["dogru_cevap"] or "", ""), 3), (ac[:600], 1)])
    izinli = set(BOLUM[s["bolum"]])
    if s["bolum"] == 3:
        izinli |= {"Antimikrobiyaller ve Aşılar", "Bakteri Patogenezi", "Bakterilerin Tanılama Yöntemi"}
    konu, alt, guven, ikinci = tahmin(v, izinli)
    sonuc[s["anahtar"]] = {"konu": konu, "alt_konu": alt, "guven": round(guven, 2), "ikinci": ikinci}
json.dump(sonuc, open(f"{D}/konu.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
g = [x["guven"] for x in sonuc.values()]
print(json.dumps({"soru": len(sonuc), "dusuk_guven(<0.5)": sum(1 for x in g if x < 0.5),
                  "dagilim": collections.Counter(x["konu"] for x in sonuc.values()).most_common(60)}, ensure_ascii=False))
