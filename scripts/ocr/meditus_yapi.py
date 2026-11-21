#!/usr/bin/env python3
"""
Meditus tarzi kitap (soru, siklar, aciklama, "Dogru cevap: X") -> yapi.json (yeni_baski.py bicimi,
eski_id yerine anahtar). Bolumler PDF sayfa araligindan.

Kullanim: python3 -I meditus_yapi.py <D> <bolumler.json>
  bolumler.json: [{"no": 1, "ad": "Temel Mikrobiyoloji", "bas": 5, "son": 48}, ...]   (PDF sayfasi)
Ortam degiskenleri (TTS tarzi kitaplar icin):
  ONEK=tf          anahtar oneki (varsayilan "med" -> "med-BB-NNN")
  VARYANT=1        "soyle de sorulabilirdi" kutularini isaretli birak (TTS'te var, Meditus'ta yok)
  (TTS'te bolum basligi sayfa ortasinda olabilir ve numara her bolumde 1'e donmeyebilir: tts_yapi.py kullan)
Cikti: <D>/yapi.json + rapor (bolum basina soru, numara bosluklari, cevapsiz)
"""
import json
import os
import re
import sys

D = sys.argv[1]
BOL = json.load(open(sys.argv[2], encoding="utf-8"))
sys.argv = [sys.argv[0], D]
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
import yeni_baski as yb  # noqa: E402

# Meditus'ta "soyle de sorulabilirdi" kutusu yok; "Sinavda sorulabilecek sorulardandir" gibi cumleler
# varyant sanilmasin
ONEK = os.environ.get("ONEK", "med")
if os.environ.get("VARYANT") != "1":
    for _s in yb.satirlar:
        _s[5] = False
# "A)" OCR'da "AJ", "Aj", "Aji" olabiliyor: sik satiri sayilsin (yoksa soru sonrakinin siklarini yutar)
yb.SIK_SATIRI = re.compile(r"^[\s\W]{0,3}(?:[A-E8][)\]]|A[jJ])")
yb.SECENEK = re.compile(r"(?:^|\s)\(?[GOo0©6]?(?:([A-E8G©€0O6&£])\s?[)\]}]|(A)[jJ])")
_eski_harfler = yb.harfler
yb.harfler = lambda t: [yb.HARF.get(m.group(1) or m.group(2), m.group(1) or m.group(2)) for m in yb.SECENEK.finditer(t)]


import os  # noqa: E402
SIK_SON = json.load(open(f"{D}/sik_son.json", encoding="utf-8")) if os.path.exists(f"{D}/sik_son.json") else {}


def bolum(sayfa):
    for b in BOL:
        if b["bas"] <= sayfa <= b["son"]:
            return b["no"]
    return None


# Meditus: oncul (I. II. ...) sorularinda numaradan sonra kisa satir gelir ("31. I. E.coli"), numara
# onunde tek harf cop olabilir ("l 39, II. Kristal viyole")
BAS = re.compile(r"^(?:[\s\W_]|[lI|](?=\s)){0,3}?(\d{1,3})\s?[.,]\s*(\S.{3,})$")
adaylar = []
for i, s in enumerate(yb.satirlar):
    m = BAS.match(s[4])
    if not m or yb.SIK_SATIRI.match(m.group(2)):
        continue
    no = int(m.group(1))
    sik_ilk, sik_son, bitis, cevap = yb.soru_yapisi(i, no=no)
    if sik_ilk is None or sik_ilk - i > 30:
        continue
    adaylar.append(dict(bas=i, sayfa=s[0], no=no, sik_ilk=sik_ilk, sik_son=sik_son, bitis=bitis, cevap=cevap,
                        bolum=bolum(s[0]), ilk=m.group(2)))

# her bolumde numara artan zincir: ayni numarali adaylardan once gelen (ve sikli olan) kalir
yapi, rapor = [], {}
for b in BOL:
    ad = [a for a in adaylar if a["bolum"] == b["no"]]
    def cevaptan_sonra(a):
        """Gercek soru baslangici ya bir onceki sorunun cevap satirindan hemen sonra ya da sutun basinda."""
        i = a["bas"]
        for j in range(i - 1, max(i - 4, -1), -1):
            if yb.satirlar[j][:2] != yb.satirlar[i][:2]:
                return True
            if yb.CEVAP.search(yb.satirlar[j][4]):
                return True
        return i == 0 or yb.satirlar[i - 1][:2] != yb.satirlar[i][:2]

    gorulen, secilen, son_no = set(), [], 0
    for k, a in enumerate(ad):
        if a["no"] in gorulen or a["no"] <= son_no - 3 or a["no"] > son_no + 15:
            continue
        # ayni numarali daha iyi bir aday yakinda varsa (aciklamadaki numarali liste degil) onu bekle
        if not cevaptan_sonra(a) and any(b2["no"] == a["no"] and cevaptan_sonra(b2) and b2["bas"] - a["bas"] < 400
                                         for b2 in ad[k + 1:]):
            continue
        gorulen.add(a["no"])
        son_no = max(son_no, a["no"])
        secilen.append(a)
    # bosluklar: numaranin ilk hanesi taramada kesilmis ya da yanlis okunmus olabilir ("8." -> 18,
    # "35." -> 55). Iki komsu sorunun arasinda, son hanesi tutan aday o numarayi alir.
    secilen.sort(key=lambda x: x["bas"])
    for n in range(1, max((x["no"] for x in secilen), default=0)):
        if n in gorulen:
            continue
        once = [x for x in secilen if x["no"] < n]
        sonra = [x for x in secilen if x["no"] > n]
        alt = max((x["bas"] for x in once), default=-1)
        ust = min((x["bas"] for x in sonra), default=10**9)
        uygun = [a for a in ad if alt < a["bas"] < ust and a["no"] % 10 == n % 10 and a not in secilen]
        if uygun:
            u = dict(uygun[0], no=n)
            secilen.append(u)
            gorulen.add(n)
            continue
        for i in range(alt + 1, min(ust, len(yb.satirlar))):
            t = yb.satirlar[i][4]
            m = re.search(rf"(?:^|[\s(])(?:{n}|{str(n).replace('8', '[8B]').replace('0', '[0O]').replace('1', '[1lI]')})\s?[.,]\s*(\S.{{8,}})$", t)
            if not m:
                continue
            sik_ilk, sik_son, bitis, cevap = yb.soru_yapisi(i, no=n)
            if sik_ilk is None or sik_ilk - i > 30:
                continue
            secilen.append(dict(bas=i, sayfa=yb.satirlar[i][0], no=n, sik_ilk=sik_ilk, sik_son=sik_son,
                                bitis=bitis, cevap=cevap, bolum=b["no"], ilk=m.group(1)))
            gorulen.add(n)
            break
    secilen.sort(key=lambda x: x["bas"])
    nolar = sorted(x["no"] for x in secilen)
    eksik = sorted(set(range(1, (nolar[-1] if nolar else 0) + 1)) - set(nolar))
    rapor[b["ad"]] = {"soru": len(secilen), "en_buyuk_no": nolar[-1] if nolar else 0, "eksik_no": eksik[:40],
                      "cevapsiz": [x["no"] for x in secilen if not x["cevap"]]}
    # yapiyi bir sonraki sorunun basina kadar yeniden cikar (aciklamadaki "2." satirinda durmasin)
    for k, a in enumerate(secilen):
        sinir = secilen[k + 1]["bas"] if k + 1 < len(secilen) else None
        si, ss, bt, cv = yb.soru_yapisi(a["bas"], son_sinir=sinir)
        if si is not None and si == a["sik_ilk"] and bt is not None:
            a.update(sik_son=ss, bitis=bt, cevap=cv)
    rapor[b["ad"]]["cevapsiz"] = [x["no"] for x in secilen if not x["cevap"]]
    # sik blogu erken bitmisse (son sik "€)", "EY" gibi okunmus) bir sonraki sik satirlarini da al
    SIKLI = re.compile(r"^[\s\W]{0,3}(?:[A-E8G€Ğ][cyY]?[)\]]|E[Yy]\s?\S)")
    for a in secilen:
        if a["sik_son"] is None or not a["bitis"]:
            continue
        while a["sik_son"] + 1 < a["bitis"] and SIKLI.match(yb.satirlar[a["sik_son"] + 1][4]):
            a["sik_son"] += 1
        # son sik alt satira tasmis: satir noktalama ile bitmiyor, sonraki satir kucuk harfle basliyor
        while (a["sik_son"] + 1 < a["bitis"]
               and not yb.satirlar[a["sik_son"]][4].rstrip().endswith((".", "?", "!", ":", ")"))
               and re.match(r"^[a-zçğıöşü(]", yb.satirlar[a["sik_son"] + 1][4].strip())
               and yb.satirlar[a["sik_son"] + 1][:2] == yb.satirlar[a["sik_son"]][:2]):
            a["sik_son"] += 1
        anahtar = f"{ONEK}-{b['no']:02d}-{a['no']:03d}"
        if anahtar in SIK_SON:
            a["sik_son"] = SIK_SON[anahtar]
    for a in secilen:
        kok = " ".join([a["ilk"]] + [yb.satirlar[j][4] for j in range(a["bas"] + 1, a["sik_ilk"])
                                     if not yb.satirlar[j][5]])
        yapi.append({
            "aday": a["bas"], "sayfa": a["sayfa"], "no": a["no"], "eski_id": f"{ONEK}-{b['no']:02d}-{a['no']:03d}",
            "oran": None, "kok": kok,
            "secenekler": yb.secenekleri_ayir(a["sik_ilk"], a["sik_son"]) if a["sik_son"] is not None else {},
            "cevap": a["cevap"], "eski_cevap": None, "bas": a["bas"], "sik_ilk": a["sik_ilk"],
            "sik_son": a["sik_son"], "bitis": a["bitis"], "bolum": b["no"],
        })
json.dump(yapi, open(f"{D}/yapi.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(json.dumps(rapor, ensure_ascii=False, indent=1))
