#!/usr/bin/env python3
"""
Sorunun kitaptaki görüntüsü (kök + şekil/tablo + şıklar) — metin yerine kitaptan çözmek için (sorular.soru_kitap_gorsel).

Kullanim: python3 -I soru_goruntu.py <D> <konum.json> <cikti_dizini>
  konum.json: [{"anahtar": "<soru_id>", "bas": satir, "sik_son": satir, "ust_px": (isteğe bağlı) ilk parçanın üstü}, ...]
              (satir: yeni_baski satirlar indeksi; şekille başlayan soruda numara OCR'a girmeyebilir → ust_px)
Cikti: <cikti>/<anahtar>.webp (tam çözünürlük, gri, q88) + <cikti>/denetim.json
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
denetim = []
for k in json.load(open(KONUM, encoding="utf-8")):
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
