#!/usr/bin/env python3
"""
Aciklamayi bloklara ayirir: metin paragraflari + yalnizca kendisi kadar kirpilmis sekil/tablo/kutu
goruntuleri. Ayrica aciklamanin tam goruntusu ("Kitaptaki halini goster").

Kullanim: python3 -I aciklama_blok.py <D> [--yalniz eski_id,...] [--sinir N]
Girdi:  <D>/yapi.json (yeni_baski.py), <D>/ocr/{png,tsv}
Cikti:  <D>/blok/<soru_anahtari>.json  {"bloklar": [...], "metin": "...", "tam": "<anahtar>.webp"}
        <D>/blok/img/<anahtar>.webp (tam) ve <anahtar>-N.webp (parcalar)
Blok:   {"t": "m", "x": "paragraflar"} | {"t": "g", "yol": "...", "w": px, "h": px, "tur": "sekil|tablo|genis"}
"""
import json
import os
import re
import sys

import numpy as np
from PIL import Image

D = sys.argv[1]
sys.argv = [sys.argv[0], D] + sys.argv[2:]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import yeni_baski as yb  # noqa: E402

YALNIZ = set(sys.argv[sys.argv.index("--yalniz") + 1].split(",")) if "--yalniz" in sys.argv else None
SINIR = int(sys.argv[sys.argv.index("--sinir") + 1]) if "--sinir" in sys.argv else None
PNG = f"{D}/ocr/png"
CIKIS = f"{D}/blok"
os.makedirs(f"{CIKIS}/img", exist_ok=True)

PAY = 12
SUTUN_OLCEK = 0.72
TAM_OLCEK = 0.6
DUS = re.compile(r"\(?\s*\bD\s?[UÜ]\s?S\b[^()]{0,30}?uyg[uüv]n\w*\s*\)?\.?", re.I)

_im = {}


def resim(k, sut):
    a = (k, sut)
    if a not in _im:
        if len(_im) > 40:
            _im.clear()
        im = Image.open(f"{PNG}/p{k:03d}-{sut}.png").convert("L")
        _im[a] = (im, np.asarray(im))
    return _im[a]


# ---------------------------------------------------------------- satir kumeleri
BASLIK = re.compile(r"T[ÜU]M\s*TUS\s*SORULARI|^\W*M[İI]KROB[İI]YOLOJ[İI]\W*\d*\W*$|^\W*\d{1,3}\W*$", re.I)


def baslik_mi(t):
    return bool(BASLIK.search((t or "").strip()))


def metin_satiri_mi(t):
    t = (t or "").strip()
    harf = sum(ch.isalpha() for ch in t)
    return len(t) >= 4 and harf >= 0.55 * len(t)


satir_kutulari = {}
for idx, (sf, st, ust, alt, metin, varyant) in enumerate(yb.satirlar):
    satir_kutulari.setdefault((sf, st), []).append((ust, alt, idx))

_bant = {}


def dikey_cizgiler(koyu, en_az=140):
    """Ince dikey cizgiler (b, s, x); dolu bloklar (bolum sekmesi) haric."""
    w = koyu.shape[1]
    c, vb, vs = kosu_uzunluklari(koyu[:, ::2], 0)
    sonuc = []
    for x2, b2, s2 in zip(c, vb, vs):
        if s2 - b2 < en_az:
            continue
        x = int(x2) * 2
        yan = [xx for xx in (x - 14, x + 14) if 0 <= xx < w]
        if all(koyu[b2:s2, xx].mean() > 0.7 for xx in yan):
            continue
        sonuc.append((int(b2), int(s2), x))
    return sonuc


def cerceve_ciftleri(dikey, en_az_aralik, kosul=None):
    """Karsilikli kenar ciftleri -> [(b, s, x0, x1)] (dikey kapsamlari >= %75 ortusen)."""
    cer = []
    for i1 in range(len(dikey)):
        b1, s1, x1 = dikey[i1]
        for i2 in range(len(dikey)):
            b2, s2, x2 = dikey[i2]
            if x2 - x1 < en_az_aralik or (kosul and not kosul(x1, x2)):
                continue
            ort = min(s1, s2) - max(b1, b2)
            if ort >= 0.75 * min(s1 - b1, s2 - b2):
                cer.append([min(b1, b2), max(s1, s2), x1, x2])
    # ic ice / ortusen cerceveleri birlestir
    cer.sort()
    birlesik = []
    for b, s_, x0, x1 in cer:
        if birlesik and b <= birlesik[-1][1] + 10:
            g = birlesik[-1]
            g[1], g[2], g[3] = max(g[1], s_), min(g[2], x0), max(g[3], x1)
        else:
            birlesik.append([b, s_, x0, x1])
    return birlesik


def serit_ekle(koyu, cer):
    """Cercevenin hemen ustundeki/altindaki (60 px icinde) koyu seritleri (tablo adi, alt bant)
    ekler; genisligi de seritlerin/uzun yatay cizgilerin kapsamina gore buyutur."""
    h, w = koyu.shape
    for c in cer:
        b, s_, x0, x1 = c
        dolu = koyu.mean(axis=1) > 0.6  # serit (~%80 koyu); kalin metin satiri %35-50
        ust = [y for y in range(max(0, b - 60), b) if dolu[y]]
        if len(ust) >= 8 and b - max(ust) <= 20:
            y = min(ust)
            while y > 0 and dolu[y - 1]:
                y -= 1
            c[0] = y
        alt = [y for y in range(s_ + 1, min(h, s_ + 61)) if dolu[y]]
        if len(alt) >= 8 and min(alt) - s_ <= 20:
            y = max(alt)
            while y < h - 1 and dolu[y + 1]:
                y += 1
            c[1] = y
        # genislik: alandaki uzun yatay kosularin kapsami
        r, kb, ks = kosu_uzunluklari(koyu[c[0]:c[1] + 1], 1)
        uzun = (ks - kb) >= 0.3 * w
        if uzun.any():
            c[2] = min(c[2], int(kb[uzun].min()))
            c[3] = max(c[3], int(ks[uzun].max()))
    return cer








def yayilan_bantlar(k):
    """Iki sutuna yayilan tablo/kutu: sol kenari sol sutunda, sag kenari sag sutunda olan
    cerceve ciftleri (sayfa koordinati). [(ust, alt, x0, x1)]"""
    if k in _bant:
        return _bant[k]
    sol, a = resim(k, "L")
    sag, b_ = resim(k, "R")
    h = min(a.shape[0], b_.shape[0])
    t = np.concatenate([a[:h], b_[:h]], axis=1)
    koyu = t < 150
    lw = a.shape[1]
    cer = cerceve_ciftleri(dikey_cizgiler(koyu), 0.5 * lw, lambda x1, x2: x1 < lw - 40 and x2 > lw + 40)
    cer = serit_ekle(koyu, cer)
    # gercek yayilan tabloda yatay cizgiler/seritler sutun arasindan kesintisiz gecer
    serit = t[:, lw - 25:lw + 25]
    gecis = ((serit < 150).mean(axis=1) > 0.85) | ((serit < 232).mean(axis=1) > 0.95)
    _bant[k] = [tuple(c) for c in cer if c[1] - c[0] < 0.8 * h and gecis[c[0]:c[1] + 1].sum() >= 3]
    return _bant[k]


def murekkep_siniri(k, sut):
    """Sutunun icerik siniri: sayfa basligi/alt bilgi satirlari haric ilk ve son satir."""
    _, a = resim(k, sut)
    kutular = [(u, al) for u, al, i in satir_kutulari.get((k, sut), []) if not baslik_mi(yb.satirlar[i][4])]
    satir = (a < 160).mean(axis=1) > 0.003
    ys = np.nonzero(satir)[0]
    ust, alt = (int(ys[0]), int(ys[-1])) if len(ys) else (0, a.shape[0])
    basliklar = [(u, al) for u, al, i in satir_kutulari.get((k, sut), []) if baslik_mi(yb.satirlar[i][4])]
    for u, al in basliklar:
        if al < a.shape[0] * 0.12:
            ust = max(ust, al + 30)  # basligin altindaki cizgi de disarida kalsin
        elif u > a.shape[0] * 0.88:
            alt = min(alt, u - 10)
    return ust, alt


# ---------------------------------------------------------------- bolge
def bolgeler(idxler):
    parcalar, simdiki = [], None
    for idx in idxler:
        sf, sut, ust, alt, metin, varyant = yb.satirlar[idx]
        if varyant:
            if simdiki:
                parcalar.append(simdiki)
                simdiki = None
            continue
        if not metin or baslik_mi(metin):
            continue
        if simdiki and (simdiki["sayfa"], simdiki["sutun"]) == (sf, sut):
            simdiki["ust"], simdiki["alt"] = min(simdiki["ust"], ust), max(simdiki["alt"], alt)
            simdiki["satirlar"].append(idx)
        else:
            if simdiki:
                parcalar.append(simdiki)
            simdiki = {"sayfa": sf, "sutun": sut, "ust": ust, "alt": alt, "satirlar": [idx]}
    if simdiki:
        parcalar.append(simdiki)
    return parcalar


def varyant_kutulari(k, sut):
    return [(u, a) for u, a, i in satir_kutulari.get((k, sut), []) if yb.satirlar[i][5]]


def genislet(parcalar, sik_son, bitis):
    """OCR'in okuyamadigi kisimlar (gri kutu, sekil) da girsin: konuma gore genislet."""
    if not parcalar:
        return parcalar
    ss, bt = yb.satirlar[sik_son], yb.satirlar[bitis]
    for i, p in enumerate(parcalar):
        k, sut = p["sayfa"], p["sutun"]
        ust_s, alt_s = murekkep_siniri(k, sut)
        onceki = parcalar[i - 1] if i else None
        sonraki = parcalar[i + 1] if i + 1 < len(parcalar) else None
        vk = varyant_kutulari(k, sut)
        hedef_ust = hedef_alt = None
        if i == 0 and (ss[0], ss[1]) == (k, sut):
            hedef_ust = ss[3] + 4
        elif onceki and (onceki["sayfa"], onceki["sutun"]) != (k, sut):
            hedef_ust = ust_s
        if sonraki is None and (bt[0], bt[1]) == (k, sut):
            hedef_alt = bt[2] - 6
        elif sonraki is not None and (sonraki["sayfa"], sonraki["sutun"]) != (k, sut):
            hedef_alt = alt_s
        if hedef_ust is not None:
            for vu, va in vk:
                if hedef_ust < va <= p["ust"]:
                    hedef_ust = max(hedef_ust, va + 6)
            p["ust"] = min(p["ust"], hedef_ust)
        if hedef_alt is not None:
            for vu, va in vk:
                if p["alt"] <= vu < hedef_alt:
                    hedef_alt = min(hedef_alt, vu - 6)
            p["alt"] = max(p["alt"], hedef_alt)
    return parcalar


# ---------------------------------------------------------------- metin disi alanlar
def kosu_uzunluklari(maske, eksen):
    """Boolean dizide her satir (eksen=1) ya da sutun (eksen=0) icin kosular: (dizin, bas, son)."""
    m = maske if eksen == 1 else maske.T
    p = np.zeros((m.shape[0], m.shape[1] + 2), dtype=np.int8)
    p[:, 1:-1] = m
    d = np.diff(p, axis=1)
    r1, c1 = np.nonzero(d == 1)
    r2, c2 = np.nonzero(d == -1)
    return r1, c1, c2  # sirali: satir, sonra sutun -> bas/son ciftleri ayni sirada


_ozellik = {}


def kolon_ozellik(k, sut):
    a_ = (k, sut)
    if a_ in _ozellik:
        return _ozellik[a_]
    if len(_ozellik) > 60:
        _ozellik.clear()
    _, a = resim(k, sut)
    koyu = a < 150
    gri = (a >= 150) & (a < 232)
    w = a.shape[1]
    dik = dikey_cizgiler(koyu)
    cer = cerceve_ciftleri(dik, 0.25 * w)
    # tek dikey ayracli tablo: sutunun ortasinda (%15-85) uzun (>= 200 px) tek cizgi
    for b_, s2, x in dik:
        if s2 - b_ >= 200 and 0.15 * w < x < 0.85 * w and not any(c[0] - 20 <= b_ and s2 <= c[1] + 20 for c in cer):
            cer.append([b_, s2, 0, w - 1])  # genislik: kirpmada murekkep sinirina inilir
    # dikey cizgisi olmayan tablo: >= 3 ayri uzun yatay cizgi/serit, aralarinda <= 260 px
    r_, kb, ks = kosu_uzunluklari(koyu | gri, 1)
    uz = (ks - kb) >= 0.6 * w
    satir = np.zeros(a.shape[0], dtype=bool)
    satir[r_[uz]] = True
    parcalar_ = []
    y = 0
    ys = np.nonzero(satir)[0]
    for yy in ys:
        if parcalar_ and yy - parcalar_[-1][1] <= 2:
            parcalar_[-1][1] = yy
        else:
            parcalar_.append([yy, yy])
    grup = []
    for b_, s2 in parcalar_:
        if grup and b_ - grup[-1][-1][1] <= 260:
            grup[-1].append((b_, s2))
        else:
            grup.append([(b_, s2)])
    for g in grup:
        if len(g) >= 3:
            gb, gs = g[0][0], g[-1][1]
            if not any(not (gs < c[0] or gb > c[1]) for c in cer):
                xx = kb[uz & (r_ >= gb) & (r_ <= gs)]
                xs_ = ks[uz & (r_ >= gb) & (r_ <= gs)]
                cer.append([int(gb), int(gs), int(xx.min()), int(xs_.max())])
    o = {"w": w, "koyu": koyu, "gri": gri, "murekkep": koyu.mean(axis=1) > 0.01,
         "cerceve": serit_ekle(koyu, cer)}
    _ozellik[a_] = o
    return o


def metin_disi_alanlar(p):
    """Parcadaki metin disi alanlar: [(ust, alt, tur, x0, x1)] sutun koordinatinda.
    tablo/kutu = cerceve (kenar cifti) + bitisik baslik seridi; golge = cercevesiz gri kutu;
    sekil = metin satiri olmayan murekkepli alan."""
    k, sut = p["sayfa"], p["sutun"]
    _, a = resim(k, sut)
    ust, alt = max(0, p["ust"]), min(a.shape[0], p["alt"])
    if alt - ust < 10:
        return []
    o = kolon_ozellik(k, sut)
    w = o["w"]
    alanlar = []
    for b, s_, x0, x1 in o["cerceve"]:
        if s_ > ust and b < alt and min(s_, alt) - max(b, ust) >= 0.5 * (s_ - b):
            alanlar.append([b, s_, "tablo", x0, x1])
    # cercevesiz gri kutu: en az 80 px boyunca satirlarin %30'undan fazlasi gri
    golge = o["gri"][ust:alt].mean(axis=1) > 0.30
    bas = None
    for y in list(range(alt - ust)) + [None]:
        v = golge[y] if y is not None else False
        if v and bas is None:
            bas, son = y, y
        elif v:
            son = y
        elif bas is not None and (y is None or y - son > 12):
            if son - bas >= 80:
                kol = o["gri"][ust + bas:ust + son + 1].mean(axis=0) > 0.3
                xs = np.nonzero(kol)[0]
                cerceveli = any(not (son + ust < c[0] or bas + ust > c[1]) for c in alanlar if c[2] == "tablo")
                if len(xs) and not cerceveli:
                    alanlar.append([ust + bas, ust + son, "tablo", int(xs[0]), int(xs[-1])])
            bas = None
    # sekil: metin satiri olmayan murekkepli alan (>= 60 px)
    kapali = np.zeros(alt - ust, dtype=bool)
    for u, al, i in satir_kutulari.get((k, sut), []):
        if yb.satirlar[i][5] or not metin_satiri_mi(yb.satirlar[i][4]):
            continue
        kapali[max(u - 6 - ust, 0):max(min(al + 6, alt) - ust, 0)] = True
    for x, y in [(alanlar_b - ust, alanlar_s - ust) for alanlar_b, alanlar_s, *_ in alanlar]:
        kapali[max(x, 0):max(y + 1, 0)] = True
    m = o["murekkep"][ust:alt] & ~kapali
    bas = None
    for y in list(range(alt - ust)) + [None]:
        v = m[y] if y is not None else False
        if v and bas is None:
            bas, son = y, y
        elif v:
            son = y
        elif bas is not None and (y is None or y - son > 25):
            if son - bas + 1 >= 60:
                alanlar.append([ust + bas, ust + son, "sekil", None, None])
            bas = None
    alanlar.sort(key=lambda x: x[0])
    birlesik = []
    for b, s_, t, x0, x1 in alanlar:
        if birlesik:
            g = birlesik[-1]
            ort = min(g[1], s_) - max(g[0], b)
            bitisik_tablo = t != "sekil" and g[2] != "sekil" and b - g[1] <= 40
            if bitisik_tablo or (ort > 0 and (ort >= 0.3 * min(g[1] - g[0], s_ - b) or b <= g[1])):
                g[0], g[1] = min(g[0], b), max(g[1], s_)
                if g[2] == "sekil" and t != "sekil":
                    g[2], g[3], g[4] = t, x0, x1
                elif t != "sekil" and g[3] is not None and x0 is not None:
                    g[3], g[4] = min(g[3], x0), max(g[4], x1)
                continue
        birlesik.append([b, s_, t, x0, x1])
    return [tuple(x) for x in birlesik]


def sekme_at(dizi):
    """Kenardaki bolum sekmesini (en az 20 px kalinliginda dolu koyu dikey blok) beyazla."""
    d = dizi.copy()
    h, w = d.shape
    if h < 60:
        return d
    c, b_, s_ = kosu_uzunluklari(d < 120, 0)
    en_uzun = np.zeros(w, dtype=int)
    np.maximum.at(en_uzun, c, s_ - b_)
    dolu = en_uzun >= min(100, int(0.5 * h))
    for kenar in (range(0, min(170, w)), range(w - 1, max(w - 170, -1), -1)):
        xs = [x for x in kenar if dolu[x]]
        if len(xs) >= 20:
            x0, x1 = min(xs), max(xs)
            if x1 - x0 < 140:
                d[:, max(0, x0 - 6):min(w, x1 + 7)] = 255
    return d


def cizgi_kapsami(dizi):
    """Tablo/kutu: uzun yatay cizgilerin yatay kapsami (sekme ve basibos cizgiler disarida)."""
    w = dizi.shape[1]
    r, b_, s_ = kosu_uzunluklari(dizi < 150, 1)
    uzun = (s_ - b_) >= 0.3 * w
    if not uzun.any():
        return dizi
    x0, x1 = int(b_[uzun].min()), int(s_[uzun].max())
    if x1 - x0 < 0.3 * w:
        return dizi
    return dizi[:, max(0, x0 - 8):min(w, x1 + 9)]


def yatay_kirp(dizi, kenar=10, tablo=False):
    """Goruntuyu yatayda murekkep sinirina kirpar ("yalnizca kendisi kadar")."""
    if tablo:
        dizi = cizgi_kapsami(dizi)
    dizi = sekme_at(dizi)
    sutun = (dizi < 200).mean(axis=0) > 0.004
    xs = np.nonzero(sutun)[0]
    if not len(xs):
        return None
    satir = (dizi < 200).mean(axis=1) > 0.002
    # ustte/altta icerikten bosluklu ayrilmis tek ince cizgi (sayfa basligi alt cizgisi) at
    ys = np.nonzero(satir)[0]
    if len(ys):
        kos, bas = [], ys[0]
        for a_, b_ in zip(ys, ys[1:]):
            if b_ - a_ > 1:
                kos.append((bas, a_)); bas = b_
        kos.append((bas, ys[-1]))
        if len(kos) > 1 and kos[0][1] - kos[0][0] <= 8 and kos[1][0] - kos[0][1] >= 30:
            satir[kos[0][0]:kos[0][1] + 1] = False
        if len(kos) > 1 and kos[-1][1] - kos[-1][0] <= 8 and kos[-1][0] - kos[-2][1] >= 30:
            satir[kos[-1][0]:kos[-1][1] + 1] = False
    ys = np.nonzero(satir)[0]
    x0, x1 = max(0, xs[0] - kenar), min(dizi.shape[1], xs[-1] + kenar + 1)
    y0, y1 = max(0, ys[0] - kenar), min(dizi.shape[0], ys[-1] + kenar + 1)
    return dizi[y0:y1, x0:x1]


def kaydet(dizi, yol, olcek, kayipsiz):
    im = Image.fromarray(dizi)
    im = im.resize((max(1, round(im.width * olcek)), max(1, round(im.height * olcek))), Image.LANCZOS)
    if kayipsiz:
        adim = 255 / 3
        im = im.point(lambda v: int(round(round(v / adim) * adim)))
        im.save(yol, "WEBP", lossless=True, quality=100, method=4)
    else:
        im.save(yol, "WEBP", quality=60, method=4)
    return im.width, im.height


def tam_genislik(k, ust, alt):
    sol, _ = resim(k, "L")
    sag, _ = resim(k, "R")
    t = Image.new("L", (sol.width + sag.width, alt - ust), 255)
    t.paste(sol.crop((0, ust, sol.width, alt)), (0, 0))
    t.paste(sag.crop((0, ust, sag.width, alt)), (sol.width, 0))
    return np.asarray(t)


# ---------------------------------------------------------------- metin
def temizle(t):
    """Tesseract artiklari: tek basina "o" / "oO" onekleri, satir basi "mmm", "%" yerine "0"."""
    t = re.sub(r"(?<=\s)[oO]\s(?=[A-ZÇĞİÖŞÜ])", "", t)            # "... o İmpetigo" -> "İmpetigo"
    t = re.sub(r"(?<![A-Za-zÇçĞğİıÖöŞşÜü])oO(?=[a-zçğıöşü]{3,})", "", t)  # "oOsonrasi" -> "sonrasi" (yalniz "oO")
    t = re.sub(r"^\s*m{2,4}\s+", "", t, flags=re.M)               # satir basi "mmm"
    t = re.sub(r"\(0(\d{2})(?=[\s\-–)])", r"(%\1", t)            # "(090-100)" -> "(%90-100)"
    return t


def paragraflar(lines):
    out = ""
    for t in lines:
        t = DUS.sub("", t).strip()
        if not t or re.fullmatch(r"[\W\d_]{1,4}", t):
            continue
        yeni = bool(re.match(r"^[•✓✔√v>»\-\*–]\s|^[•✓✔√]|^[A-ZÇĞİÖŞÜ][^.]{0,40}:\s", t))
        if not out:
            out = t
        elif yeni or out.endswith((".", ":", "!", "?", "…")):
            out += "\n" + t
        elif out.endswith("-") and not out.endswith(" -"):
            out = out[:-1] + t
        else:
            out += " " + t
    # tesseract'in iki yana yaslı satirlarda urettigi artiklar: "(o ", "(O(", tek basina "Oo"
    out = re.sub(r"\(\s?[oO0]\s+(?=\S)", "", out)
    out = re.sub(r"\([oO0](?=\()", "", out)
    out = re.sub(r"(?<![A-Za-zÇçĞğİıÖöŞşÜü])(Oo|oo|OO|Oo0|0o|O0)(?![A-Za-zÇçĞğİıÖöŞşÜü])", " ", out)
    out = temizle(out)
    out = re.sub(r"[ \t]{2,}", " ", out)
    out = re.sub(r"^\s*[v√✓✔>»*]\s*", "• ", out, flags=re.M)
    return out.strip()


def bloklara_ayir(parcalar, anahtar):
    bloklar, bekleyen, sayac, konan_bant = [], [], 0, set()

    def metni_bosalt():
        nonlocal bekleyen
        x = paragraflar(bekleyen)
        if len(x) >= 3:
            if bloklar and bloklar[-1]["t"] == "m":
                bloklar[-1]["x"] += "\n" + x
            else:
                bloklar.append({"t": "m", "x": x})
        bekleyen = []

    def gorsel(dizi, tur, olcek, x_belli):
        nonlocal sayac
        d = yatay_kirp(dizi, kenar=6) if not x_belli else yatay_kirp(dizi, kenar=6)
        if d is None or d.shape[0] < 25 or d.shape[1] < 40:
            return
        sayac += 1
        ad = f"{anahtar}-{sayac}.webp"
        w, h = kaydet(d, f"{CIKIS}/img/{ad}", olcek, kayipsiz=(tur != "sekil"))
        metni_bosalt()
        bloklar.append({"t": "g", "yol": ad, "w": w, "h": h, "tur": tur})

    for p in parcalar:
        k, sut = p["sayfa"], p["sutun"]
        _, a = resim(k, sut)
        h = a.shape[0]
        lw = resim(k, "L")[1].shape[1]
        bantlar = []
        for b, s_, x0, x1 in yayilan_bantlar(k):
            if s_ > p["ust"] and b < p["alt"]:
                bantlar.append((b, s_, "genis", x0, x1))
        alanlar = [x for x in metin_disi_alanlar(p)
                   if not any(not (x[1] < b - 30 or x[0] > s_ + 30) for b, s_, *_ in bantlar)] + bantlar
        alanlar.sort(key=lambda x: x[0])
        satirlar = [(u, al, i) for u, al, i in satir_kutulari.get((k, sut), [])
                    if p["ust"] - 4 <= u and al <= p["alt"] + 4 and not yb.satirlar[i][5]
                    and not baslik_mi(yb.satirlar[i][4])]
        # bir alanin icinde kalan satirlar (sekil etiketleri, tablo hucreleri) metne girmez
        satirlar = [(u, al, i) for u, al, i in satirlar
                    if not any(b - 4 <= u and al <= s_ + 4 for b, s_, *_ in alanlar)]
        # sutun ici tablo sutun arasi kenara dayaniyorsa obur sutuna devam ediyordur: genis yap
        kenar = a[:, -15:] if sut == "L" else a[:, :15]
        yeni_alanlar = []
        for b, s_, tur, x0, x1 in alanlar:
            if tur == "tablo":
                dayanan = ((kenar[b:s_ + 1] < 232).mean(axis=1) > 0.9).sum()
                if dayanan >= 3:
                    tur = "genis"
            yeni_alanlar.append((b, s_, tur, x0, x1))
        alanlar = yeni_alanlar
        y = p["ust"]
        for b, s_, tur, x0, x1 in alanlar:
            for u, al, i in satirlar:
                if y - 4 <= u and al <= b + 4:
                    bekleyen.append(yb.satirlar[i][4])
            y0, y1 = max(0, b - PAY), min(h, s_ + PAY)
            if tur == "genis":
                if not any(abs(b - kb) < 60 for kk, kb in konan_bant if kk == k):
                    konan_bant.add((k, b))
                    t = tam_genislik(k, y0, y1)
                    gorsel(sekme_at(cizgi_kapsami(t)), "genis", TAM_OLCEK, True)
            elif x0 is not None:
                gorsel(sekme_at(a[y0:y1, max(0, x0 - 10):x1 + 11]), tur, SUTUN_OLCEK, True)
            else:
                gorsel(sekme_at(a[y0:y1]), tur, SUTUN_OLCEK, False)
            y = max(y, s_ + 1)
        for u, al, i in satirlar:
            if u >= y - 4:
                bekleyen.append(yb.satirlar[i][4])
    metni_bosalt()
    return bloklar


def tam_goruntu(parcalar, hedef):
    """Aciklamanin tamami (sutun parcalari alt alta, yayilan bantlar tam genislikte)."""
    resimler, konan = [], set()
    for p in parcalar:
        k = p["sayfa"]
        im, a = resim(k, p["sutun"])
        ust, alt = max(0, p["ust"] - PAY), min(a.shape[0], p["alt"] + PAY)
        y = ust
        for b, s, *_ in yayilan_bantlar(k):
            if s < ust or b > alt:
                continue
            if b > y + 20:
                resimler.append((a[y:b], SUTUN_OLCEK))
            if (k, b) not in konan:
                konan.add((k, b))
                resimler.append((tam_genislik(k, max(0, b - PAY), min(a.shape[0], s + PAY)), TAM_OLCEK))
            y = max(y, s + 1)
        if alt - y >= 20:
            resimler.append((a[y:alt], SUTUN_OLCEK))
    if not resimler:
        return None
    olcekli = [Image.fromarray(r).resize((round(r.shape[1] * o), round(r.shape[0] * o)), Image.LANCZOS) for r, o in resimler]
    gen = max(r.width for r in olcekli)
    yuk = sum(r.height for r in olcekli) + 20 * (len(olcekli) - 1)
    t = Image.new("L", (gen, yuk), 255)
    y = 0
    for r in olcekli:
        t.paste(r, ((gen - r.width) // 2, y))
        y += r.height + 20
    adim = 255 / 3
    t = t.point(lambda v: int(round(round(v / adim) * adim)))
    t.save(hedef, "WEBP", lossless=True, quality=80, method=4)
    return t.width, t.height


def main():
    yapi = json.load(open(f"{D}/yapi.json", encoding="utf-8"))
    rapor = {"soru": 0, "yazilan": 0, "aciklamasiz": 0, "gorselli": 0, "gorsel": 0}
    for y in yapi:
        anahtar = y["eski_id"] or f"yeni-{y['aday']}"
        if YALNIZ and anahtar not in YALNIZ:
            continue
        rapor["soru"] += 1
        if y["bitis"] is None or y["sik_son"] is None:
            rapor["aciklamasiz"] += 1
            continue
        govde = list(range(y["sik_son"] + 1, y["bitis"]))
        # son sikkin alt satira tasan devami
        son_sik = yb.norm(list(y["secenekler"].values())[-1]) if y["secenekler"] else ""
        while govde and son_sik and yb.norm(yb.satirlar[govde[0]][4]) and yb.norm(yb.satirlar[govde[0]][4]) in son_sik:
            govde.pop(0)
        while govde and len(yb.satirlar[govde[0]][4]) < 25 and yb.satirlar[govde[0]][4][:1].islower():
            govde.pop(0)
        parcalar = genislet(bolgeler(govde), y["sik_son"], y["bitis"])
        if not parcalar:
            rapor["aciklamasiz"] += 1
            continue
        bloklar = bloklara_ayir([dict(p) for p in parcalar], anahtar)
        tam = tam_goruntu([dict(p) for p in parcalar], f"{CIKIS}/img/{anahtar}.webp")
        # son sikkin tasan kelimesi ayni satira karismissa ("olurlar Hic kusku...")
        if bloklar and bloklar[0]["t"] == "m":
            bloklar[0]["x"] = re.sub(r"^[a-zçğıöşü]{2,14}\s+(?=[A-ZÇĞİÖŞÜ•])", "", bloklar[0]["x"])
        metin = "\n".join(b["x"] for b in bloklar if b["t"] == "m")
        if not bloklar and not tam:
            rapor["aciklamasiz"] += 1
            continue
        g = sum(1 for b in bloklar if b["t"] == "g")
        rapor["gorselli"] += bool(g)
        rapor["gorsel"] += g
        json.dump({"bloklar": bloklar, "metin": metin, "tam": f"{anahtar}.webp" if tam else None},
                  open(f"{CIKIS}/{anahtar}.json", "w", encoding="utf-8"), ensure_ascii=False)
        rapor["yazilan"] += 1
        if SINIR and rapor["yazilan"] >= SINIR:
            break
    print(json.dumps(rapor, ensure_ascii=False))


if __name__ == "__main__":
    main()
