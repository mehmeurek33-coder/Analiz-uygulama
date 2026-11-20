#!/usr/bin/env python3
"""
Kullanim: OMP_THREAD_LIMIT=1 python3 -I ocr_kolon.py <pdf> <pdf_sayfa> <cikis_dizini>
Sayfayi 300 dpi gri render eder, ust baslik seridini atar, sutun arasi boslugu murekkep
izdusumunden bulur, iki sutunu ayri kaydeder (pNNN-L/R.png) ve satir konumlu TSV uretir.
Kirpma koordinatlari sabit degil: her sayfada olculur (farkli tarama/baski icin).
"""
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

pdf, sayfa, cikis = sys.argv[1], int(sys.argv[2]), sys.argv[3]
nn = f"{sayfa:03d}"
with tempfile.TemporaryDirectory() as t:
    subprocess.run(["pdftoppm", "-f", str(sayfa), "-l", str(sayfa), "-r", "300", "-gray", "-png",
                    "-singlefile", pdf, f"{t}/s"], check=True)
    im = Image.open(f"{t}/s.png").convert("L")
a = np.asarray(im) < 140
h, w = a.shape
# ust baslik seridi: ilk %7'de yogun koyu satirlar -> altindan basla
ust = int(h * 0.055)
govde = a[ust:int(h * 0.97)]
kolon = govde.sum(axis=0).astype(float)
# sutun arasi: sayfayi 24 yatay banda bol; her x icin 25 px'lik pencerenin bos oldugu bant sayisi.
# Iki sutuna yayilan sekil/tablo yalnizca birkac bandi bozar; en cok bantta bos olan x sutun arasidir.
x0, x1 = int(w * 0.38), int(w * 0.62)
if os.environ.get("KOLON_ARALIK"):  # kitabin sutun arasi biliniyorsa arama penceresi (px, 300 dpi)
    x0, x1 = map(int, os.environ["KOLON_ARALIK"].split(","))
bantlar = np.array_split(govde[:, x0:x1], 24, axis=0)
bos = np.zeros(x1 - x0 - 24)
for b in bantlar:
    p = np.convolve(b.sum(axis=0).astype(float), np.ones(25), mode="valid")
    bos += p <= max(2, 0.0005 * b.shape[0] * 25)
toplam = np.convolve(kolon[x0:x1], np.ones(25), mode="valid")
skor = bos * 1e6 - toplam  # once bos bant sayisi, esitlikte az murekkep
en = np.flatnonzero(skor >= skor.max() - 0.5e6)  # en iyiye esit bos bantli pencereler: ortadakini al
x = x0 + int(en[len(en) // 2]) + 12
# dis kenarlardaki bolum sekmesi (koyu dikey serit): %7'lik dis bantta yogun kolonlari at
# Yalnizca kesintisiz uzun koyu kosusu olan kolon sekmedir: hizali metnin sol kenari da cok
# murekkepli ama harf boyu kadar kisa kosulardan olusur (eski olcut metni de kesiyordu).
def en_uzun_kosu(sutun):
    d = np.diff(np.concatenate(([0], sutun.astype(np.int8), [0])))
    bas_, son_ = np.flatnonzero(d == 1), np.flatnonzero(d == -1)
    return int((son_ - bas_).max()) if len(bas_) else 0


def kenar(bas, son, adim):
    sinir = bas
    for xx in range(bas, son, adim):
        if kolon[xx] > 0.15 * govde.shape[0] and en_uzun_kosu(govde[:, xx]) > 0.12 * govde.shape[0]:
            sinir = xx + adim * 8
    return sinir
sol = max(0, kenar(0, int(w * 0.08), 1))
sag = min(w, kenar(w - 1, int(w * 0.92), -1))
if os.environ.get("KENAR_BEYAZ"):
    # metnin hic girmedigi dis seritler biliniyorsa (px, 300 dpi): sekmeyi kirpmak yerine beyazla,
    # sutunu kesme (cerceve cizgisi ya da hizali metin sekme sanilmasin)
    b0, b1 = map(int, os.environ["KENAR_BEYAZ"].split(","))
    dizi = np.asarray(im).copy()
    dizi[:, :b0] = 255
    dizi[:, b1:] = 255
    im = Image.fromarray(dizi)
    sol, sag = 0, w
for ad, (x0, x1) in (("L", (sol, x)), ("R", (x, sag))):
    yol = f"{cikis}/png/p{nn}-{ad}.png"
    im.crop((x0, ust, x1, int(h * 0.97))).save(yol)
    subprocess.run(["tesseract", yol, f"{cikis}/tsv/p{nn}-{ad}", "-l", "tur", "--psm", "4", "tsv"],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
