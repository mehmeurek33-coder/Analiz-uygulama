#!/usr/bin/env python3
"""
Dosyalari uygulamanin korumali rotasi uzerinden Backblaze B2'ye yukler.
Kullanim: UYGULAMA_URL=https://<proje>.vercel.app python3 -I b2_yukle.py <anahtar_dosyasi> <liste.json>   (liste: [[yerel_yol, b2_adi], ...])
Dosyalar Vercel'den GEÇMEZ (Fast Origin Transfer kotası, HATALAR E10): Vercel'den yalnız B2 yükleme adresi + jeton alınır
(/api/b2-yukleme-adresi), dosya Cloudflare Worker'ın /b2-yukle yoluyla doğrudan B2'ye gider (WORKER_URL, varsayılan kullanıcının adresi).
ESKI_YOL=1: eski yöntem (dosyayı /api/gorsel-yukle'ye gönderir; kota harcar).
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
WORKER = os.environ.get("WORKER_URL", "https://tusanaliz.mehmeurek33.workers.dev").rstrip("/")
ESKI = os.environ.get("ESKI_YOL") == "1"
import hashlib  # noqa: E402
import threading  # noqa: E402

_yerel = threading.local()


def adres(yenile=False):
    """İş parçacığı başına B2 yükleme adresi (B2: aynı anda tek yükleme / adres)."""
    if yenile or not getattr(_yerel, "adres", None):
        r = urllib.request.Request(UYGULAMA + "/api/b2-yukleme-adresi", headers={"x-yukleme-anahtari": anahtar})
        with urllib.request.urlopen(r, context=baglam, timeout=60) as y:
            _yerel.adres = json.loads(y.read())
    return _yerel.adres


def dogrudan(ad, veri):
    tur = "image/webp" if ad.endswith(".webp") else "image/png" if ad.endswith(".png") else "application/octet-stream"
    for deneme in range(4):
        try:
            a = adres(yenile=deneme > 0)
            r = urllib.request.Request(WORKER + "/b2-yukle", data=veri, method="POST", headers={
                "x-b2-url": a["uploadUrl"], "Authorization": a["authorizationToken"],
                "X-Bz-File-Name": "/".join(urllib.parse.quote(p) for p in ad.split("/")),
                "Content-Type": tur, "X-Bz-Content-Sha1": hashlib.sha1(veri).hexdigest(),
                "User-Agent": "b2-yukle"})
            with urllib.request.urlopen(r, context=baglam, timeout=90) as y:
                if y.status == 200:
                    return "ok"
        except Exception as e:  # noqa: BLE001
            hata = str(e)[:100]
            time.sleep(1.5 * (deneme + 1))
    return f"hata {hata}"


def yukle(is_):
    yerel, ad = is_
    if ad in tamam:
        return ad, "atlandi"
    veri = open(yerel, "rb").read()
    if not ESKI:
        return ad, dogrudan(ad, veri)
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
