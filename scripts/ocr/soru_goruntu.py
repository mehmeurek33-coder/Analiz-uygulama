#!/usr/bin/env python3
"""
Sorunun kitaptaki görüntüsü (kök + şekil/tablo + şıklar) — metin yerine kitaptan çözmek için (sorular.soru_kitap_gorsel).

Kullanim: python3 -I soru_goruntu.py <D> <konum.json> <cikti_dizini>
  konum.json: [{"anahtar": "<soru_id>", "bas": satir, "sik_son": satir, "ust_px": (isteğe bağlı) ilk parçanın üstü}, ...]
              (satir: yeni_baski satirlar indeksi; şekille başlayan soruda numara OCR'a girmeyebilir → ust_px)
Cikti: <cikti>/<anahtar>.webp (tam çözünürlük, gri, q88) + <cikti>/denetim.json
  Soru sütun/sayfa sonunda bölünmüşse parçalar alt alta birleştirilir (sayfa başlığı/altlığı arada kalmaz).
Denetim: kırpıntının hemen altındaki satır "Doğru cevap" / açıklama olmamalı (yukarıda kalmalı), üstte soru numarası,
  en altta E şıkkı; ilk satırdan önce gelen satır parçaya girmemeli. Uymayanlar denetim.json'da: görüntüyle bak.
"""
import json
import os
import re
import sys

import numpy as np
from PIL import Image

D, KONUM, CIKIS = sys.argv[1], sys.argv[2], sys.argv[3]
sys.argv = [sys.argv[0], D]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import yeni_baski as yb  # noqa: E402

PAY_UST, PAY_ALT, ARA = 14, 16, 18
ACIK = re.compile(r"^[a-zçğıöşü(]")


def bos_satir(dizi, y0, y1, yon):
    """y0'dan y1'e (yon +1/-1) ilk mürekkepsiz piksel satırı; yoksa en az mürekkepli."""
    en, eny = None, y0
    for y in range(y0, y1, yon):
        if not 0 <= y < dizi.shape[0]:
            break
        m = int((dizi[y] < 140).sum())
        if m == 0:
            return y
        if en is None or m < en:
            en, eny = m, y
    return eny
os.makedirs(CIKIS, exist_ok=True)
S = yb.satirlar
denetim = []
for k in json.load(open(KONUM, encoding="utf-8")):
    bas, son = k["bas"], k["sik_son"]
    # son şık alt satıra taşmış: aynı sütunda, hemen altta, küçük harfle başlayan satır şıkka aittir
    while (son + 1 < len(S) and S[son + 1][:2] == S[son][:2] and S[son + 1][2] - S[son][3] < 25
           and ACIK.match(S[son + 1][4].strip()) and not yb.CEVAP.search(S[son + 1][4])):
        son += 1
    gruplar = {}
    for i in range(bas, son + 1):
        s = S[i]
        if s[5]:  # varyant kutusu satiri
            continue
        g = gruplar.setdefault((s[0], s[1]), [10**9, 0])
        g[0], g[1] = min(g[0], s[2]), max(g[1], s[3])
    parcalar = []
    for (sayfa, sut), (u, a) in gruplar.items():
        im = Image.open(f"{D}/ocr/png/p{sayfa:03d}-{sut}.png").convert("L")
        dizi = np.asarray(im)
        # kesim çizgisi satır aralığındaki boş piksel satırından: sonraki satır (cevap/açıklama) taşmasın,
        # kendi satırımız kesilmesin (OCR kutuları üst üste binebiliyor)
        sonraki = [S[j][2] for j in range(son + 1, min(son + 3, len(S))) if S[j][:2] == (sayfa, sut)]
        sinir = min([a + PAY_ALT + 20] + [t + 12 for t in sonraki])
        alt = bos_satir(dizi, a - 4, sinir, 1) + 2
        onceki = [S[j][3] for j in range(max(0, bas - 2), bas) if S[j][:2] == (sayfa, sut)]
        usinir = max([u - PAY_UST - 20] + [b - 12 for b in onceki])
        ust = bos_satir(dizi, u + 4, usinir, -1) - 2
        if k.get("ust_px") is not None and not parcalar:  # OCR'ın okumadığı numara/şekil üstü (elle)
            ust = k["ust_px"]
        parcalar.append(im.crop((0, max(0, ust), im.width, min(im.height, alt))))
    w = max(p.width for p in parcalar)
    h = sum(p.height for p in parcalar) + ARA * (len(parcalar) - 1)
    tuval = Image.new("L", (w, h), 255)
    y = 0
    for p in parcalar:
        tuval.paste(p, (0, y))
        y += p.height + ARA
    tuval.save(f"{CIKIS}/{k['anahtar']}.webp", quality=88, method=6)
    sorun = []
    if not re.match(r"^[\s\W_]{0,3}\d{1,3}\s?[.,]", S[bas][4]):
        sorun.append("ust_numara_yok")
    if not re.search(r"(^|\s)[E€£&]\s?[)\]}]", " ".join(S[i][4] for i in range(max(bas, son - 2), son + 1))):
        sorun.append("son_sik_E_degil")
    if any(yb.CEVAP.search(S[i][4]) for i in range(bas, son + 1)):
        sorun.append("cevap_satiri_icinde")
    if len(parcalar) > 1:
        sorun.append(f"{len(parcalar)}_parca")
    denetim.append({"anahtar": k["anahtar"], "parca": len(parcalar), "boyut": [w, h], "sorun": sorun})
json.dump(denetim, open(f"{CIKIS}/denetim.json", "w"), ensure_ascii=False, indent=0)
print(json.dumps({"soru": len(denetim), "sorunlu": [d for d in denetim if d["sorun"]]}, ensure_ascii=False))
