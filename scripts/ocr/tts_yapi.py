#!/usr/bin/env python3
"""
TTS tarzi YENI kitap (eski baskisi islenmemis) -> yapi.json (yeni_baski.py bicimi, eski_id yerine anahtar).

TTS'te soru numarasi bazi alt bolumlerde 1'e doner, bazilarinda devam eder (Farmakoloji: "Dagilim" 24'ten
baslar). Bu yuzden bolum siniri SAYFADAN degil, sayfadaki BOLUM BASLIGINDAN bulunur (icindekilerdeki ad,
buyuk harfle). Numaralar bolum icinde artan zincir olarak secilir; aciklamalardaki kalin numarali ozet
kutulari ("13. EHS ... 14. ...") sik satiri olmadigi icin aday olmaz.

Kullanim: ONEK=tf python3 -I tts_yapi.py <D> <bolumler_pdf.json>
  bolumler_pdf.json: [{"no": 1, "ad": "Dagilim", "bas": 13, "son": 18}, ...]   (PDF sayfasi; bas = baslik sayfasi)
Cikti: <D>/yapi.json, <D>/basliklar.json (bulunan baslik satirlari) + rapor
"""
import difflib
import json
import os
import re
import sys

D = sys.argv[1]
BOL = json.load(open(sys.argv[2], encoding="utf-8"))
ONEK = os.environ.get("ONEK", "tts")
sys.argv = [sys.argv[0], D]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import yeni_baski as yb  # noqa: E402

S = yb.satirlar
# Varyant kutusu yalnizca "Bu soru, baska bir hoca tarafindan soyle de sorulabilirdi" ile baslar.
# yeni_baski'nin genis deseni ("sorulab") "... ile Ilgili Sorulabilecek Onemli Bilgiler" ozet kutularini da
# varyant sayip bir sonraki cevap satirina kadar her seyi (gercek sorular dahil) gizliyordu.
VARYANT = re.compile(r"(ba[sş]ka\s*bir\s*h[oö0][cç]a|[sş][oö]yle\s*de\s*sor)", re.I)
for _s in S:
    _s[5] = False
_i = 0
while _i < len(S):
    if VARYANT.search(S[_i][4]):
        _j = _i
        while _j < min(_i + 40, len(S)) and not yb.CEVAP.search(S[_j][4]):
            _j += 1
        if _j < min(_i + 40, len(S)):
            for _t in range(_i, _j + 1):
                S[_t][5] = True
            _i = _j
    _i += 1
yb.SIK_SATIRI = re.compile(r"^[\s\W]{0,3}(?:[A-E8][)\]]|A[jJ])")
yb.SECENEK = re.compile(r"(?:^|\s)\(?[GOo0©6]?(?:([A-E8G©€0O6&£])\s?[)\]}]|(A)[jJ])")
yb.harfler = lambda t: [yb.HARF.get(m.group(1) or m.group(2), m.group(1) or m.group(2)) for m in yb.SECENEK.finditer(t)]


def buyuk(t):
    t = t.replace("i", "İ").replace("ı", "I").upper()
    return re.sub(r"[^A-ZÇĞİÖŞÜ]", "", t)


# ---------------------------------------------------------------- bolum basliklari
basliklar = []
for b in BOL:
    hedef = buyuk(b["ad"])[:28]
    en = None
    for i, s in enumerate(S):
        if not (b["bas"] - 1 <= s[0] <= b["bas"] + 1):
            continue
        t = buyuk(s[4] + " " + (S[i + 1][4] if i + 1 < len(S) and S[i + 1][:2] == s[:2] else ""))
        if len(t) < 4:
            continue
        # basliklar buyuk harfli: satirin kendisinde kucuk harf az olmali
        kucuk = sum(c.islower() for c in s[4]) / max(1, len(s[4]))
        if kucuk > 0.25:
            continue
        r = difflib.SequenceMatcher(None, t[:len(hedef)], hedef).ratio()
        if r >= 0.72 and (en is None or r > en[0] or (r == en[0] and s[0] == b["bas"] and S[en[1]][0] != b["bas"])):
            en = (r, i)
    if en is None:  # bulunamadi: baslangic sayfasinin ilk satiri
        i0 = next((i for i, s in enumerate(S) if s[0] == b["bas"]), None)
        basliklar.append({"no": b["no"], "ad": b["ad"], "satir": i0, "bulundu": False})
    else:
        basliklar.append({"no": b["no"], "ad": b["ad"], "satir": en[1], "bulundu": True, "oran": round(en[0], 2),
                          "metin": S[en[1]][4]})
basliklar.sort(key=lambda x: x["satir"])
json.dump(basliklar, open(f"{D}/basliklar.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)


def bolum_of(idx):
    cur = None
    for h in basliklar:
        if h["satir"] is not None and h["satir"] <= idx:
            cur = h["no"]
    return cur


# ---------------------------------------------------------------- adaylar
BAS = re.compile(r"^(?:[\s\W_]|[lI|](?=\s)){0,3}?(\d{1,3})\s?[.,]\s*(\S.{3,})$")
adaylar = []
for i, s in enumerate(S):
    if s[5]:
        continue
    m = BAS.match(s[4])
    if not m or yb.SIK_SATIRI.match(m.group(2)):
        continue
    no = int(m.group(1))
    sik_ilk, sik_son, bitis, cevap = yb.soru_yapisi(i, no=no)
    if sik_ilk is None or sik_ilk - i > 30:
        continue
    # ozet kutusu / numarali liste maddesi
    # (koklerdeki "1. ... 2. ..." onculleri elenmesin: yalnizca hemen sonraki numara (no+1) gelirse liste)
    if any((mm := BAS.match(S[j][4])) and not S[j][5] and int(mm.group(1)) == no + 1 for j in range(i + 1, sik_ilk)):
        continue
    # listenin son maddeleri: hemen ustteki satirlarda (ayni sutun) no-1 numarali madde varsa liste devami
    if any(S[j][:2] == s[:2] and (mm := BAS.match(S[j][4])) and int(mm.group(1)) == no - 1
           and not yb.CEVAP.search(" ".join(S[k][4] for k in range(j, i)))
           for j in range(max(0, i - 3), i)):
        continue
    adaylar.append(dict(bas=i, sayfa=s[0], no=no, sik_ilk=sik_ilk, sik_son=sik_son, bitis=bitis, cevap=cevap,
                        bolum=bolum_of(i), ilk=m.group(2)))


def cevaptan_sonra(i):
    """Gercek soru baslangici ya onceki sorunun cevap satirindan hemen sonra ya da sutun basinda."""
    for j in range(i - 1, max(i - 4, -1), -1):
        if S[j][:2] != S[i][:2]:
            return True
        if yb.CEVAP.search(S[j][4]):
            return True
    return i == 0 or S[i - 1][:2] != S[i][:2]


# Numara ANA bolum (bolumler_pdf.json'daki "bolum" alani) boyunca kesintisiz; zincir ana bolum duzeyinde kurulur,
# alt bolum (set) sonra baslik konumundan atanir. "bolum" alani yoksa her alt bolum kendi zinciridir.
ust_ad = {b["no"]: b.get("bolum") or b["ad"] for b in BOL}
gruplar = []
for b in BOL:
    if not gruplar or gruplar[-1]["ad"] != ust_ad[b["no"]]:
        gruplar.append({"ad": ust_ad[b["no"]], "altlar": []})
    gruplar[-1]["altlar"].append(b["no"])

yapi, rapor = [], {}
for g in gruplar:
    altlar = set(g["altlar"])
    ad = sorted([a for a in adaylar if a["bolum"] in altlar], key=lambda a: a["bas"])
    if not ad:
        rapor[g["ad"]] = {"soru": 0}
        continue
    bas_no = 1
    # en uzun artan dizi (numara artan, sicrama <= 15); cevap satirindan sonra gelen / cevabi olan aday agir basar
    agirlik = [1 + 0.5 * cevaptan_sonra(a["bas"]) + 0.3 * bool(a["cevap"]) for a in ad]
    en, onceki = [0.0] * len(ad), [-1] * len(ad)
    for k, a in enumerate(ad):
        en[k] = agirlik[k] if a["no"] <= 15 else agirlik[k] - 2   # dizinin basi kucuk numara olmali
        for j in range(max(0, k - 120), k):
            if ad[j]["no"] < a["no"] <= ad[j]["no"] + 15 and en[j] + agirlik[k] > en[k]:
                en[k], onceki[k] = en[j] + agirlik[k], j
    k = max(range(len(ad)), key=lambda x: en[x])
    secilen = []
    while k != -1:
        secilen.append(ad[k])
        k = onceki[k]
    secilen.reverse()
    gorulen = {a["no"] for a in secilen}
    sinir_alt = min(a["bas"] for a in ad) - 1
    sinir_ust = max(a["bas"] for a in ad) + 1
    # numarasi kaybolmus / noktasiz okunmus sorular ("101 Asagidaki", "M2.Sodyum", numara satiri yok):
    # iki komsu soru arasinda, bir cevap satirindan hemen sonra baslayip siklara ulasan blok sayisi eksik
    # numara sayisina esitse bloklar sirayla o numaralari alir
    secilen.sort(key=lambda x: x["bas"])
    for k in range(len(secilen) - 1):
        a, c = secilen[k], secilen[k + 1]
        eksikler = list(range(a["no"] + 1, c["no"]))
        if not eksikler or not a["bitis"]:
            continue
        bloklar = []
        for i in range(a["bitis"], c["bas"]):
            if not yb.CEVAP.search(S[i][4]) or S[i][5]:
                continue
            bas = i + 1
            while bas < c["bas"] and (S[bas][5] or len(re.sub(r"[^A-Za-zÇĞİÖŞÜçğıöşü]", "", S[bas][4])) < 3):
                bas += 1
            if bas >= c["bas"] or yb.SIK_SATIRI.match(S[bas][4]):
                continue
            si, ss, bt, cv = yb.soru_yapisi(bas)
            if si is None or si - bas > 12 or si >= c["bas"]:
                continue
            bloklar.append((bas, si, ss, bt, cv))
        if len(bloklar) == len(eksikler):
            for n, (bas, si, ss, bt, cv) in zip(eksikler, bloklar):
                ilk = re.sub(r"^\W{0,3}[0-9A-Za-zIl|]{0,2}\d{0,3}\s?[.,]?\s*(?=\S)", "", S[bas][4]) if re.match(r"^\W{0,3}\S{0,2}\d{1,3}", S[bas][4]) else S[bas][4]
                secilen.append(dict(bas=bas, sayfa=S[bas][0], no=n, sik_ilk=si, sik_son=ss, bitis=bt, cevap=cv,
                                    bolum=bolum_of(bas), ilk=ilk))
                gorulen.add(n)
    for n in range(bas_no, max((x["no"] for x in secilen), default=bas_no)):
        if n in gorulen:
            continue
        once = [x for x in secilen if x["no"] < n]
        sonra = [x for x in secilen if x["no"] > n]
        alt = max((x["bas"] for x in once), default=sinir_alt)
        ust = min((x["bas"] for x in sonra), default=sinir_ust)
        uygun = [a for a in ad if alt < a["bas"] < ust and a["no"] % 10 == n % 10 and a not in secilen]
        tek = [a for a in ad if alt < a["bas"] < ust and a not in secilen and a["cevap"]]
        eksik_say = sum(1 for m in range(n, n + 20) if m not in gorulen and any(x["no"] > m for x in secilen)
                        and all(x["no"] != m for x in secilen) and m < min((x["no"] for x in sonra), default=0))
        if not uygun and len(tek) == 1 and eksik_say == 1:
            uygun = tek
        if uygun:
            secilen.append(dict(uygun[0], no=n))
            gorulen.add(n)
            continue
        for i in range(alt + 1, min(ust, len(S))):
            if S[i][5]:
                continue
            m = re.search(rf"(?:^|[\s(])(?:{n}|{str(n).replace('8', '[8B]').replace('0', '[0O]').replace('1', '[1lI]')})(?:\s?[.,]|\s(?=[A-ZÇĞİÖŞÜ«]))\s*(\S.{{8,}})$", S[i][4])
            if not m:
                continue
            si, ss, bt, cv = yb.soru_yapisi(i, no=n)
            if si is None or si - i > 30:
                continue
            secilen.append(dict(bas=i, sayfa=S[i][0], no=n, sik_ilk=si, sik_son=ss, bitis=bt, cevap=cv,
                                bolum=bolum_of(i), ilk=m.group(1)))
            gorulen.add(n)
            break
    secilen.sort(key=lambda x: x["bas"])
    for k, a in enumerate(secilen):
        sinir = secilen[k + 1]["bas"] if k + 1 < len(secilen) else None
        si, ss, bt, cv = yb.soru_yapisi(a["bas"], son_sinir=sinir)
        if si is not None and si == a["sik_ilk"] and bt is not None:
            a.update(sik_son=ss, bitis=bt, cevap=cv)
        elif sinir is not None and a["sik_ilk"] is not None and a["sik_ilk"] >= sinir:
            # siklar algilanamadi (iki sutunlu / tablo seklinde): sonraki sorunun siklarini alma; elle okunacak
            cev = next((j for j in range(a["bas"] + 1, sinir) if yb.CEVAP.search(S[j][4]) and not S[j][5]), None)
            ust = cev if cev is not None else sinir
            a.update(sik_ilk=None, sik_son=None, bitis=cev,
                     cevap=yb.HARF.get(yb.CEVAP.search(S[cev][4]).group(1).upper(), yb.CEVAP.search(S[cev][4]).group(1).upper()) if cev is not None else None,
                     kok_son=ust, sik_yok=True)
    SIKLI = re.compile(r"^[\s\W]{0,3}(?:[A-E8G€Ğ][cyY]?[)\]]|E[Yy]\s?\S)")
    for a in secilen:
        if a["sik_son"] is None or not a["bitis"]:
            continue
        while a["sik_son"] + 1 < a["bitis"] and SIKLI.match(S[a["sik_son"] + 1][4]):
            a["sik_son"] += 1
        while (a["sik_son"] + 1 < a["bitis"]
               and not S[a["sik_son"]][4].rstrip().endswith((".", "?", "!", ":", ")"))
               and re.match(r"^[a-zçğıöşü(]", S[a["sik_son"] + 1][4].strip())
               and S[a["sik_son"] + 1][:2] == S[a["sik_son"]][:2]):
            a["sik_son"] += 1
        a["bolum"] = bolum_of(a["bas"])
    nolar = sorted(x["no"] for x in secilen)
    eksik = sorted(set(range(bas_no, (nolar[-1] if nolar else 0) + 1)) - set(nolar))
    alt_sayim = {}
    for a in secilen:
        alt_sayim[a["bolum"]] = alt_sayim.get(a["bolum"], 0) + 1
    rapor[g["ad"]] = {"soru": len(secilen), "son_no": nolar[-1] if nolar else 0, "eksik_no": eksik[:40],
                      "cevapsiz": [x["no"] for x in secilen if not x["cevap"]], "alt_bolum_soru": alt_sayim}
    for a in secilen:
        kok_son = a["sik_ilk"] if a["sik_ilk"] is not None else a.get("kok_son", a["bas"] + 1)
        kok = " ".join([a["ilk"]] + [S[j][4] for j in range(a["bas"] + 1, kok_son) if not S[j][5]])
        yapi.append({
            "aday": a["bas"], "sayfa": a["sayfa"], "no": a["no"], "eski_id": f"{ONEK}-{a['bolum']:02d}-{a['no']:03d}",
            "oran": None, "kok": kok,
            "secenekler": yb.secenekleri_ayir(a["sik_ilk"], a["sik_son"]) if a["sik_son"] is not None else {},
            "cevap": a["cevap"], "eski_cevap": None, "bas": a["bas"], "sik_ilk": a["sik_ilk"],
            "sik_son": a["sik_son"], "bitis": a["bitis"], "bolum": a["bolum"], "sik_yok": bool(a.get("sik_yok")), "kok_son": kok_son,
        })
json.dump(yapi, open(f"{D}/yapi.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(json.dumps({"toplam": len(yapi), "baslik_bulunamayan": [h["ad"] for h in basliklar if not h["bulundu"]],
                  "bolumler": rapor}, ensure_ascii=False, indent=1))
