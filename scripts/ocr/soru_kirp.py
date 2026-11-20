#!/usr/bin/env python3
"""Sorularin (kok + siklar) goruntusunu kesip etiketli paftalara dizer. Gozle duzeltme icin.
Kullanim: python3 -I soru_kirp.py <D> <anahtar,anahtar,...> <cikti_oneki> [--siklar]"""
import json, sys
from PIL import Image, ImageDraw
D, ids, onek = sys.argv[1], sys.argv[2].split(","), sys.argv[3]
SIK = "--siklar" in sys.argv
sys.argv = [sys.argv[0], D]
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
import yeni_baski as yb  # noqa: E402
Y = {y["eski_id"]: y for y in json.load(open(f"{D}/yapi.json", encoding="utf-8"))}
parcalar = []
for a in ids:
    y = Y[a]
    bas = y["sik_ilk"] if SIK else y["bas"]
    gruplar = {}
    for i in range(bas, y["sik_son"] + 1):
        s = yb.satirlar[i]
        g = gruplar.setdefault((s[0], s[1]), [10**9, 0])
        g[0], g[1] = min(g[0], s[2]), max(g[1], s[3])
    ims = []
    for (k, sut), (u, al) in gruplar.items():
        im = Image.open(f"{D}/ocr/png/p{k:03d}-{sut}.png").convert("L")
        ims.append(im.crop((0, max(0, u - 8), im.width, min(im.height, al + 8))))
    w = max(i.width for i in ims) + 10
    h = sum(i.height for i in ims) + 40
    c = Image.new("L", (w, h), 255)
    d = ImageDraw.Draw(c)
    d.text((5, 5), a, fill=0)
    yy = 30
    for i in ims:
        c.paste(i, (5, yy)); yy += i.height
    parcalar.append(c.resize((c.width // 2, c.height // 2)))
sayfa, yy, no = [], 0, 0
def kaydet(liste, no):
    w = max(i.width for i in liste); h = sum(i.height for i in liste) + 4 * len(liste)
    c = Image.new("L", (w, h), 255); y = 0
    for i in liste:
        c.paste(i, (0, y)); y += i.height + 4
        ImageDraw.Draw(c).line([(0, y - 2), (w, y - 2)], fill=0)
    c.save(f"{onek}-{no}.png")
for p in parcalar:
    if sayfa and yy + p.height > 1500:
        kaydet(sayfa, no); no += 1; sayfa, yy = [], 0
    sayfa.append(p); yy += p.height
if sayfa:
    kaydet(sayfa, no); no += 1
print(no, "pafta")
