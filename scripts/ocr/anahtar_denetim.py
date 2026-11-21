#!/usr/bin/env python3
"""Cevap anahtari denetimi: aciklamanin ilk kismi hangi sikki anlatiyor? Anahtardan farkli ve
belirgin bir sik one cikiyorsa isaretle. Girdi: DB'den [{id, metin, secenekler, dogru_cevap, aciklama}]"""
import json, re, sys
def kel(t):
    t = (t or "").replace("İ", "i").replace("I", "ı").lower()
    return {w[:7] for w in re.findall(r"[a-zçğıöşü0-9]{4,}", t)}
YAYGIN = kel("aşağıdakilerden hangisidir yanlış doğru olarak neden olan olur ilişkin bakteri virüs mantar enfeksiyon "
             "infeksiyon hastalık hastalığı tedavisinde tanısında kullanılan seçeneklerde diğer")
veri = json.load(open(sys.argv[1]))
isaret = []
for q in veri:
    ac = q["aciklama"] or ""
    if len(ac) < 40 or not q["dogru_cevap"]:
        continue
    bas = kel(ac[:400]) - YAYGIN
    kok = kel(q["metin"])
    puan = {}
    for h, v in (q["secenekler"] or {}).items():
        k = kel(v) - YAYGIN - kok
        puan[h] = (len(k & bas) / len(k)) if k else 0
    if not puan:
        continue
    olumsuz = bool(re.search(r"(değildir|yanlış|olmaz|bulunmaz|yoktur|içermez|beklenmez|kullanılmaz|görülmez|en az)", q["metin"]))
    en = max(puan, key=puan.get)
    if not olumsuz and en != q["dogru_cevap"] and puan[en] >= 0.99 and puan[q["dogru_cevap"]] == 0:
        isaret.append({"id": q["id"], "anahtar": q["dogru_cevap"], "aciklama_isaret": en, "kok": q["metin"][:120],
                       "siklar": q["secenekler"], "ac": ac[:250]})
json.dump(isaret, open(sys.argv[2], "w"), ensure_ascii=False, indent=1)
print(len(veri), "soru,", len(isaret), "işaretli")
