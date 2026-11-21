#!/usr/bin/env python3
"""
Açıklamada ikiye bölünmüş şekil denetimi (aciklama_blok.py çıktısı üzerinde, B2'ye yüklemeden ÖNCE).

Sütun/sayfa sonuna denk gelen tek bir şekil, blok aracında iki ayrı görsel parça olarak kesilebiliyor
(üst yarı "sekil", alt yarı "tablo"). Art arda gelen iki görsel bloktan ilkinin ALT kenarı ve ikincisinin
ÜST kenarı "açık"sa (çerçevenin iki yan çizgisi kesim çizgisine kadar iniyor, kapanış çizgisi yok) aynı
şeklin parçaları sayılır. Bunlar tam sayfa görüntüsünden (`<anahtar>.webp`) tek parça olarak yeniden
kırpılmalı; iki parçayı yan yana yapıştırmak hizayı bozar (docs/HATALAR.md B25).

Kullanim: python3 -I bolunmus_sekil.py <blok_dizini>      (<dizin>/*.json + <dizin>/img/*.webp)
Cikti: aday listesi (anahtar, parca1, parca2, kenar dolulugu)
"""
import glob
import json
import os
import sys

import numpy as np
from PIL import Image


def acik_kenar(yol, alt):
    a = np.array(Image.open(yol).convert("L")) < 128
    satirlar = np.where(a.any(1))[0]
    if len(satirlar) == 0:
        return False, 0.0
    sut = np.where(a.any(0))[0]
    x0, x1 = sut[0], sut[-1]
    w = x1 - x0 + 1
    r = satirlar[-1] if alt else satirlar[0]
    bant = a[max(0, r - 4):r + 1] if alt else a[r:r + 5]
    pay = int(w * 0.06) + 1
    sol, sag = bant[:, x0:x0 + pay].any(), bant[:, x1 - pay:x1 + 1].any()
    doluluk = float(a[r].sum() / w)
    return bool(doluluk < 0.4 and sol and sag), round(doluluk, 2)


def main(dizin):
    adaylar = []
    for js in sorted(glob.glob(os.path.join(dizin, "*.json"))):
        bloklar = json.load(open(js, encoding="utf-8")).get("bloklar", [])
        for b1, b2 in zip(bloklar, bloklar[1:]):
            if b1.get("t") != "g" or b2.get("t") != "g":
                continue
            p1 = os.path.join(dizin, "img", os.path.basename(b1["yol"]))
            p2 = os.path.join(dizin, "img", os.path.basename(b2["yol"]))
            if not (os.path.exists(p1) and os.path.exists(p2)):
                continue
            a, b = acik_kenar(p1, True), acik_kenar(p2, False)
            if a[0] and b[0]:
                adaylar.append({"anahtar": os.path.splitext(os.path.basename(js))[0],
                                "parca1": b1["yol"], "parca2": b2["yol"], "alt": a[1], "ust": b[1]})
    print(json.dumps(adaylar, ensure_ascii=False, indent=1))
    print(len(adaylar), "aday — görüntüyle bak: aynı şekilse tam sayfadan tek parça kırp", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1])
