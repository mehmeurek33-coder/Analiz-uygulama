#!/usr/bin/env python3
"""
Sekil/tablo iceren sorularin KOKUNU sayfadan keser (OCR sekli metne dokemez).

Kullanim: python3 -I soru_gorsel.py <scratchpad> [--yalniz KK] [--hepsi]
Girdi/cikti aciklama_gorsel.py ile ayni duzende; cikti dizini kok/ :
  kok/KK-<numara>.webp ve kok/liste.json {"KK": {"numara": "dosya"}} + rapor (+ kok/rapor.json)

Kok bolgesi: soru numarasinin satiri -> "A)" sikkinin hemen ustu. Sekil sayilan durumlar:
  - bolgede metin satiri olmayan ama murekkep bulunan >= SEKIL_PX yuksekliginde alan
    (fotograf, grafik, cizim), ya da
  - bolgeye denk gelen iki sutuna yayilan bant (tablo/sekil).
--hepsi: sekil aramadan her sorunun kokunu keser (deneme/inceleme icin).
"""
import json
import os
import re
import sys

S = sys.argv[1]
sys.path.insert(0, os.path.join(S, "araclar"))
os.environ.setdefault("GORSEL_CIKIS", os.path.join(S, "kok"))
import aciklama_gorsel as ag  # noqa: E402
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

YALNIZ = sys.argv[sys.argv.index("--yalniz") + 1] if "--yalniz" in sys.argv else None
HEPSI = "--hepsi" in sys.argv
CIKIS = os.environ["GORSEL_CIKIS"]
os.makedirs(CIKIS, exist_ok=True)
SEKIL_PX = 70  # 300 dpi'da ~6 mm: satir arasi bosluk bundan kucuk


def metin_satiri_mi(t):
    """OCR'in sekil ustunde urettigi cop satirlar metin sayilmasin."""
    t = (t or "").strip()
    harf = sum(ch.isalpha() for ch in t)
    return len(t) >= 6 and harf >= 0.6 * len(t)


_metin_satirlari = {}


def metin_kutulari(k, sut):
    if not _metin_satirlari:
        for sf, st, ust, alt, metin, _ in ag.satirlar:
            if metin_satiri_mi(metin):
                _metin_satirlari.setdefault((sf, st), []).append((ust, alt))
    return _metin_satirlari.get((k, sut), [])


def sekil_alani(p):
    """Parcada metin satiri disinda kalan en uzun murekkepli dikey alan (px)."""
    im = Image.open(f"{ag.PNG}/k{p['sayfa']:03d}-{p['sutun']}.png").convert("L")
    ust, alt = max(0, p["ust"]), min(im.height, p["alt"])
    if alt - ust < SEKIL_PX:
        return 0
    dizi = np.asarray(im.crop((0, ust, im.width, alt))) < 160
    murekkepli = dizi.sum(axis=1) > 0.01 * im.width
    kapali = np.zeros(alt - ust, dtype=bool)
    for a, b in metin_kutulari(p["sayfa"], p["sutun"]):
        kapali[max(a - 8 - ust, 0):max(min(b + 8, alt) - ust, 0)] = True
    en_uzun = calisan = bosluk = 0
    for y in range(alt - ust):
        if not kapali[y] and murekkepli[y]:
            calisan += 1 + bosluk
            bosluk = 0
            en_uzun = max(en_uzun, calisan)
        elif calisan and bosluk < 25 and not kapali[y]:
            bosluk += 1  # sekil icindeki kisa beyaz seritler
        else:
            calisan = bosluk = 0
    return en_uzun


def kok_parcalari(en, ilk_sik):
    parcalar = ag.bolgeler(range(en, ilk_sik))
    if not parcalar:
        return parcalar
    son, a_satir = parcalar[-1], ag.satirlar[ilk_sik]
    for i, p in enumerate(parcalar):
        ust_sinir, alt_sinir = ag.murekkep_siniri(p["sayfa"], p["sutun"])
        sonraki = parcalar[i + 1] if i + 1 < len(parcalar) else None
        onceki = parcalar[i - 1] if i else None
        if onceki and (onceki["sayfa"], onceki["sutun"]) != (p["sayfa"], p["sutun"]):
            p["ust"] = ag.ust_sinirla(p, ust_sinir)
        if sonraki is None and (a_satir[0], a_satir[1]) == (p["sayfa"], p["sutun"]):
            # "A)" satirinin hemen ustune kadar (kes() alta PAY ekler)
            p["alt"] = ag.alt_sinirla(p, a_satir[2] - ag.PAY - 4)
        elif sonraki is not None and (sonraki["sayfa"], sonraki["sutun"]) != (p["sayfa"], p["sutun"]):
            p["alt"] = ag.alt_sinirla(p, alt_sinir)
    del son
    return parcalar


def main():
    import glob

    liste, rapor, ayrinti = {}, {"soru": 0, "sekilli": 0, "baslangic_yok": 0, "sik_yok": 0}, []
    for f in sorted(glob.glob(f"{S}/hazir/*.json")):
        kk = os.path.basename(f)[:2]
        if YALNIZ and kk != YALNIZ:
            continue
        a, b = ag.bolum_araligi(int(kk))
        liste[kk] = {}
        for q in json.load(open(f, encoding="utf-8"))["sorular"]:
            rapor["soru"] += 1
            en = ag.soru_baslangici(q, a, b)
            if en is None:
                rapor["baslangic_yok"] += 1
                continue
            ilk_sik = None
            for idx in range(en + 1, min(en + 120, ag.n)):
                if any(ag.HARF.get(m.group(1), m.group(1)) == "A" for m in ag.SECENEK.finditer(ag.satirlar[idx][4])):
                    ilk_sik = idx
                    break
            if ilk_sik is None:
                rapor["sik_yok"] += 1
                continue
            parcalar = kok_parcalari(en, ilk_sik)
            alan = max((sekil_alani(p) for p in parcalar), default=0)
            bant = any(
                not (bb < p["ust"] or aa > p["alt"])
                for p in parcalar
                for aa, bb in ag.yayilan_bantlar(p["sayfa"])
            )
            if not (HEPSI or alan >= SEKIL_PX or bant):
                continue
            no = q["numara"]
            anahtar = str(no) if no is not None else "_" + q["metin"][:40]
            dosya = f"{kk}-{no if no is not None else 'x' + str(abs(hash(q['metin'])) % 10**8)}.webp"
            if ag.kes(parcalar, os.path.join(CIKIS, dosya)):
                liste[kk][anahtar] = dosya
                rapor["sekilli"] += 1
                ayrinti.append({"dosya": dosya, "alan_px": alan, "bant": bant, "metin": q["metin"][:90]})

    yol = os.path.join(CIKIS, "liste.json")
    if YALNIZ and os.path.exists(yol):
        eski = json.load(open(yol, encoding="utf-8"))
        eski.update(liste)
        liste = eski
    json.dump(liste, open(yol, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(ayrinti, open(os.path.join(CIKIS, "rapor.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps(rapor, ensure_ascii=False))


if __name__ == "__main__":
    main()
