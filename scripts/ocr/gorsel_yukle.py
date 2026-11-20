#!/usr/bin/env python3
"""
gorsel/*.webp dosyalarini Supabase 'aciklamalar' deposuna <soru_id>.webp olarak yukler ve
sorular.aciklama_gorsel kolonunu gunceller.

Kullanim: python3 -I gorsel_yukle.py <scratchpad> <proje_ref> <kaynak> <ders>
service_role anahtari yonetim API'sinden (proxy kimligiyle) alinir, bellekte kalir, yazdirilmaz.
"""
import json
import os
import subprocess
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

S, REF, KAYNAK, DERS = sys.argv[1:5]
YONETIM = f"https://api.supabase.com/v1/projects/{REF}"
DEPO_URL = f"https://{REF}.supabase.co/storage/v1/object/aciklamalar"


def yonetim(yol, govde=None):
    # curl: proxy kimlik basligini ekler (urllib proxy CA ayarina gerek kalmasin)
    komut = ["curl", "-sS", f"{YONETIM}{yol}"]
    if govde is not None:
        komut += ["-X", "POST", "-H", "Content-Type: application/json", "--data-binary", "@-"]
    cikti = subprocess.run(komut, input=json.dumps(govde).encode() if govde else None, capture_output=True, check=True)
    return json.loads(cikti.stdout)


def sql(sorgu):
    return yonetim("/database/query", {"query": sorgu})


anahtar = next(k["api_key"] for k in yonetim("/api-keys?reveal=true") if k.get("name") == "service_role")

# (bolum_no, numara) -> soru id ; numarasizlar icin metnin ilk 40 karakteri
satirlar = sql(
    "select s.id, st.bolum_no, s.numara, left(s.metin, 40) as bas from sorular s "
    f"join soru_setleri st on st.id = s.set_id where st.kaynak = '{KAYNAK}' and st.ders = '{DERS}' "
    "and s.aciklama_gorsel is null"  # yuklenmis olanlari atla: tekrar calistirmak guvenli
)
harita = {}
for r in satirlar:
    k = f"{r['bolum_no'] - 1:02d}"
    harita[(k, str(r["numara"]) if r["numara"] is not None else "_" + r["bas"])] = r["id"]

liste = json.load(open(os.path.join(S, "gorsel", "liste.json"), encoding="utf-8"))
isler, eslesmeyen = [], 0
for kk, sorular in liste.items():
    for anahtar_no, dosya in sorular.items():
        sid = harita.get((kk, anahtar_no))
        if not sid:
            continue
        isler.append((sid, os.path.join(S, "gorsel", dosya)))

ca = "/root/.ccr/ca-bundle.crt"
import ssl  # noqa: E402

baglam = ssl.create_default_context(cafile=ca) if os.path.exists(ca) else ssl.create_default_context()


def yukle(is_):
    sid, yol = is_
    istek = urllib.request.Request(
        f"{DEPO_URL}/{sid}.webp",
        data=open(yol, "rb").read(),
        method="POST",
        headers={
            "Authorization": f"Bearer {anahtar}",
            "apikey": anahtar,
            "Content-Type": "image/webp",
            "x-upsert": "true",
            "Cache-Control": "max-age=31536000",
        },
    )
    try:
        with urllib.request.urlopen(istek, context=baglam, timeout=60) as y:
            return sid, y.status
    except urllib.error.HTTPError as e:
        return sid, f"{e.code} {e.read()[:120]!r}"
    except Exception as e:  # noqa: BLE001
        return sid, str(e)[:120]


with ThreadPoolExecutor(3) as havuz:  # depo baglanti siniri (429)
    sonuclar = list(havuz.map(yukle, isler))

basarili = [sid for sid, d in sonuclar if d == 200]
hatalar = [(sid, d) for sid, d in sonuclar if d != 200]

if basarili:
    veri = json.dumps(basarili)
    sql(
        f"update sorular set aciklama_gorsel = id::text || '.webp' "
        f"where id in (select jsonb_array_elements_text($j${veri}$j$::jsonb)::uuid)"
    )

print(json.dumps({"yuklenen": len(basarili), "hata": len(hatalar), "eslesmeyen": eslesmeyen,
                  "ornek_hata": hatalar[:3]}, ensure_ascii=False))
