#!/usr/bin/env python3
"""
OCR metninden (sutun bazli) soru taslagi cikarir.

Kullanim: python3 -I ayristir.py <ocr_sayfa_dizini> <cikis.json>

- Soru baslangici: satir basinda "N." (N beklenen sira) ve ardindan A)/B) secenekleri.
- Her bolumde numara 1'den baslar; yeniden "1." gorulunce yeni bolum.
- Dogru cevap: bloktaki SON "Dogru cevap: X" (varyant kutularinin cevabi daha once gelir).
- "(DUS'ta sorulmaya uygun)" rozeti silinir; sinav etiketi "(Ilkbahar 94)" korunur.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bolumler import BOLUMLER, SON_SAYFA  # noqa: E402

OCR, CIKIS = sys.argv[1], sys.argv[2]

HARF_DUZELT = {"8": "B", "G": "C", "©": "C", "6": "C", "€": "E", "£": "E", "&": "E", "0": "D", "O": "D"}
BASLANGIC = re.compile(r"^[\s\W_]{0,3}?(\d{1,3})\s?[.,]\s*(\S.*)$")
SECENEK_SATIR = re.compile(r"^[\s*.\-|'\"“”(]{0,3}[GOo0©6]?([A-E8G©€0O6&£])\s?[)\]}]\s*(.*)$")
SECENEK_ICI = re.compile(r"\s\(?[GOo0©6]?([A-E8G6&£€0])\s?\)\s")
CEVAP = re.compile(r"Do[ğg]ru\s*cevap\s*[:;.]?\s*([A-E8G©€0O])\b", re.I)
DUS = re.compile(r"\(?\s*\bD\s?U\s?S\b[^()]{0,30}?uyg[uüv]n\w*\s*\)?\.?", re.I)
SINAV = re.compile(r"\((?:[^()]*?(?:İlkbahar|Ilkbahar|Sonbahar|Eylül|Nisan|Mart|Eylul)[^()]*)\)", re.I)


def harf(h):
    return HARF_DUZELT.get(h, h)


# ------------------------------------------------------------ satirlar
satirlar = []  # (sayfa, metin)
for k in range(1, SON_SAYFA + 1):
    for sutun in "LR":
        yol = f"{OCR}/k{k:03d}-{sutun}.txt"
        if not os.path.exists(yol):
            continue
        with open(yol, encoding="utf-8") as f:
            for satir in f:
                satirlar.append((k, satir.rstrip("\n").strip()))

n = len(satirlar)

# Varyant kutularini ("Bu soru, baska bir hoca tarafindan soyle de sorulabilirdi: ... Dogru cevap: X")
# tamamen yok say: icindeki "1."/"I." maddeleri sahte soru, cevabi da yanlis cevap uretiyordu.
BENZER = re.compile(r"BENZER", re.I)
VARYANT = re.compile(r"(sorulab|ba[sş]ka bir ho[cç]a|[sş][oö]yle de sor)", re.I)
varyant_satir = 0
i = 0
while i < n:
    if VARYANT.search(satirlar[i][1]):
        j = i
        while j < min(i + 40, n):
            if CEVAP.search(satirlar[j][1]):
                break
            j += 1
        if j < min(i + 40, n):
            for t in range(i, j + 1):
                satirlar[t] = (satirlar[t][0], "")
            varyant_satir += j - i + 1
            i = j
    i += 1


def secenek_baslar(metin):
    m = SECENEK_SATIR.match(metin)
    return (harf(m.group(1)), m.group(2)) if m else None


def gecerli_mi(i):
    """i. satirdaki aday soru baslangicini 35 satir icinde A) ve B) secenekleri izliyor mu?"""
    a = b = False
    for j in range(i + 1, min(i + 36, n)):
        t = satirlar[j][1]
        if CEVAP.search(t):
            return False
        s = secenek_baslar(t)
        if s:
            if s[0] == "A":
                a = True
                if SECENEK_ICI.search(" " + s[1] + " "):
                    b = True
            elif s[0] == "B" and a:
                b = True
        if a and b:
            return True
    return False


def temizle(t):
    """Rozet/vurgu kaynakli OCR artiklarini ve sinav etiketlerini duzeltir."""
    t = DUS.sub("", t)
    t = re.sub(r"\(\s*[A-Za-zİıÜüÖöÇçŞşĞğ0-9]{0,2}kbahar", "(İlkbahar", t)
    t = re.sub(r"\b[A-Za-zİı]{0,2}[lİI]kbahar", "İlkbahar", t)
    t = re.sub(r"(İlkbahar|Sonbahar)\s*\(\s*(\d{2,4})\s*\)?", r"\1 \2", t)
    t = re.sub(r"(?<![A-Za-zÇçĞğİıÖöŞşÜü])(Oo|oo|OO|Oo0|0o)(?![A-Za-zÇçĞğİıÖöŞşÜü])", " ", t)
    t = re.sub(r"\((?:o|O|0)\s+", "", t)
    # kapanmayan parantezleri sil: "(" sonrasinda bir sonraki "(" veya sondan once ")" yoksa
    cikti, i = [], 0
    while i < len(t):
        ch = t[i]
        if ch == "(":
            kalan = t[i + 1:]
            kap = kalan.find(")")
            ac = kalan.find("(")
            if kap == -1 or (ac != -1 and ac < kap):
                i += 1
                continue
        cikti.append(ch)
        i += 1
    t = "".join(cikti)
    t = re.sub(r"\ben\s*[.…]+\s*", "en ", t)
    t = re.sub(r"\ben şık\b", "en sık", t)
    t = re.sub(r"\ben ola[şs]ı\b", "en olası", t)
    t = re.sub(r"\s+([?.,;:)])", r"\1", t)
    t = re.sub(r"\(\s+", "(", t)
    return re.sub(r"\s{2,}", " ", t).strip()


def onaylanir(i, no):
    """Aday numaradan sonra 160 satir icinde no+1 (veya no+2) gecerli bir soru basliyorsa sira dogrudur."""
    for j in range(i + 1, min(i + 160, n)):
        m2 = BASLANGIC.match(satirlar[j][1])
        if m2 and int(m2.group(1)) in (no + 1, no + 2) and gecerli_mi(j):
            return True
    return False


# ------------------------------------------------------------ 1. gecis: soru baslangiclari
baslangiclar = []  # (satir_index, numara, yeni_bolum)
son = 0
for i, (sayfa, t) in enumerate(satirlar):
    m = BASLANGIC.match(t)
    if not m:
        continue
    no = int(m.group(1))
    ileri = son + 1 <= no <= son + 3            # siradaki soru (OCR'in kacirdigi 1-2 soruya tolerans)
    yeniden = bool(baslangiclar) and (no == 1 or (2 <= no <= 3 and son > no))  # yeni bolum
    if not (ileri or yeniden) and son + 3 < no <= son + 60 and onaylanir(i, no):
        ileri = True                             # yeniden senkron: arada cok soru kacmis
    if not (ileri or yeniden):
        continue
    if not gecerli_mi(i):
        continue
    yeni_bolum = (not baslangiclar) or (yeniden and not ileri)
    baslangiclar.append((i, no, yeni_bolum))
    son = no

# ------------------------------------------------------------ 2. gecis: bloklari ayristir
def birlestir(parcalar):
    metin = ""
    for p in parcalar:
        p = p.strip()
        if not p:
            continue
        if metin.endswith("-") and not metin.endswith(" -"):
            metin = metin[:-1] + p
        else:
            metin = (metin + " " + p) if metin else p
    return re.sub(r"\s+", " ", metin).strip()


sorular = []
bolum = -1
for b, (i, no, yeni) in enumerate(baslangiclar):
    if yeni:
        bolum += 1
    bitis = baslangiclar[b + 1][0] if b + 1 < len(baslangiclar) else n
    blok = satirlar[i:bitis]
    sayfa = blok[0][0]
    uyari = []

    # kok
    kok = [BASLANGIC.match(blok[0][1]).group(2)]
    j = 1
    while j < len(blok) and not (secenek_baslar(blok[j][1]) and secenek_baslar(blok[j][1])[0] == "A"):
        kok.append(blok[j][1])
        j += 1
    kok_metin = birlestir(kok)
    kok_metin = DUS.sub("", kok_metin).strip()
    kok_metin = re.sub(r"\s+([?.,;:])", r"\1", kok_metin)
    # sinav etiketinden sonra kalan kisa OCR artigini at: "... (Ilkbahar 98) ii vi"
    etiketler = list(SINAV.finditer(kok_metin))
    if etiketler:
        kuyruk = kok_metin[etiketler[-1].end():].strip()
        if len(kuyruk) < 15 and "?" not in kuyruk:
            kok_metin = kok_metin[: etiketler[-1].end()]

    # secenekler
    secenekler = {}
    sira = []
    aktif = None
    devam = 0
    while j < len(blok):
        t = blok[j][1]
        s = secenek_baslar(t)
        ileri = s and s[0] in "ABCDE" and (not sira or "ABCDE".index(s[0]) > "ABCDE".index(sira[-1]))
        if ileri:
            # ayni satirda birden fazla secenek olabilir: "A) Bakteri B) Mantar"
            parcalar = re.split(r"\s\(?[GOo0©6]?([A-E8G6&£€0])\s?\)\s", " " + s[1] + " ")
            secenekler[s[0]] = parcalar[0].strip()
            sira.append(s[0])
            aktif = s[0]
            for k2 in range(1, len(parcalar) - 1, 2):
                h = harf(parcalar[k2])
                secenekler[h] = parcalar[k2 + 1].strip()
                sira.append(h)
                aktif = h
            devam = 0
        elif aktif:
            if not t:
                if aktif == "E":
                    break  # E'den sonraki bos satir: secenekler bitti
            else:
                sinir = 2 if aktif == "E" else 3
                if devam >= sinir:
                    break
                secenekler[aktif] = (secenekler[aktif] + " " + t).strip()
                devam += 1
        j += 1
    for h in list(secenekler):
        secenekler[h] = re.sub(r"\s+", " ", secenekler[h]).strip()

    # cevap: bloktaki son "Dogru cevap"
    cevaplar = []      # (harf, varyant_mi)
    for idx, (_, t) in enumerate(blok):
        m = CEVAP.search(t)
        if m:
            onceki = " ".join(x for _, x in blok[max(0, idx - 18):idx])
            cevaplar.append((harf(m.group(1).upper()), bool(BENZER.search(onceki))))
    asil = [h for h, v in cevaplar if not v]
    sonraki_no = baslangiclar[b + 1][1] if b + 1 < len(baslangiclar) else None
    bosluk = sonraki_no is not None and sonraki_no != no + 1 and sonraki_no != 1
    if bosluk:
        uyari.append(f"sonraki soru(lar) kacmis: {no + 1}..{sonraki_no - 1}" if sonraki_no > no + 1 else "bolum sonu/kacmis soru")
    # sonraki soru kacmissa blok onun cevabini da icerir: ilk asil cevap bu sorunun cevabidir
    if asil:
        cevap = asil[0] if bosluk else asil[-1]
    else:
        cevap = cevaplar[-1][0] if cevaplar else None
    cevaplar = asil if asil else [h for h, _ in cevaplar]
    if cevap not in (None, "A", "B", "C", "D", "E"):
        uyari.append(f"cevap harfi supheli: {cevap}")
        cevap = None
    if cevap is None:
        uyari.append("cevap bulunamadi")
    if len(set(cevaplar)) > 1 and not bosluk:
        uyari.append(f"blokta {len(cevaplar)} 'Dogru cevap' (varyant kutusu olabilir)")
    if "".join(sorted(secenekler)) != "ABCDE":
        uyari.append(f"secenekler eksik/fazla: {''.join(sorted(secenekler))}")
    # Roma rakamli onculler/secenekler OCR'da cogu zaman bozulur (I/l/i/1 karisir): mutlaka gozle bak
    romen = re.compile(r"^[\sIiİıl1|!LVvXx,.;:\-–()]*(ve|veya)?[\sIiİıl1|!LVvXx,.;:\-–()]*$")
    if secenekler and sum(1 for v in secenekler.values() if v and romen.match(v)) >= 2:
        uyari.append("Roma rakamli secenekler (OCR bozuk olabilir)")
    if len(kok_metin) < 25:
        uyari.append("kok cok kisa")
    if cevap and cevap not in secenekler:
        uyari.append("cevap seceneklerde yok")

    kok_metin = temizle(kok_metin)
    secenekler = {h: temizle(v) for h, v in secenekler.items()}
    sorular.append({
        "bolum": bolum,
        "sayfa": sayfa,
        "no": no,
        "kok": kok_metin,
        "secenekler": {h: secenekler[h] for h in sorted(secenekler)},
        "cevap": cevap,
        "uyari": uyari,
    })

# ------------------------------------------------------------ bolum atamasi (icindekiler sayfalarina gore)
baslar = [b[0] for b in BOLUMLER]
c = 0
onceki_no = 0
for s in sorular:
    sf, no = s["sayfa"], s["no"]
    if no <= 3 and no <= onceki_no:  # numara sifirlandi: yeni bolum
        aday = None
        for k in range(c + 1, len(BOLUMLER)):
            if baslar[k] > sf + 1:
                break
            if baslar[k] >= sf - 1:
                aday = k
                break
        if aday is None:
            s["uyari"].append("numara sifirlandi ama yakinda bolum baslangici yok: sahte soru olabilir")
        else:
            c = aday
            if sf < baslar[aday]:
                s["uyari"].append("bolum baslangicindan once: Roma rakamli 'I.' sahte soru olabilir")
    elif c + 1 < len(BOLUMLER) and sf > baslar[c + 1] + 1:
        s["uyari"].append("sayfa bir sonraki bolumun icinde: bolum gecisi kacmis olabilir")
    s["bolum"] = c
    onceki_no = no

# ------------------------------------------------------------ rapor
with open(CIKIS, "w", encoding="utf-8") as f:
    json.dump(sorular, f, ensure_ascii=False, indent=1)

print(f"{len(sorular)} soru | uyarili: {sum(1 for s in sorular if s['uyari'])} | atlanan varyant satiri: {varyant_satir}")
print(f"{'#':>3} {'toc':>4} {'ilk':>4} {'soru':>4} {'uyr':>3}  bolum  [eksik numaralar]")
for k, (tsf, ad, _) in enumerate(BOLUMLER):
    ss = [s for s in sorular if s["bolum"] == k]
    if not ss:
        print(f"{k:>3} {tsf:>4} {'-':>4} {0:>4} {'-':>3}  {ad}  <-- SORU YOK")
        continue
    nos = [s["no"] for s in ss]
    eksik = sorted(set(range(1, max(nos) + 1)) - set(nos))
    tekrar = sorted({x for x in nos if nos.count(x) > 1})
    ek = (f"  eksik={eksik}" if eksik else "") + (f"  tekrar={tekrar}" if tekrar else "")
    print(f"{k:>3} {tsf:>4} {ss[0]['sayfa']:>4} {len(ss):>4} {sum(1 for s in ss if s['uyari']):>3}  {ad}{ek}")
