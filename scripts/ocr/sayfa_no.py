#!/usr/bin/env python3
"""Sayfanin ust (ya da alt) basligindan kitap sayfa numarasini okur.
Kullanim: python3 -I sayfa_no.py <pdf> <sayfa> [--alt]  -> stdout: 'sayfa<TAB>numara|-<TAB>basliktaki metin'"""
import re, subprocess, sys, tempfile
import numpy as np
from PIL import Image
pdf, p = sys.argv[1], int(sys.argv[2])
ALT = "--alt" in sys.argv
with tempfile.TemporaryDirectory() as t:
    subprocess.run(["pdftoppm", "-f", str(p), "-l", str(p), "-r", "200", "-gray", "-png", "-singlefile", pdf, f"{t}/s"], check=True)
    im = Image.open(f"{t}/s.png").convert("L")
    a = np.asarray(im) < 140
    h, w = a.shape
    satir = a[:, int(w * 0.05):int(w * 0.95)].mean(axis=1) > 0.004
    sira = range(h - 1, -1, -1) if ALT else range(h)
    ilk = next((y for y in sira if satir[y] and y > h * 0.005 and y < h * 0.995), None)
    metin = ""
    if ilk is not None:
        # ilk murekkepli satirdan itibaren yazinin bittigi yere kadar (en fazla ~%4 yukseklik)
        y0, y1 = (ilk, min(h, ilk + int(h * 0.04))) if not ALT else (max(0, ilk - int(h * 0.04)), ilk + 1)
        bas = im.crop((0, max(0, y0 - 10), w, min(h, y1 + 10)))
        bas.save(f"{t}/b.png")
        metin = subprocess.run(["tesseract", f"{t}/b.png", "-", "--psm", "6", "-l", "tur"], capture_output=True, text=True,
                               env={"OMP_THREAD_LIMIT": "1", "PATH": "/usr/bin:/bin"}).stdout
    metin = " ".join(metin.split())
    # basliktaki 1-3 haneli tek sayi (ilk ya da son kelime)
    sayilar = [int(x) for x in re.findall(r"(?<![\d.,])(\d{1,3})(?![\d.,])", metin)]
    print(f"{p}\t{sayilar[0] if len(sayilar) == 1 else ('|'.join(map(str, sayilar)) or '-')}\t{metin[:80]}")
