#!/usr/bin/env python3
"""
yapi.json (meditus_yapi.py) -> temizlenmis soru listesi <D>/sorular.json
  [{anahtar, bolum, no, metin, secenekler{A..E}, dogru_cevap, sorun[]}]
Sik isaretleri OCR'da bozulabiliyor (G) = C), 0) = D), €) = E)): sirayla A, B, C, D, E beklenir.
Kullanim: python3 -I meditus_soru.py <D>
"""
import collections
import json
import re
import sys

D = sys.argv[1]
sys.argv = [sys.argv[0], D]
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
import yeni_baski as yb  # noqa: E402

YAPI = json.load(open(f"{D}/yapi.json", encoding="utf-8"))
ISARET = re.compile(r'''(?:^|(?<=[\s.]))[-(\[GOo0©6«“"'.]{0,3}(?:([A-E8G©€0O6&£Ğ])[cyY]?\s?[)\]}]|(E)[Yy](?=\s?\S)|(A)[jJ][iıI]?)\s*''')
HARF = dict(yb.HARF)

# kelime sikligi: "omikroorganizmalardan" gibi basina "o" yapismis kelimeleri ayiklamak icin
kelimeler = collections.Counter(w.lower() for s in yb.satirlar for w in re.findall(r"[A-Za-zÇĞİÖŞÜçğıöşü]{3,}", s[4]))
# ek sozluk (temiz metinli kaynaklar, orn. TTS sorulari + aciklamalari): <D>/sozluk.json [kelime, ...]
import os as _os  # noqa: E402
if _os.path.exists(f"{D}/sozluk.json"):
    for _w in json.load(open(f"{D}/sozluk.json", encoding="utf-8")):
        kelimeler[_w.lower()] += 3
# kelime -> duzeltme (OCR hatalari; elle cikarildi): <D>/kelime_duzelt.json
DUZ = json.load(open(f"{D}/kelime_duzelt.json", encoding="utf-8")) if _os.path.exists(f"{D}/kelime_duzelt.json") else {}


def temizle(t):
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"(?<=\s)[oO0]\s(?=\S)", "", t)                        # tek basina "o" / "O"
    t = re.sub(r"\(\s?[oO0]\s*(?=[A-Za-zÇĞİÖŞÜçğıöşü(])", "(", t)      # "(Obagli" -> "(bagli"
    t = re.sub(r"\(\(", "(", t)
    t = re.sub(r"(?<=[a-zçğıöşü])! (?=[a-zçğıöşü])", "/ ", t)        # "mikroorganizma! mikro..." -> "/"

    def yapisik(m):
        w = m.group(0)
        for govde in (w[1:], w[2:]):
            if kelimeler[w.lower()] <= 2 and kelimeler[govde.lower()] >= max(3, 4 * kelimeler[w.lower()]):
                return govde
        return w
    t = re.sub(r"\b[oO]{1,2}[a-zçğıöşü]{4,}", yapisik, t)
    if DUZ:
        t = re.sub(r"[A-Za-zÇĞİÖŞÜçğıöşü][\w'-]*", lambda m: DUZ.get(m.group(0), m.group(0)), t)
    # alti cizili kelimenin cizgisi "(" olarak okunuyor: kapanmayan "(" sil
    parca, acik = [], []
    for i, ch in enumerate(t):
        if ch == "(":
            acik.append(len(parca))
        elif ch == ")" and acik:
            acik.pop()
        parca.append(ch)
    for i in reversed(acik):
        parca[i] = ""
    t = "".join(parca)
    t = re.sub(r"\s+([,.;:?!)])", r"\1", t)
    t = re.sub(r"\bIi(?=g[GAMDE]\b)", "I", t)
    # interlökin adlari: "1L-6", "14-12", "11-10" -> "IL-6" (yas/sure/olcu degilse)
    t = re.sub(r"(?<![\w-])(?:1L|11|14|İL|Il|lL|1l|İl)\s?-\s?(1[0-9]|[1-9])\b(?!\s*(?:yaş|gün|ay\b|saat|hafta|mm|cm|kg|%|kez|sa\b))",
               r"IL-\1", t)
    t = re.sub(r"(?<![A-Za-zÇĞİÖŞÜçğıöşü])om?(?=[A-ZÇĞİÖŞÜ])", "", t)                  # "oCD4", "omMuayenede"
    t = re.sub(r"(?<![A-Za-zÇĞİÖŞÜçğıöşü])[Jji](?=enfosit)", "l", t)                  # "Jenfosit" -> "lenfosit"
    t = re.sub(r"(?<=[a-zçğıöşü])(?=(?:Hasta|Muayene|Kültür|Bu |Daha|Ayrıca)[a-zçğıöşü])", " ", t)                          # "IigG" -> "IgG"
    t = re.sub(r"\b[iİ]\.(?=[a-zçğıöşü]{3,})", "L", t)                  # "i.ökosidin" -> "Lökosidin"
    t = re.sub(r"\s{2,}", " ", t)
    return t.strip()


def siklar(y):
    metin = " ".join(yb.satirlar[i][4] for i in range(y["sik_ilk"], y["sik_son"] + 1))
    beklenen, konum = "ABCDE", []
    for m in ISARET.finditer(metin):
        g = m.group(1) or m.group(2) or m.group(3)
        h = HARF.get(g, {"Ğ": "C"}.get(g, g))
        if len(konum) < 5 and h == beklenen[len(konum)]:
            konum.append((h, m.start(), m.end()))
    sonuc = {}
    for k, (h, bas, son) in enumerate(konum):
        bit = konum[k + 1][1] if k + 1 < len(konum) else len(metin)
        sonuc[h] = temizle(metin[son:bit]).rstrip(",;")
    return sonuc


# Elle (sayfa goruntusunden) okunmus siklar ve sik bitis satiri duzeltmeleri
import os  # noqa: E402
ELLE = json.load(open(f"{D}/elle_sik.json", encoding="utf-8")) if os.path.exists(f"{D}/elle_sik.json") else {}
SIK_SON = json.load(open(f"{D}/sik_son.json", encoding="utf-8")) if os.path.exists(f"{D}/sik_son.json") else {}
ELLE_KOK = json.load(open(f"{D}/elle_kok.json", encoding="utf-8")) if os.path.exists(f"{D}/elle_kok.json") else {}
ROMA = ["I", "II", "III", "IV", "V", "VI", "VII"]
ROM = re.compile(r"^\W{0,3}(?:HE|[IiİlL1|HNMVWYvOo!]{1,4})(?:\s?[.,:]{1,2}\s?|\s)(?=\S)")
ROM_COP = re.compile(r"^(?:[oO—–-]\s+)+")


def kok_metni(y):
    """Oncul listeli (I. II. ...) koklerde maddeleri sirayla yeniden numaralar, her maddeyi ayri satira koyar."""
    satir = [y["kok"].split(" ")[0] and None]
    ilk = yb.satirlar[y["bas"]][4]
    m = yb.BAS.match(ilk) or re.match(r"^.*?\d{1,3}\s?[.,]\s*(.*)$", ilk)
    satir = [m.group(m.lastindex) if m else ilk] + [yb.satirlar[j][4] for j in range(y["bas"] + 1, y["sik_ilk"])]
    satir = [t for t in satir if t.strip()]
    madde = [bool(ROM.match(t)) for t in satir]
    if sum(madde) < 2 or not madde[0]:
        return temizle(y["kok"])
    parca, k = [], 0
    for t, mi in zip(satir, madde):
        if mi and k < len(ROMA):
            parca.append(f"{ROMA[k]}. " + temizle(ROM_COP.sub("", ROM.sub("", t, count=1))))
            k += 1
        elif parca and k and not re.search(r"(hangi|nedir|\?)", " ".join(satir[satir.index(t):])) is None and False:
            parca[-1] += " " + temizle(t)
        else:
            parca.append(temizle(t))
    # madde devam satirlarini birlestir: madde olmayan ve kucuk harfle baslayan satir onceki maddeye eklenir
    sonuc = []
    for t in parca:
        if sonuc and (not re.match(r"^(?:[IVX]+\.|[A-ZÇĞİÖŞÜ0-9\"“(])", t)
                      or (sonuc[-1].count("(") > sonuc[-1].count(")") and not re.match(r"^[IVX]+\. ", t))):
            sonuc[-1] += " " + t
        else:
            sonuc.append(t)
    # son maddeden sonraki soru cumlesi tek satir
    son_madde = max(i for i, t in enumerate(sonuc) if re.match(r"^[IVX]+\. ", t))
    return "\n".join(sonuc[:son_madde + 1] + ([temizle(" ".join(sonuc[son_madde + 1:]))] if sonuc[son_madde + 1:] else []))


cikti, sorunlu = [], 0
for y in YAPI:
    if y["eski_id"] in SIK_SON:
        y["sik_son"] = SIK_SON[y["eski_id"]]
    s = ELLE.get(y["eski_id"]) or (siklar(y) if y["sik_son"] is not None else {})
    # son sikkin alt satira tasan devami: aciklamaya kadar degil, yalnizca sik_son'a kadar alinir
    sorun = []
    if list(s) != list("ABCDE"):
        sorun.append(f"sik {''.join(s)}")
    if any(not v for v in s.values()):
        sorun.append("bos sik")
    metin = ELLE_KOK.get(y["eski_id"]) or kok_metni(y)
    if len(metin) < 15 or "?" not in metin and not re.search(r"(hangisi|hangileri|nedir|denir|verilir)", metin):
        sorun.append("kok")
    sorunlu += bool(sorun)
    cikti.append({"anahtar": y["eski_id"], "bolum": y["bolum"], "no": y["no"], "metin": metin, "secenekler": s,
                  "dogru_cevap": y["cevap"], "sorun": sorun})
json.dump(cikti, open(f"{D}/sorular.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(json.dumps({"soru": len(cikti), "sorunlu": sorunlu,
                  "sorun_turu": collections.Counter(x for c in cikti for x in c["sorun"]).most_common(12)},
                 ensure_ascii=False))
