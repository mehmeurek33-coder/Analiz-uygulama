#!/usr/bin/env python3
"""Meditus: her sorunun kök+şık bölgesini 2x büyütüp ikinci kez OCR'lar, rakamları DB ile karşılaştırır.
Kullanim: python3 -I rakam_ikinci.py <D> <db.json> <idler.json> <cikti.json>"""
import json, sys, os, re, subprocess, tempfile
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
D, DB, IDL, OUT = sys.argv[1:5]
sys.argv = [sys.argv[0], D]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import yeni_baski as yb  # noqa: E402
Y = json.load(open(f"{D}/yapi.json", encoding="utf-8"))
idl = {(x["bolum_no"], x["numara"]): x["id"] for x in json.load(open(IDL))}
db = {r["eski_id"]: r for r in json.load(open(DB))}
NUM = re.compile(r"\d+(?:[.,]\d+)?")
def isle(y):
    m = re.match(r"med-(\d+)-(\d+)", y["eski_id"])
    sid = idl.get((int(m.group(1)), int(m.group(2))))
    if not sid or sid not in db:
        return None
    gr = {}
    for i in range(y["bas"], y["sik_son"] + 1):
        s = yb.satirlar[i]
        g = gr.setdefault((s[0], s[1]), [10**9, 0]); g[0], g[1] = min(g[0], s[2]), max(g[1], s[3])
    metin = ""
    for (k, sut), (u, al) in gr.items():
        im = Image.open(f"{D}/ocr/png/p{k:03d}-{sut}.png").convert("L")
        im = im.crop((0, max(0, u - 8), im.width, min(im.height, al + 8)))
        im = im.resize((im.width * 2, im.height * 2), Image.LANCZOS)
        with tempfile.NamedTemporaryFile(suffix=".png") as f:
            im.save(f.name)
            metin += subprocess.run(["tesseract", f.name, "-", "-l", "tur", "--psm", "6"], capture_output=True,
                                    text=True, env=dict(os.environ, OMP_THREAD_LIMIT="1")).stdout + "\n"
    r = db[sid]
    a = sorted(NUM.findall(r["metin"] + " " + " ".join(r["secenekler"].values())))
    b = sorted(NUM.findall(re.sub(r"^\s*\d{1,3}\s*[.,]", "", metin)))
    ea = [x for x in a if a.count(x) > b.count(x)]
    return {"id": sid, "med": y["eski_id"], "db_fazla": sorted(set(ea)), "ocr2": metin} if ea else None
with ThreadPoolExecutor(4) as ex:
    sonuc = [x for x in ex.map(isle, Y) if x]
json.dump(sonuc, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(len(sonuc), "soruda DB'deki bir sayi ikinci OCR'da yok")
