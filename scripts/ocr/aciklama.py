#!/usr/bin/env python3
"""
Hazir sorularin kitap aciklamalarini OCR metninden cikarir.

Kullanim: python3 -I aciklama.py <scratchpad>
Cikti: <scratchpad>/aciklamalar.json  {"KK": {"numara": "aciklama", ...}, ...}  + rapor

Yontem: soru numarasiyla baslayan satiri (kok benzerligiyle dogrulanmis) bul; son sikkin
bittigi yerden, sorunun kendi "Dogru cevap: X" satirina kadar olan metin aciklamadir.
"Soyle de sorulabilirdi" kutulari ayristir.py'deki gibi bastan atilir.
"""
import difflib
import glob
import json
import os
import re
import sys

S = sys.argv[1]
sys.path.insert(0, os.path.join(S, "araclar"))
from bolumler import BOLUMLER, SON_SAYFA  # noqa: E402

OCR = os.path.join(S, "ocr", "sayfa")
HARF = {"8": "B", "G": "C", "©": "C", "6": "C", "€": "E", "£": "E", "&": "E", "0": "D", "O": "D"}
CEVAP = re.compile(r"Do[ğg]ru\s*cevap\s*[:;.]?\s*([A-E8G©€0O6&£])\b", re.I)
BASLANGIC = re.compile(r"^[\s\W_]{0,3}?(\d{1,3})\s?[.,]\s*(\S.*)$")
SECENEK = re.compile(r"(?:^|\s)\(?[GOo0©6]?([A-E8G©€0O6&£])\s?[)\]}]")
VARYANT = re.compile(r"(sorulab|ba[sş]ka bir ho[cç]a|[sş][oö]yle de sor)", re.I)
DUS = re.compile(r"\(?\s*\bD\s?[UÜ]\s?S\b[^()]{0,30}?uyg[uüv]n\w*\s*\)?\.?", re.I)
YAN_SEKME = re.compile(r"^(Viroloji|İmmünoloji|Immünoloji|Bakteriyoloji|Mikoloji|Parazitoloji|Temel Mikrobiyoloji)$")


def norm(t):
    return re.sub(r"[^0-9a-zçğıöşü]", "", (t or "").lower())


# ---------------------------------------------------------------- satirlar
satirlar = []
for k in range(1, SON_SAYFA + 1):
    for sut in "LR":
        yol = f"{OCR}/k{k:03d}-{sut}.txt"
        if os.path.exists(yol):
            for x in open(yol, encoding="utf-8"):
                satirlar.append((k, x.rstrip("\n").strip()))
n = len(satirlar)
i = 0
while i < n:
    if VARYANT.search(satirlar[i][1]):
        j = i
        while j < min(i + 40, n) and not CEVAP.search(satirlar[j][1]):
            j += 1
        if j < min(i + 40, n):
            for t in range(i, j + 1):
                satirlar[t] = (satirlar[t][0], "")
            i = j
    i += 1

# sayfa -> ilk satir indeksi
sayfa_ilk = {}
for idx, (sf, _) in enumerate(satirlar):
    sayfa_ilk.setdefault(sf, idx)


def aralik(bas, son):
    a = sayfa_ilk.get(max(1, bas), 0)
    b = sayfa_ilk.get(son + 1, n)
    return a, b


def paragraflar(lines):
    """OCR satirlarini okunur paragraflara birlestirir."""
    out = ""
    for t in lines:
        t = DUS.sub("", t).strip()
        if not t or YAN_SEKME.match(t) or re.fullmatch(r"[\W\d_]{1,4}", t):
            continue
        yeni_satir = bool(re.match(r"^[•✓✔√v>»\-\*–]\s|^[•✓✔√]|^[A-ZÇĞİÖŞÜ][^.]{0,40}:\s", t))
        if not out:
            out = t
        elif yeni_satir or out.endswith((".", ":", "!", "?", "…")):
            out += "\n" + t
        elif out.endswith("-") and not out.endswith(" -"):
            out = out[:-1] + t
        else:
            out += " " + t
    out = re.sub(r"[ \t]{2,}", " ", out)
    out = re.sub(r"^\s*[v√✓✔]\s*", "• ", out, flags=re.M)
    return out.strip()


sonuc, rapor = {}, {"soru": 0, "bulunan": 0, "harf_uyusmaz": 0, "baslangic_yok": 0, "cevap_yok": 0, "kisa": 0}
for f in sorted(glob.glob(f"{S}/hazir/*.json")):
    k = int(os.path.basename(f)[:2])
    bas = BOLUMLER[k][0]
    son = BOLUMLER[k + 1][0] if k + 1 < len(BOLUMLER) else SON_SAYFA
    a, b = aralik(bas - 1, son + 1)
    sorular = json.load(open(f, encoding="utf-8"))["sorular"]
    sonuc[f"{k:02d}"] = {}
    for q in sorular:
        rapor["soru"] += 1
        no = q["numara"]
        hedef = norm(q["metin"])[:120]
        # 1) baslangic: numarali satir + kok benzerligi; numarasiz ise kok metniyle ara
        en, en_oran = None, 0.0
        for idx in range(a, b):
            m = BASLANGIC.match(satirlar[idx][1])
            if no is not None and not (m and int(m.group(1)) == no):
                continue
            ilk = (m.group(2) if m else satirlar[idx][1])
            metin = norm(" ".join([ilk] + [satirlar[j][1] for j in range(idx + 1, min(idx + 8, n))]))[:120]
            if not metin:
                continue
            oran = difflib.SequenceMatcher(None, hedef, metin).ratio()
            if oran > en_oran:
                en, en_oran = idx, oran
        if en is None or en_oran < 0.45:
            rapor["baslangic_yok"] += 1
            continue
        # 2) bitis: sorunun "Dogru cevap" satiri (sonraki soru baslamadan)
        bitis, harf = None, None
        for idx in range(en + 1, min(en + 260, n)):
            t = satirlar[idx][1]
            m = CEVAP.search(t)
            if m:
                bitis, harf = idx, HARF.get(m.group(1).upper(), m.group(1).upper())
                break
            m2 = BASLANGIC.match(t)
            if m2 and no is not None and int(m2.group(1)) == no + 1 and idx > en + 6:
                break
        if bitis is None:
            rapor["cevap_yok"] += 1
            continue
        if harf != q["dogru_cevap"]:
            rapor["harf_uyusmaz"] += 1
            continue
        # 3) siklarin bittigi yer: son sik etiketinin bulundugu satir
        son_harf = sorted(q["secenekler"])[-1]
        son_sik_metin = norm(q["secenekler"][son_harf])
        sik_son = None
        for idx in range(en + 1, bitis):
            for m in SECENEK.finditer(satirlar[idx][1]):
                if HARF.get(m.group(1), m.group(1)) == son_harf:
                    sik_son = idx
        if sik_son is None:
            rapor["cevap_yok"] += 1
            continue
        govde = []
        for idx in range(sik_son + 1, bitis):
            t = satirlar[idx][1]
            # son sikkin alt satira tasan devami
            if not govde and t and norm(t) and norm(t) in son_sik_metin:
                continue
            govde.append(t)
        metin = paragraflar(govde)
        if len(metin) < 25:
            rapor["kisa"] += 1
            continue
        sonuc[f"{k:02d}"][str(no) if no is not None else "_" + q["metin"][:40]] = metin
        rapor["bulunan"] += 1

json.dump(sonuc, open(f"{S}/aciklamalar.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps(rapor, ensure_ascii=False))
