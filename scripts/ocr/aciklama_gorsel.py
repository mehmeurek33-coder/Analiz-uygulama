#!/usr/bin/env python3
"""
Her sorunun kitap aciklamasini sayfa goruntusunden keser (tablo/sekil oldugu gibi kalsin diye).

Kullanim: python3 -I aciklama_gorsel.py <scratchpad> [--yalniz KK]
Girdi:  ocr/tsv/kNNN-{L,R}.tsv (ocr_tsv.sh), ocr/png/kNNN-{L,R}.png, hazir/KK.json
Cikti:  gorsel/KK-<numara>.webp ve gorsel/liste.json {"KK": {"numara": "dosya"}} + rapor

Yontem aciklama.py ile ayni (soru baslangici kok benzerligiyle, son sik -> "Dogru cevap" arasi),
yalnizca satirlar TSV'den konumlariyla okunur ve metin yerine bolge kesilir. "Soyle de
sorulabilirdi" kutulari kesime girmez (bolge oradan bolunur).
"""
import csv
import difflib
import glob
import json
import os
import re
import sys

from PIL import Image

S = sys.argv[1]
YALNIZ = sys.argv[sys.argv.index("--yalniz") + 1] if "--yalniz" in sys.argv else None
sys.path.insert(0, os.path.join(S, "araclar"))
from bolumler import BOLUMLER, SON_SAYFA  # noqa: E402

TSV = os.path.join(S, "ocr", "tsv")
PNG = os.path.join(S, "ocr", "png")
CIKIS = os.environ.get("GORSEL_CIKIS") or os.path.join(S, "gorsel")
# Deneme/ayar: kalite, olcek carpani, gri ton sayisi (0 = tam gri)
KALITE = int(os.environ.get("GORSEL_KALITE", "50"))
OLCEK_CARPAN = float(os.environ.get("GORSEL_OLCEK", "1"))
TON = int(os.environ.get("GORSEL_TON", "4"))  # 4 gri ton + kayipsiz: ~%55 daha kucuk, okunurluk ayni
os.makedirs(CIKIS, exist_ok=True)

HARF = {"8": "B", "G": "C", "©": "C", "6": "C", "€": "E", "£": "E", "&": "E", "0": "D", "O": "D"}
CEVAP = re.compile(r"Do[ğg]ru\s*cevap\s*[:;.]?\s*([A-E8G©€0O6&£])\b", re.I)
BASLANGIC = re.compile(r"^[\s\W_]{0,3}?(\d{1,3})\s?[.,]\s*(\S.*)$")
SECENEK = re.compile(r"(?:^|\s)\(?[GOo0©6]?([A-E8G©€0O6&£])\s?[)\]}]")
VARYANT = re.compile(r"(sorulab|ba[sş]ka bir ho[cç]a|[sş][oö]yle de sor)", re.I)

SUTUN_OLCEK = 0.72  # sutun parcalari: 300 dpi -> ~216 dpi (~800-900 px genislik)
TAM_OLCEK = 0.6     # iki sutuna yayilan bantlar (tablo/sekil): tam sayfa genisligi
PAY = 14            # bolge ust/alt payi (px, 300 dpi)
BANT_ARA = 650      # tablo cizgileri arasindaki beyaz hucreler: bu kadar bosluk ayni bant sayilir
ARA = 24            # birlestirilen parcalar arasi bosluk


def kirpma(k):
    """ocr_sayfa.sh ile ayni: (LX, LW, RX, RW) sayfa paritesine gore."""
    return (150, 1090, 1225, 1243) if k % 2 == 0 else (0, 1240, 1225, 1095)


_bant_onbellek = {}


def yayilan_bantlar(k):
    """Sutun arasi bosluk boyunca koyu olan (iki sutuna yayilan tablo/sekil) dikey bantlar."""
    if k in _bant_onbellek:
        return _bant_onbellek[k]
    im = Image.open(f"{PNG}/k{k:03d}-L.png").convert("L")
    w, h = im.size
    px = im.crop((w - 14, 0, w, h)).load()
    bantlar, bas, son = [], None, None
    for y in range(h):
        koyu = sum(1 for x in range(14) if px[x, y] < 200) / 14
        if koyu > 0.5:
            if bas is None:
                bas = y
            son = y
        elif bas is not None and y - son > BANT_ARA:
            bantlar.append((bas, son))
            bas = None
    if bas is not None:
        bantlar.append((bas, son))
    # Sutunlar arasi dikey ayirici cizgi gibi sayfa boyu bantlar tablo degildir
    bantlar = [(a, b) for a, b in bantlar if b - a >= 20 and b - a < 0.7 * h]
    _bant_onbellek[k] = bantlar
    return bantlar


def tam_genislik(k, ust, alt):
    """Sayfanin iki sutununu yan yana birlestirip [ust, alt] bandini dondurur."""
    lx, lw, rx, rw = kirpma(k)
    sol = Image.open(f"{PNG}/k{k:03d}-L.png").convert("L").crop((0, ust, lw, alt))
    sag = Image.open(f"{PNG}/k{k:03d}-R.png").convert("L").crop((0, ust, rw, alt))
    tuval = Image.new("L", (rx + rw - lx, alt - ust), 255)
    tuval.paste(sol, (0, 0))
    tuval.paste(sag, (rx - lx, 0))
    return tuval


def norm(t):
    return re.sub(r"[^0-9a-zçğıöşü]", "", (t or "").lower())


# ---------------------------------------------------------------- satirlar (konumlu)
satirlar = []  # (sayfa, sutun, ust, alt, metin, varyant_mi)
for k in range(1, SON_SAYFA + 1):
    for sut in "LR":
        yol = f"{TSV}/k{k:03d}-{sut}.tsv"
        if not os.path.exists(yol):
            continue
        gruplar = {}
        sira = []
        with open(yol, encoding="utf-8") as f:
            for r in csv.DictReader(f, delimiter="\t", quoting=csv.QUOTE_NONE):
                if r["level"] != "5" or not (r["text"] or "").strip():
                    continue
                a = (r["block_num"], r["par_num"], r["line_num"])
                if a not in gruplar:
                    gruplar[a] = {"kelime": [], "ust": 10**9, "alt": 0}
                    sira.append(a)
                g = gruplar[a]
                g["kelime"].append(r["text"])
                ust, h = int(r["top"]), int(r["height"])
                g["ust"] = min(g["ust"], ust)
                g["alt"] = max(g["alt"], ust + h)
        for a in sira:
            g = gruplar[a]
            satirlar.append([k, sut, g["ust"], g["alt"], " ".join(g["kelime"]).strip(), False])

n = len(satirlar)
i = 0
while i < n:
    if VARYANT.search(satirlar[i][4]):
        j = i
        while j < min(i + 40, n) and not CEVAP.search(satirlar[j][4]):
            j += 1
        if j < min(i + 40, n):
            for t in range(i, j + 1):
                satirlar[t][4] = ""
                satirlar[t][5] = True
            i = j
    i += 1

sayfa_ilk = {}
for idx, s in enumerate(satirlar):
    sayfa_ilk.setdefault(s[0], idx)


def aralik(bas, son):
    return sayfa_ilk.get(max(1, bas), 0), sayfa_ilk.get(son + 1, n)


def bolgeler(idxler):
    """Satir indekslerini (sayfa, sutun) kesintisiz parcalara boler; varyant satirinda keser."""
    parcalar, simdiki = [], None
    for idx in idxler:
        sf, sut, ust, alt, metin, varyant = satirlar[idx]
        if varyant or not metin:
            if varyant and simdiki:
                parcalar.append(simdiki)
                simdiki = None
            continue
        if simdiki and (simdiki["sayfa"], simdiki["sutun"]) == (sf, sut):
            simdiki["ust"] = min(simdiki["ust"], ust)
            simdiki["alt"] = max(simdiki["alt"], alt)
        else:
            if simdiki:
                parcalar.append(simdiki)
            simdiki = {"sayfa": sf, "sutun": sut, "ust": ust, "alt": alt}
    if simdiki:
        parcalar.append(simdiki)
    return parcalar


_murekkep = {}
_varyantlar = {}


def varyant_kutulari(k, sut):
    """Sutundaki "soyle de sorulabilirdi" satirlarinin (ust, alt) konumlari."""
    if not _varyantlar:
        for sf, st, ust, alt, _, varyant in satirlar:
            if varyant:
                _varyantlar.setdefault((sf, st), []).append((ust, alt))
    return _varyantlar.get((k, sut), [])


def ust_sinirla(p, hedef):
    """Parcanin ustunu hedefe kadar uzat ama aradaki varyant kutusunu gecme."""
    yeni = hedef
    for v_ust, v_alt in varyant_kutulari(p["sayfa"], p["sutun"]):
        if hedef < v_alt <= p["ust"]:
            yeni = max(yeni, v_alt + PAY + 4)
    return min(p["ust"], yeni)


def alt_sinirla(p, hedef):
    """Parcanin altini hedefe kadar uzat ama aradaki varyant kutusunu gecme."""
    yeni = hedef
    for v_ust, v_alt in varyant_kutulari(p["sayfa"], p["sutun"]):
        if p["alt"] <= v_ust < hedef:
            yeni = min(yeni, v_ust - PAY - 4)
    return max(p["alt"], yeni)


def murekkep_siniri(k, sut):
    """Sutun goruntusunde ilk ve son murekkepli satir (bos kenar bosluklari haric)."""
    if (k, sut) not in _murekkep:
        im = Image.open(f"{PNG}/k{k:03d}-{sut}.png").convert("L")
        kutu = im.point(lambda v: 255 if v < 160 else 0).getbbox()
        _murekkep[(k, sut)] = (kutu[1], kutu[3]) if kutu else (0, im.height)
    return _murekkep[(k, sut)]


def genislet(parcalar, sik_son, bitis):
    """OCR'in okuyamadigi (gri zeminli kutu, sekil) kisimlar da girsin diye bolgeyi konuma
    gore genisletir: ilk parca son sikkin hemen altindan, son parca "Dogru cevap" satirinin
    hemen ustune kadar; sutun/sayfa degisen parcalar sutunun sonuna/basina kadar uzar."""
    if not parcalar:
        return parcalar
    ss, bt = satirlar[sik_son], satirlar[bitis]
    for i, p in enumerate(parcalar):
        k, sut = p["sayfa"], p["sutun"]
        ust_sinir, alt_sinir = murekkep_siniri(k, sut)
        onceki = parcalar[i - 1] if i else None
        sonraki = parcalar[i + 1] if i + 1 < len(parcalar) else None
        if i == 0 and (ss[0], ss[1]) == (k, sut):
            # kes() uste PAY ekler: son sik hic gorunmesin
            p["ust"] = ust_sinirla(p, ss[3] + PAY + 4)
        elif onceki and (onceki["sayfa"], onceki["sutun"]) != (k, sut):
            p["ust"] = ust_sinirla(p, ust_sinir)
        if sonraki is None and (bt[0], bt[1]) == (k, sut):
            # kes() alta PAY ekler: "Dogru cevap" satiri hic gorunmesin
            p["alt"] = alt_sinirla(p, bt[2] - PAY - 6)
        elif sonraki is not None and (sonraki["sayfa"], sonraki["sutun"]) != (k, sut):
            p["alt"] = alt_sinirla(p, alt_sinir)
    return parcalar


def kes(parcalar, hedef):
    """Parcalari sirayla alt alta dizer. Iki sutuna yayilan bant (tablo/sekil) parcaya
    denk gelirse o bolum tam sayfa genisliginde ve soru basina bir kez konur."""
    resimler, konan_bantlar = [], set()
    for p in parcalar:
        k = p["sayfa"]
        im = Image.open(f"{PNG}/k{k:03d}-{p['sutun']}.png").convert("L")
        ust = max(0, p["ust"] - PAY)
        alt = min(im.height, p["alt"] + PAY)
        if alt - ust < 20:
            continue
        # [ust, alt] araligini sutun ve tam genislik dilimlerine bol
        y = ust
        for a, b in yayilan_bantlar(k):
            if b < ust or a > alt:
                continue
            if a > y and a - y >= 20:
                resimler.append(("sutun", im.crop((0, y, im.width, a))))
            if (k, a) not in konan_bantlar:
                konan_bantlar.add((k, a))
                resimler.append(("tam", tam_genislik(k, max(0, a - PAY), min(im.height, b + PAY))))
            y = max(y, b + 1)
        if alt - y >= 20:
            resimler.append(("sutun", im.crop((0, y, im.width, alt))))
    if not resimler:
        return False
    olcekli = []
    for tur, r in resimler:
        o = (TAM_OLCEK if tur == "tam" else SUTUN_OLCEK) * OLCEK_CARPAN
        olcekli.append(r.resize((round(r.width * o), round(r.height * o)), Image.LANCZOS))
    genislik = max(r.width for r in olcekli)
    yuk = sum(r.height for r in olcekli) + ARA * (len(olcekli) - 1)
    tuval = Image.new("L", (genislik, yuk), 255)
    y = 0
    for r in olcekli:
        tuval.paste(r, ((genislik - r.width) // 2, y))
        y += r.height + ARA
    if TON:
        # Az sayida gri tona indir + kayipsiz WebP (taranmis metinde cok kucuk dosya)
        adim = 255 / (TON - 1)
        tuval = tuval.point(lambda v: int(round(round(v / adim) * adim)))
        tuval.save(hedef, "WEBP", lossless=True, quality=100, method=6)
    else:
        tuval.save(hedef, "WEBP", quality=KALITE, method=6)
    return True


liste, rapor = {}, {"soru": 0, "kesilen": 0, "baslangic_yok": 0, "cevap_yok": 0, "harf_uyusmaz": 0, "bos": 0}
for f in sorted(glob.glob(f"{S}/hazir/*.json")):
    kk = os.path.basename(f)[:2]
    if YALNIZ and kk != YALNIZ:
        continue
    k = int(kk)
    bas = BOLUMLER[k][0]
    son = BOLUMLER[k + 1][0] if k + 1 < len(BOLUMLER) else SON_SAYFA
    a, b = aralik(bas - 1, son + 1)
    liste[kk] = {}
    for q in json.load(open(f, encoding="utf-8"))["sorular"]:
        rapor["soru"] += 1
        no = q["numara"]
        hedef_metin = norm(q["metin"])[:120]
        en, en_oran = None, 0.0
        for idx in range(a, b):
            m = BASLANGIC.match(satirlar[idx][4])
            if no is not None and not (m and int(m.group(1)) == no):
                continue
            ilk = m.group(2) if m else satirlar[idx][4]
            metin = norm(" ".join([ilk] + [satirlar[j][4] for j in range(idx + 1, min(idx + 8, n))]))[:120]
            if not metin:
                continue
            oran = difflib.SequenceMatcher(None, hedef_metin, metin).ratio()
            if oran > en_oran:
                en, en_oran = idx, oran
        if en is None or en_oran < 0.45:
            rapor["baslangic_yok"] += 1
            continue
        bitis, harf = None, None
        for idx in range(en + 1, min(en + 260, n)):
            t = satirlar[idx][4]
            m = CEVAP.search(t)
            if m and not satirlar[idx][5]:
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
        son_harf = sorted(q["secenekler"])[-1]
        son_sik_metin = norm(q["secenekler"][son_harf])
        sik_son = None
        for idx in range(en + 1, bitis):
            for m in SECENEK.finditer(satirlar[idx][4]):
                if HARF.get(m.group(1), m.group(1)) == son_harf:
                    sik_son = idx
        if sik_son is None:
            rapor["cevap_yok"] += 1
            continue
        govde = list(range(sik_son + 1, bitis))
        # son sikkin alt satira tasan devami
        while govde and satirlar[govde[0]][4] and norm(satirlar[govde[0]][4]) in son_sik_metin:
            govde.pop(0)
        if sum(len(satirlar[x][4]) for x in govde) < 25:
            rapor["bos"] += 1
            continue
        anahtar = str(no) if no is not None else "_" + q["metin"][:40]
        dosya = f"{kk}-{no if no is not None else 'x' + str(abs(hash(q['metin'])) % 10**8)}.webp"
        if kes(genislet(bolgeler(govde), sik_son, bitis), os.path.join(CIKIS, dosya)):
            liste[kk][anahtar] = dosya
            rapor["kesilen"] += 1
        else:
            rapor["bos"] += 1

yol = os.path.join(CIKIS, "liste.json")
if YALNIZ and os.path.exists(yol):
    eski = json.load(open(yol, encoding="utf-8"))
    eski.update(liste)
    liste = eski
json.dump(liste, open(yol, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps(rapor, ensure_ascii=False))
