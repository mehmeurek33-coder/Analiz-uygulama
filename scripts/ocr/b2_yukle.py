#!/usr/bin/env python3
"""
Dosyalari uygulamanin korumali rotasi uzerinden Backblaze B2'ye yukler.
Kullanim: UYGULAMA_URL=https://<proje>.vercel.app python3 -I b2_yukle.py <anahtar_dosyasi> <liste.json>   (liste: [[yerel_yol, b2_adi], ...])
Basarili adlari <liste.json>.tamam dosyasina yazar; tekrar calistirinca onlari atlar.
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import ssl
from concurrent.futures import ThreadPoolExecutor

anahtar = open(sys.argv[1]).read().strip()
liste = json.load(open(sys.argv[2]))
tamam_yol = sys.argv[2] + ".tamam"
tamam = set(open(tamam_yol).read().split()) if os.path.exists(tamam_yol) else set()
baglam = ssl.create_default_context(cafile="/root/.ccr/ca-bundle.crt")
UYGULAMA = os.environ.get("UYGULAMA_URL", "").rstrip("/")
if not UYGULAMA:
    sys.exit("UYGULAMA_URL ortam değişkenini ver (ör. https://<proje>.vercel.app)")
URL = UYGULAMA + "/api/gorsel-yukle?yol="


def yukle(is_):
    yerel, ad = is_
    if ad in tamam:
        return ad, "atlandi"
    veri = open(yerel, "rb").read()
    for deneme in range(4):
        try:
            r = urllib.request.Request(URL + urllib.parse.quote(ad), data=veri, method="POST",
                                       headers={"x-yukleme-anahtari": anahtar, "Content-Type": "application/octet-stream"})
            with urllib.request.urlopen(r, context=baglam, timeout=60) as y:
                if y.status == 200:
                    return ad, "ok"
        except Exception as e:  # noqa: BLE001
            hata = str(e)[:100]
            time.sleep(1.5 * (deneme + 1))
    return ad, f"hata {hata}"


with ThreadPoolExecutor(6) as h, open(tamam_yol, "a") as t:
    sonuc = {"ok": 0, "atlandi": 0, "hata": 0}
    ornek = []
    for ad, d in h.map(yukle, liste):
        k = d.split()[0]
        sonuc[k] = sonuc.get(k, 0) + 1
        if d == "ok":
            t.write(ad + "\n")
        elif k == "hata" and len(ornek) < 3:
            ornek.append((ad, d))
print(json.dumps({**sonuc, "ornek_hata": ornek}, ensure_ascii=False))
