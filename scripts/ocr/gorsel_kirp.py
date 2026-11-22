#!/usr/bin/env python3
"""
Açıklama blok görsellerinin kenarındaki boşluğu ve kenar sekmesini kırpar (görseller düzenli/simetrik dursun).

Kullanim: python3 -I gorsel_kirp.py <girdi_dizini> <cikti_dizini> [--pay 16]
Cikti: aynı adla kırpılmış .webp (q88, gri) + <cikti>/kirp.json {ad: [x0, y0, x1, y1, eski_g, eski_y]}
  Mürekkep sınırı: <200 gri (gri kutular dahil), satır/sütunda en az 3 piksel (tarama lekesi sayılmaz).
  Kenara dayanan geniş (≥25 px) yoğun dikey bant = sayfa kenarı sekmesi ("Temel Mikrobiyoloji"): sınır dışı.
  İnce dikey çizgiler (tablo çerçevesi) korunur.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

GIR, CIK = sys.argv[1], sys.argv[2]
PAY = int(sys.argv[sys.argv.index("--pay") + 1]) if "--pay" in sys.argv else 16
os.makedirs(CIK, exist_ok=True)


def sekme_maskesi(koyu):
    """Kenara dayanan, 25 px ile genişliğin %20'si arasında, satırların %50'sinden fazlasında koyu sütun bandı."""
    yog = koyu.mean(axis=0) > 0.5
    m = np.zeros_like(yog)
    w = len(yog)
    for bas, yon in ((0, 1), (w - 1, -1)):
        # kenardan (en çok 40 px içeriden) başlayan yoğun bant
        x = bas
        while 0 <= x < w and abs(x - bas) < 40 and not yog[x]:
            x += yon
        b = x
        while 0 <= x < w and yog[x]:
            x += yon
        if 25 <= abs(x - b) <= 0.2 * w:  # geniş koyu zemin (başlık bandı, koyu tablo) sekme değil
            lo, hi = sorted((bas, x))
            m[lo:hi + 1] = True
    return m


rapor = {}
for ad in sorted(os.listdir(GIR)):
    if not ad.endswith(".webp"):
        continue
    im = Image.open(os.path.join(GIR, ad)).convert("L")
    a = np.asarray(im)
    koyu = a < 200
    koyu[:, sekme_maskesi(a < 140)] = False
    satir = np.where(koyu.sum(axis=1) >= 3)[0]
    sutun = np.where(koyu.sum(axis=0) >= 3)[0]
    if len(satir) == 0 or len(sutun) == 0:
        rapor[ad] = None
        continue
    x0, x1 = max(0, sutun[0] - PAY), min(a.shape[1], sutun[-1] + 1 + PAY)
    y0, y1 = max(0, satir[0] - PAY), min(a.shape[0], satir[-1] + 1 + PAY)
    alt = Image.new("L", (x1 - x0, y1 - y0), 255)
    alt.paste(im.crop((x0, y0, x1, y1)))
    # sekme bandı kırpıntının içinde kaldıysa beyazla
    m = sekme_maskesi(a < 140)[x0:x1]
    if m.any():
        d = np.asarray(alt).copy()
        d[:, m] = 255
        alt = Image.fromarray(d)
    alt.save(os.path.join(CIK, ad), quality=88, method=6)
    rapor[ad] = [int(x0), int(y0), int(x1), int(y1), int(a.shape[1]), int(a.shape[0])]
json.dump(rapor, open(os.path.join(CIK, "kirp.json"), "w"))
oran = [(r[2] - r[0]) / r[4] for r in rapor.values() if r]
print(json.dumps({"gorsel": len(rapor), "bos": sum(1 for r in rapor.values() if not r),
                  "genislik_orani_ort": round(float(np.mean(oran)), 3)}))
