#!/usr/bin/env python3
"""
Sorunun kitaptaki görüntüsü (kök + şekil/tablo + şıklar) — metin yerine kitaptan çözmek için (sorular.soru_kitap_gorsel).

Kullanim: python3 -I soru_goruntu.py <D> <konum.json> <cikti_dizini> [--aciklama]
  --aciklama: sorunun yerine açıklamasının kitaptaki görüntüsü (son şıktan "Doğru cevap" satırına kadar; konumda
    "bitis" = cevap satırı). Telif kutusu ("ASLA HELAL ETMİYORUZ" … "TUSDATA"), sayfa üst bilgisi ("TÜM TUS SORULARI"),
    bölüm başlık bandı ve "şöyle de sorulabilirdi" kutusu atlanır; kalan satırlar sütun sütun, araya giren atlanmış
    satırda bölünerek kesilir. Denetim: içinde şık satırı / sınav etiketi / "Doğru cevap" kalan parça (başka soru sızmış).
  konum.json: [{"anahtar": "<soru_id>", "bas": satir, "sik_son": satir, "ust_px": (isteğe bağlı) ilk parçanın üstü}, ...]
              (satir: yeni_baski satirlar indeksi; şekille başlayan soruda numara OCR'a girmeyebilir → ust_px)
Cikti: <cikti>/<anahtar>.webp (tam çözünürlük, gri, q88) + <cikti>/denetim.json
  (--aciklama: <anahtar>-k1.webp, -k2.webp … her parça ayrı; denetim.json'da "dosyalar": [{ad, w, h}])
  Soru sütun/sayfa sonunda bölünmüşse parçalar alt alta birleştirilir (sayfa başlığı/altlığı arada kalmaz).
Denetim (denetim.json; "sorun" boş olmayanlara görüntüyle bak):
  ust_numara_yok    ilk satır soru numarası değil (şekille başlayan soru: numara/şekil üstü dışarıda kalabilir → ust_px)
  son_sik_E_degil   son satırlarda E şıkkı yok (şık eksik ya da sınır yanlış)
  cevap_satiri_icinde  "Doğru cevap" kırpıntıya girmiş (cevabı ele verir)
  kenar_kesik       kesim yazının içinden geçiyor (üst/alt kenarda mürekkep)
  alt_satir_yakin   son satırdan hemen sonra (<25 px) aynı sütunda girintili satır var ama şıkka katılmadı — şık kesik olabilir
  bilgi: ...        son şık alt satıra taştığı için uzatıldı (küçük harf ya da şık hizasında girinti; sorun değil)
  N_parca           soru sütun/sayfa sonunda bölünmüş, parçalar birleştirildi (hiza kontrolü)
"""
import json
import os
import re
import sys

import numpy as np
from PIL import Image

D, KONUM, CIKIS = sys.argv[1], sys.argv[2], sys.argv[3]
ACIKLAMA = "--aciklama" in sys.argv
sys.argv = [sys.argv[0], D]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import yeni_baski as yb  # noqa: E402

PAY_UST, PAY_ALT, ARA = 14, 16, 18
ACIK = re.compile(r"^[a-zçğıöşü(]")


_resim = {}


def resim(sayfa, sut):
    if (sayfa, sut) not in _resim:
        _resim[(sayfa, sut)] = np.asarray(Image.open(f"{D}/ocr/png/p{sayfa:03d}-{sut}.png").convert("L"))
    return _resim[(sayfa, sut)]


def sol(satir):
    """Satırın en soldaki mürekkep sütunu (sütun çerçevesi/sekme hariç)."""
    dizi = resim(satir[0], satir[1])
    bant = dizi[max(0, satir[2]):satir[3], int(dizi.shape[1] * 0.03): int(dizi.shape[1] * 0.9)]
    sutun = np.where((bant < 140).sum(axis=0) >= 2)[0]
    return int(sutun[0]) if len(sutun) else 10**6


def devam_mi(son_satir, sonraki):
    """Son şıkkın alt satıra taşan devamı mı? Aynı sütun, hemen altta ve küçük harfle başlıyor ya da
    şık metninin hizasında girintili (açıklama sütun kenarından başlar, şık devamı 'E)' harfinin sağından)."""
    if sonraki[:2] != son_satir[:2] or sonraki[2] - son_satir[3] > 30 or yb.CEVAP.search(sonraki[4]):
        return False
    if ACIK.match(sonraki[4].strip()):
        return True
    return sol(sonraki) > sol(son_satir) + 25


def blok_sutunlari(koyu):
    """Dikey yapı sütunları (sekme bloğu, çerçeve): satırların %40'ından fazlasında koyu; aradaki ≤40 px
    boşluklar (bloğun içindeki beyaz harfler) da bloğa katılır, kenarlar 8 px genişletilir."""
    m = koyu.mean(axis=0) > 0.4
    x = np.where(m)[0]
    for a, b in zip(x[:-1], x[1:]):
        if 1 < b - a <= 40:
            m[a:b] = True
    for k in np.where(m)[0]:
        m[max(0, k - 8): k + 9] = True
    return m


def kisa_kosu(satir, en_uzun=60):
    """Satırdaki mürekkebin harf kalınlığındaki (kısa) koşulardaki toplamı; uzun düz koşular (sekme bloğu, yatay
    çizgi) yazı sayılmaz."""
    toplam, n = 0, 0
    for v in list(satir) + [False]:
        if v:
            n += 1
        else:
            if 0 < n <= en_uzun:
                toplam += n
            n = 0
    return toplam


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
TELIF_BAS = re.compile(r"HELAL\s*ET", re.I)
TELIF_SON = re.compile(r"^\W*TUS-?DATA\W*$")
UST_BILGI = re.compile(r"TÜM\s*TUS\s*SORULARI|^\W*\d{1,3}\W*$")
SIK = re.compile(r"^[\s\W]{0,3}[A-E][)\]]\s")
ETIKET = re.compile(r"(İlkbahar|Sonbahar)\s*[-–]?\s*\d{2,4}")


def baslik_bandi(s):
    """Sütun üstündeki bölüm başlık bandı: yalnız büyük harf, kısa, sütunun ilk ~400 pikselinde."""
    t = s[4].strip()
    harf = re.sub(r"[^A-Za-zÇĞİÖŞÜçğıöşü]", "", t)
    return s[2] < 400 and len(harf) >= 5 and harf == harf.upper() and len(t.split()) <= 4


def aciklama_satirlari(bas, bitis):
    """Açıklamada tutulacak satır dizileri (sütun değişince ya da atlanan satırda bölünür)."""
    diziler, cur, telif = [], [], False
    for i in range(bas, bitis):
        s = S[i]
        if TELIF_BAS.search(s[4]):
            telif = True
        atla = telif or s[5] or UST_BILGI.search(s[4]) or baslik_bandi(s)
        if telif and TELIF_SON.match(s[4].strip()):
            telif = False
        if atla or (cur and S[cur[-1]][:2] != s[:2]):
            if cur:
                diziler.append(cur)
            cur = []
        if not atla:
            cur.append(i)
    if cur:
        diziler.append(cur)
    return diziler


def bos_kosu(dizi, y0, y1, yon, uzun=40):
    """y0'dan yon yönünde ilk >= uzun satırlık boş koşunun başı; bulunmazsa y1."""
    n = 0
    for y in range(y0, y1, yon):
        if not 0 <= y < dizi.shape[0]:
            return max(0, min(dizi.shape[0] - 1, y))
        if int((dizi[y] < 140).sum()) <= 2:
            n += 1
            if n >= uzun:
                return y - yon * (uzun - 1)
        else:
            n = 0
    return y1


def en_uzun_koyu(koyu):
    """Her piksel sütunu için en uzun kesintisiz koyu koşu (satır)."""
    h = koyu.shape[0]
    pad = np.zeros((1, koyu.shape[1]), dtype=np.int8)
    d = np.diff(np.vstack([pad, koyu.astype(np.int8), pad]), axis=0)
    sonuc = np.zeros(koyu.shape[1], dtype=int)
    for x in np.where(koyu.any(axis=0))[0]:
        bas = np.where(d[:, x] == 1)[0]
        son = np.where(d[:, x] == -1)[0]
        sonuc[x] = int((son - bas).max()) if len(bas) else 0
    return sonuc


def kenar_bandi(dizi, y0, y1, sag):
    """Parçanın sütun aralığına dayanan (iki sütuna yayılan tablo/şekil) satır bandı; yoksa None.
    Kenarda mürekkepli satırların ≤15 px boşlukla süren en uzun koşusu ≥60 px olmalı (kenara değen tek tük harf sayılmaz)."""
    kenar = dizi[y0:y1, -4:] if sag else dizi[y0:y1, :4]
    satir = np.where((kenar < 140).sum(axis=1) > 0)[0]
    if len(satir) == 0:
        return None
    en, bas, onceki = None, satir[0], satir[0]
    for r in list(satir[1:]) + [10**9]:
        if r - onceki > 15:
            if en is None or onceki - bas > en[1] - en[0]:
                en = (bas, onceki)
            bas = r
        onceki = r
    if en[1] - en[0] < 60:
        return None
    return y0 + int(en[0]), y0 + int(en[1]) + 1


def aciklama_kes(k):
    y = k["sik_son"] + 1
    while y < k["bitis"] and devam_mi(S[y - 1], S[y]):  # son şıkkın taşan satırı soruya ait
        y += 1
    parcalar, sorun = [], []  # (sayfa, sut, ust, alt)
    for dz in aciklama_satirlari(y, k["bitis"]):
        sayfa, sut = S[dz[0]][0], S[dz[0]][1]
        dizi = resim(sayfa, sut)
        u = min(S[i][2] for i in dz)
        a = max(S[i][3] for i in dz)
        # üst: önceki satırın (soru şıkkı, atlanan satır) hemen altından; arada şekil varsa o da girer
        onceki = [S[j][3] for j in range(max(0, dz[0] - 3), dz[0]) if tuple(S[j][:2]) == (sayfa, sut) and S[j][3] <= u + 5]
        if onceki:
            ust = bos_satir(dizi, max(onceki) + 2, u, 1)
        else:
            ust = bos_kosu(dizi, u, 0, -1)
        # alt: sonraki satırın (cevap, atlanan satır) hemen üstüne; sütun sonuysa uzun boşluğa kadar
        sonraki = [S[j][2] for j in range(dz[-1] + 1, min(dz[-1] + 4, len(S))) if tuple(S[j][:2]) == (sayfa, sut) and S[j][2] >= a - 5]
        if sonraki:
            alt = bos_satir(dizi, min(sonraki) - 2, a, -1) + 1
        else:
            alt = bos_kosu(dizi, a, dizi.shape[0], 1) + 1
        parcalar.append([sayfa, sut, max(0, ust), min(dizi.shape[0], max(alt, a))])
        for i in dz:
            if SIK.match(S[i][4]) or ETIKET.search(S[i][4]) or yb.CEVAP.search(S[i][4]):
                sorun.append("baska_soru_izi: " + S[i][4][:40])
    # iki sütuna yayılan tablo/şekil: sol parçada sağ kenara dayanan bant -> o bant L+R yan yana, sağ parçadan çıkar
    cikti = []
    genis = []
    for sayfa, sut, ust, alt in parcalar:
        if sut == "L":
            bant = kenar_bandi(resim(sayfa, "L"), ust, alt, True)
            if bant:
                b0 = bos_satir(resim(sayfa, "L"), bant[0], ust, -1)
                b1 = bos_satir(resim(sayfa, "L"), bant[1], alt, 1) + 1
                genis.append((sayfa, b0, b1))
                if b0 - ust > 20:
                    cikti.append(("tek", sayfa, "L", ust, b0))
                cikti.append(("genis", sayfa, None, b0, b1))
                if alt - b1 > 20:
                    cikti.append(("tek", sayfa, "L", b1, alt))
                sorun.append("bilgi: iki sütuna yayılan bant birleştirildi")
                continue
        cikti.append(("tek", sayfa, sut, ust, alt))
    # sağ sütun parçalarından genis bantları çıkar
    son = []
    for tur, sayfa, sut, ust, alt in cikti:
        if tur == "tek" and sut == "R":
            for gs, b0, b1 in genis:
                if gs == sayfa and b0 < alt and b1 > ust:
                    if b0 - ust > 20:
                        son.append(("tek", sayfa, "R", ust, b0))
                    ust = max(ust, b1)
            if alt - ust > 20:
                son.append(("tek", sayfa, "R", ust, alt))
        else:
            son.append((tur, sayfa, sut, ust, alt))
    resimler = []
    for tur, sayfa, sut, ust, alt in son:
        if tur == "genis":
            L, R = resim(sayfa, "L"), resim(sayfa, "R")
            h = alt - ust
            c = Image.new("L", (L.shape[1] + R.shape[1], h), 255)
            c.paste(Image.fromarray(L[ust:alt]), (0, 0))
            c.paste(Image.fromarray(R[ust:alt]), (L.shape[1], 0))
            resimler.append(c)
        else:
            d = resim(sayfa, sut)[ust:alt].copy()
            # kenar sekmesini ("Temel Mikrobiyoloji") beyazla
            koyu = d < 70  # sekme düz siyah; gri tablo zemini sayılmasın
            yog = en_uzun_koyu(koyu) >= 150  # sekme: sütunda ≥150 px kesintisiz koyu (yazı/çizgi değil)
            w = len(yog)
            for bas, yon in ((0, 1), (w - 1, -1)):
                x = bas
                while 0 <= x < w and abs(x - bas) < 0.25 * w and not yog[x]:
                    x += yon
                b = x
                while 0 <= x < w and yog[x]:
                    x += yon
                if 25 <= abs(x - b) <= 0.2 * w:
                    lo, hi = sorted((b, x))
                    # başlık bandı değil, sekme: bloğun dolu olduğu satırlarda bloğun iç yanı (sayfa içine doğru) boş
                    satir = koyu[:, lo:hi].mean(axis=1) > 0.8
                    ic = koyu[satir, hi + 10: hi + 80] if yon == 1 else koyu[satir, max(0, lo - 80): max(0, lo - 10)]
                    if satir.sum() and ic.size and ic.mean() < 0.3:
                        d[:, max(0, lo - 6):hi + 7] = 255
            resimler.append(Image.fromarray(d))
    return resimler, sorun


denetim = []
for k in json.load(open(KONUM, encoding="utf-8")):
    if ACIKLAMA:
        if not k.get("bitis"):
            denetim.append({"anahtar": k["anahtar"], "parca": 0, "sorun": ["bitis_yok"]})
            continue
        parcalar, sorun = aciklama_kes(k)
        if not parcalar:
            denetim.append({"anahtar": k["anahtar"], "parca": 0, "sorun": ["aciklama_yok"]})
            continue
        # her parça ayrı görüntü (sütun genişliğinde; iki sütuna yayılan bant iki kat genişlikte): uygulama
        # alt alta tam genişlikte gösterir, böylece yazı boyu parçadan parçaya değişmez
        dosyalar = []
        for n, p in enumerate(parcalar, 1):
            ad = f"{k['anahtar']}-k{n}.webp"
            p.save(f"{CIKIS}/{ad}", quality=88, method=6)
            dosyalar.append({"ad": ad, "w": p.width, "h": p.height})
        denetim.append({"anahtar": k["anahtar"], "parca": len(parcalar), "dosyalar": dosyalar, "sorun": sorun})
        continue
    bas, son = k["bas"], k["sik_son"]
    # son şık alt satıra taşmış (küçük harfle ya da şık hizasında girintili başlayan satır şıkka aittir)
    sik_son_ilk = son
    while son + 1 < len(S) and devam_mi(S[son], S[son + 1]):
        son += 1
    gruplar = {}
    for i in range(bas, son + 1):
        s = S[i]
        if s[5]:  # varyant kutusu satiri
            continue
        g = gruplar.setdefault((s[0], s[1]), [10**9, 0])
        g[0], g[1] = min(g[0], s[2]), max(g[1], s[3])
    parcalar, kenar, yakinlar = [], [], []
    for (sayfa, sut), (u, a) in gruplar.items():
        dizi = resim(sayfa, sut)
        im = Image.fromarray(dizi)
        # kesim çizgisi satır aralığındaki boş piksel satırından: sonraki satır (cevap/açıklama) taşmasın,
        # kendi satırımız kesilmesin (OCR kutuları üst üste binebiliyor)
        sonraki = [S[j][2] for j in range(son + 1, min(son + 3, len(S))) if tuple(S[j][:2]) == (sayfa, sut)]
        sinir = min([a + PAY_ALT + 20] + [t + 12 for t in sonraki])
        alt = bos_satir(dizi, a - 4, sinir, 1) + 1  # boş satır dahil, ötesi değil
        onceki = [S[j][3] for j in range(max(0, bas - 2), bas) if tuple(S[j][:2]) == (sayfa, sut)]
        usinir = max([u - PAY_UST - 20] + [b - 12 for b in onceki])
        ust = bos_satir(dizi, u + 4, usinir, -1)  # boş satırdan başla (üstteki satırın ucu girmesin)
        if k.get("ust_px") is not None and not parcalar:  # OCR'ın okumadığı numara/şekil üstü (elle)
            ust = k["ust_px"]
        parca = im.crop((0, max(0, ust), im.width, min(im.height, alt)))
        # kesim yazının içinden geçiyorsa (ilk/son piksel satırında mürekkep) işaretle
        pd = np.asarray(parca)
        # (dikey yapılar sayılmasın: sütun çerçevesi, kenar sekmesi ("Temel Mikrobiyoloji"), sayfa kenarı = kırpıntının
        # %60'ından fazla satırında mürekkepli piksel sütunları; kalan satırın %1'inden çok mürekkep = kesik yazı)
        koyu = pd < 140
        dikey = blok_sutunlari(koyu)
        esik = pd.shape[1] * 0.01
        kenar_kesik = kisa_kosu(koyu[0] & ~dikey) > esik or kisa_kosu(koyu[-1] & ~dikey) > esik  # kesim satırları boş olmalı
        # sütunun son şıkkından hemen sonra yakın bir satır daha var (büyük harfle başlayan taşma ya da cevap/açıklama
        # bitişik): şık kesik ya da fazlalık olabilir
        yakin = [S[j] for j in range(son + 1, min(son + 2, len(S)))
                 if tuple(S[j][:2]) == (sayfa, sut) and S[j][2] - a < 25 and sol(S[j]) > sol(S[son]) + 10]
        parcalar.append(parca)
        kenar.append(kenar_kesik)
        yakinlar.extend(x[4][:40] for x in yakin)
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
    if any(kenar):
        sorun.append("kenar_kesik")
    if yakinlar:
        sorun.append("alt_satir_yakin: " + " | ".join(yakinlar))
    if son > sik_son_ilk:
        sorun.append(f"bilgi: son şık {son - sik_son_ilk} satır uzatıldı")
    if len(parcalar) > 1:
        sorun.append(f"{len(parcalar)}_parca")
    denetim.append({"anahtar": k["anahtar"], "parca": len(parcalar), "boyut": [w, h], "sorun": sorun})
json.dump(denetim, open(f"{CIKIS}/denetim.json", "w"), ensure_ascii=False, indent=0)
print(json.dumps({"soru": len(denetim), "sorunlu": [d for d in denetim if d["sorun"]]}, ensure_ascii=False))
