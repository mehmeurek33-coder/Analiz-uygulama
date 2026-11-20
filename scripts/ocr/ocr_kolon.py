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
# sutun arasi: genisligin %40-60'inda murekkebi en az olan 25 px'lik pencere
orta = kolon[int(w * 0.40):int(w * 0.60)]
pencere = np.convolve(orta, np.ones(25), mode="valid")
x = int(w * 0.40) + int(pencere.argmin()) + 12
# dis kenarlardaki bolum sekmesi (koyu dikey serit): %7'lik dis bantta yogun kolonlari at
def kenar(bas, son, adim):
    sinir = bas
    for xx in range(bas, son, adim):
        if kolon[xx] > 0.35 * govde.shape[0]:
            sinir = xx + adim * 8
    return sinir
sol = max(0, kenar(0, int(w * 0.08), 1))
sag = min(w, kenar(w - 1, int(w * 0.92), -1))
for ad, (x0, x1) in (("L", (sol, x)), ("R", (x, sag))):
    yol = f"{cikis}/png/p{nn}-{ad}.png"
    im.crop((x0, ust, x1, int(h * 0.97))).save(yol)
    subprocess.run(["tesseract", yol, f"{cikis}/tsv/p{nn}-{ad}", "-l", "tur", "--psm", "4", "tsv"],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
