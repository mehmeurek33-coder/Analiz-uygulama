#!/usr/bin/env python3
"""
Yeni baskiyi (sutunlu OCR: <D>/ocr/tsv/pNNN-{L,R}.tsv) eski baskinin dogrulanmis sorulariyla
eslestirir ve her sorunun yeni baskidaki konumlarini cikarir.

Kullanim: python3 -I yeni_baski.py <D>      (<D>/eski_tam.json gerekli)
Cikti: <D>/yapi.json  [{aday, sayfa, no, eski_id|null, oran, kok, secenekler, cevap,
                         bas, sik_ilk, sik_son, bitis, bolum(eski bolum_no)}]
       + rapor (eslesen, yeni, cevabi farkli, eskide olup bulunamayan)
Modul olarak da kullanilir: satirlar, varyant isaretleri, yardimci fonksiyonlar.
"""
import csv
import difflib
import glob
import json
import os
import re
import sys

D = sys.argv[1]
HARF = {"8": "B", "G": "C", "©": "C", "6": "C", "€": "E", "£": "E", "&": "E", "0": "D", "O": "D"}
CEVAP = re.compile(r"Do[ğg]ru\s*cevap\s*[:;.]?\s*([A-E8G©€0O6&£])\b", re.I)
BAS = re.compile(r"^[\s\W_]{0,3}?(\d{1,3})\s?[.,]\s*(\S.{10,})$")
SECENEK = re.compile(r"(?:^|\s)\(?[GOo0©6]?([A-E8G©€0O6&£])\s?[)\]}]")
SIK_SATIRI = re.compile(r"^[\s\W]{0,3}[A-E8][)\]]")
VARYANT = re.compile(r"(sorulab|ba[sş]ka bir ho[cç]a|[sş][oö]yle de sor)", re.I)
SINAV = re.compile(r"\((?:[^()]*?(?:İlkbahar|Ilkbahar|Sonbahar|Eylül|Nisan)[^()]*)\)", re.I)


def norm(t):
    t = re.sub(r"\[[^\]]*\]", "", t or "")
    t = SINAV.sub("", t).lower()
    return re.sub(r"[^0-9a-zçğıöşü]", "", t)


# ---------------------------------------------------------------- satirlar
# [sayfa, sutun, ust, alt, metin, varyant_mi]
satirlar = []
for f in sorted(glob.glob(f"{D}/ocr/tsv/p*.tsv"), key=lambda x: (x[-9:-6], x[-5])):
    sayfa, sut = int(os.path.basename(f)[1:4]), os.path.basename(f)[5]
    g, sira = {}, []
    with open(f, encoding="utf-8") as fh:
        for r in csv.DictReader(fh, delimiter="\t", quoting=csv.QUOTE_NONE):
            if r["level"] != "5" or not (r["text"] or "").strip():
                continue
            a = (r["block_num"], r["par_num"], r["line_num"])
            if a not in g:
                g[a] = {"k": [], "ust": 10**9, "alt": 0}
                sira.append(a)
            x = g[a]
            x["k"].append(r["text"])
            ust, h = int(r["top"]), int(r["height"])
            x["ust"], x["alt"] = min(x["ust"], ust), max(x["alt"], ust + h)
    for a in sira:
        x = g[a]
        satirlar.append([sayfa, sut, x["ust"], x["alt"], " ".join(x["k"]).strip(), False])
n = len(satirlar)

# "Soyle de sorulabilirdi" kutulari: kendi "Dogru cevap" satirina kadar isaretle
i = 0
while i < n:
    if VARYANT.search(satirlar[i][4]):
        j = i
        while j < min(i + 40, n) and not CEVAP.search(satirlar[j][4]):
            j += 1
        if j < min(i + 40, n):
            for t in range(i, j + 1):
                satirlar[t][5] = True
            i = j
    i += 1


def harfler(t):
    return [HARF.get(m.group(1), m.group(1)) for m in SECENEK.finditer(t)]


def soru_yapisi(bas, son_sinir=None, no=None):
    """bas satirinda baslayan sorunun sik ve cevap satirlarini bulur."""
    sik_ilk = sik_son = bitis = None
    cevap = None
    gorulen = set()
    ust = min(bas + 900, n) if son_sinir is None else son_sinir
    for idx in range(bas + 1, ust):
        if satirlar[idx][5]:
            continue
        t = satirlar[idx][4]
        m = CEVAP.search(t)
        if m and sik_ilk is not None:
            bitis, cevap = idx, HARF.get(m.group(1).upper(), m.group(1).upper())
            break
        hs = harfler(t)
        if sik_ilk is None and "A" in hs and SIK_SATIRI.match(t):
            sik_ilk = idx
        if sik_ilk is not None and hs and len(gorulen) < 5:
            if set(hs) - gorulen:
                gorulen |= set(hs)
                sik_son = idx
        m2 = BAS.match(t)
        if (m2 and no is not None and int(m2.group(1)) == no + 1 and sik_ilk is not None
                and idx > sik_ilk + 1 and gorulen >= {"A", "B"} and not hs):
            # cevap satiri olmadan bir sonraki soru basladi
            break
    return sik_ilk, sik_son, bitis, cevap


def secenekleri_ayir(sik_ilk, sik_son):
    """Sik satirlarindan {harf: metin} (yeni sorular icin; sonradan gozle dogrulanir)."""
    metin = " ".join(satirlar[i][4] for i in range(sik_ilk, sik_son + 1) if not satirlar[i][5])
    parcalar = list(re.finditer(r"(?:^|\s)\(?([A-E8])\s?[)\]]\s*", metin))
    sonuc = {}
    for k, m in enumerate(parcalar):
        h = HARF.get(m.group(1), m.group(1))
        bas = m.end()
        bit = parcalar[k + 1].start() if k + 1 < len(parcalar) else len(metin)
        if h not in sonuc:
            sonuc[h] = metin[bas:bit].strip()
    return sonuc


def main():
    eski = json.load(open(f"{D}/eski_tam.json", encoding="utf-8"))
    for e in eski:
        e["n"] = norm(e["metin"])[:110]

    # aday soru baslangiclari
    adaylar = []
    for i, s in enumerate(satirlar):
        if s[5]:
            continue
        m = BAS.match(s[4])
        if not m or SIK_SATIRI.match(m.group(2)):
            continue
        sik_ilk, sik_son, bitis, cevap = soru_yapisi(i, no=int(m.group(1)))
        if sik_ilk is None or sik_ilk - i > 30:
            continue
        kok = " ".join([m.group(2)] + [satirlar[j][4] for j in range(i + 1, sik_ilk) if not satirlar[j][5]])
        adaylar.append({"bas": i, "sayfa": s[0], "no": int(m.group(1)), "kok": kok, "n": norm(kok),
                        "sik_ilk": sik_ilk, "sik_son": sik_son, "bitis": bitis, "cevap": cevap})

    def gram(t):
        return {t[k:k + 3] for k in range(max(len(t) - 2, 1))}

    eg = [gram(e["n"][:70]) for e in eski]
    # her aday icin en iyi eski soru; her eski soru en fazla bir adaya
    puanlar = []
    for ai, a in enumerate(adaylar):
        if len(a["n"]) < 20:
            continue
        g = gram(a["n"][:70])
        aday_e = sorted(range(len(eski)), key=lambda j: -len(g & eg[j]))[:12]
        for j in aday_e:
            u = len(eski[j]["n"])
            r = difflib.SequenceMatcher(None, a["n"][:u + 3], eski[j]["n"]).ratio()
            # siklar da benziyorsa guven artar
            if r >= 0.55:
                es = " ".join(eski[j]["secenekler"].get(h, "") for h in "ABCDE")
                ys = " ".join(satirlar[k][4] for k in range(a["sik_ilk"], (a["sik_son"] or a["sik_ilk"]) + 1))
                rs = difflib.SequenceMatcher(None, norm(ys)[:200], norm(es)[:200]).ratio()
                puanlar.append((0.65 * r + 0.35 * rs, ai, j, r, rs))
    puanlar.sort(reverse=True)
    a_es, e_es = {}, {}
    for p, ai, j, r, rs in puanlar:
        if p < 0.7 or ai in a_es or j in e_es:
            continue
        a_es[ai], e_es[j] = (j, p), ai

    # varyant/sahte adaylari ele: sinav etiketi ya da eslesme olmali
    yapi, onceki_bolum = [], None
    for ai, a in enumerate(adaylar):
        es = a_es.get(ai)
        e = eski[es[0]] if es else None
        etiketli = bool(re.search(r"(İlkbahar|Ilkbahar|Sonbahar)", a["kok"]))
        if not e and not etiketli:
            continue
        if e:
            onceki_bolum = e["bolum_no"]
        yapi.append({
            "aday": ai, "sayfa": a["sayfa"], "no": a["no"], "eski_id": e["id"] if e else None,
            "oran": round(es[1], 3) if es else None, "kok": a["kok"],
            "secenekler": secenekleri_ayir(a["sik_ilk"], a["sik_son"]) if a["sik_son"] is not None else {},
            "cevap": a["cevap"], "eski_cevap": e["dogru_cevap"] if e else None,
            "bas": a["bas"], "sik_ilk": a["sik_ilk"], "sik_son": a["sik_son"], "bitis": a["bitis"],
            "bolum": e["bolum_no"] if e else onceki_bolum,
        })
    json.dump(yapi, open(f"{D}/yapi.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    kayip = [e for j, e in enumerate(eski) if j not in e_es]
    json.dump([{"id": e["id"], "bolum": e["bolum_no"], "no": e["numara"], "kok": e["metin"][:150]} for e in kayip],
              open(f"{D}/kayip.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    farkli = [y for y in yapi if y["eski_id"] and y["cevap"] and y["cevap"] != y["eski_cevap"]]
    print(json.dumps({
        "aday": len(adaylar), "yapi": len(yapi), "eslesen": sum(1 for y in yapi if y["eski_id"]),
        "yeni": sum(1 for y in yapi if not y["eski_id"]), "eskide_bulunamayan": len(kayip),
        "cevabi_farkli": len(farkli), "cevapsiz": sum(1 for y in yapi if not y["cevap"]),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
