#!/usr/bin/env python3
"""blok/*.json -> B2 yukleme listesi + DB update SQL (aciklama, aciklama_bloklar, aciklama_gorsel).
Kullanim: python3 -I meditus_aciklama.py <D> <onek> [anahtar_oneki] [ders]
  onek: B2 klasoru (orn. meditus-mikrobiyoloji); anahtar_oneki: blok dosya oneki (varsayilan med; Farmakoloji: mf)
Cikti: <D>/b2_liste.json, <D>/aciklama_istek.json"""
import glob, json, os, sys
D, ONEK = sys.argv[1], sys.argv[2]
AO = sys.argv[3] if len(sys.argv) > 3 else "med"
DERS = sys.argv[4] if len(sys.argv) > 4 else None
idler = {(r["bolum_no"], r["numara"]): r["id"] for r in json.load(open(f"{D}/idler.json"))}
liste, satir = [], []
def q(s): return "'" + s.replace("'", "''") + "'"
for f in sorted(glob.glob(f"{D}/blok/{AO}-*.json")):
    a = os.path.basename(f)[:-5]
    _, b, n = a.split("-")
    sid = idler.get((int(b), int(n)))
    if not sid:
        continue
    d = json.load(open(f, encoding="utf-8"))
    bloklar = []
    for k in d["bloklar"]:
        if k["t"] == "g":
            k = dict(k, yol=f"{ONEK}/{k['yol']}")
            liste.append([os.path.abspath(f"{D}/blok/img/{os.path.basename(k['yol'])}"), k["yol"]])
        bloklar.append(k)
    tam = None
    if d.get("tam"):
        tam = f"{ONEK}/{d['tam']}"
        liste.append([os.path.abspath(f"{D}/blok/img/{d['tam']}"), tam])
    satir.append(f"({q(sid)}::uuid, {q(json.dumps(bloklar, ensure_ascii=False))}::jsonb, {q(d['metin'])}, "
                 + (q(tam) if tam else "null") + ")")
json.dump(liste, open(f"{D}/b2_liste.json", "w"))
sql = ("update sorular s set aciklama_bloklar = v.b, aciklama = nullif(v.m, ''), aciklama_gorsel = v.g from (values "
       + ",".join(satir) + ") v(id, b, m, g) where s.id = v.id;\nselect count(*) filter (where aciklama is not null) aciklamali, "
       "count(*) filter (where aciklama_bloklar is not null) blok, count(*) from sorular s join soru_setleri ss on ss.id = s.set_id "
       "where ss.kaynak = 'Meditus'" + (f" and ss.ders = {q(DERS)}" if DERS else "") + ";")
json.dump({"query": sql}, open(f"{D}/aciklama_istek.json", "w"))
print(json.dumps({"soru": len(satir), "dosya": len(liste)}))
