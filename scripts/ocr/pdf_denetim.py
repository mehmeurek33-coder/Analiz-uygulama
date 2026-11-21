#!/usr/bin/env python3
"""
PDF GIRIS DENETIMI — her yeni PDF'te, aktarimdan ONCE calistir (CLAUDE.md "PDF geldiginde").

  python3 -I pdf_denetim.py sayfa <pdf> <cikti_dizini>      # 1. asama: sayfa duzeyi
  python3 -I pdf_denetim.py yapi  <D> [<bolumler.json>]     # 2. asama: yapi.json (soru duzeyi)
  python3 -I pdf_denetim.py metin <girdi.json>              # 3. asama: kok/sik metni (soru-ekle JSON'u ya da yapi.json)

1. asama (OCR'dan once, ~1 dk / 100 sayfa):
  - pdfinfo: sayfa sayisi, olculer (farkli boyut / yatay sayfa = ters taranmis olabilir), uretici
  - metin katmani var mi (varsa OCR gereksiz)
  - kapak/ic kapak/icindekiler metni -> kaynak tahmini (TTS, Meditus, Vaka, Deneme, Sampiyonlarin Notu ...)
  - her sayfada kitap sayfa numarasi (ust VE alt baslik) -> PDF sayfasi ile kitap sayfasi arasindaki
    kaymanin degistigi yerler: kayma azalirsa EKSIK SAYFA, artarsa CIFT / fazladan sayfa
  - ayni gorunuslu iki sayfa (cift tarama), bos sayfa
  Cikti: <cikti>/sayfa_denetim.json + ozet. Eksik sayfa varsa kullanicidan o sayfalarin fotografini iste,
  ya da aktarimda o araliga dusen sorulari/aciklamalari isaretle.

2. asama (yapi.json cikinca, aktarimdan once):
  - bolum icinde soru numarasi bosluklari; bosluk sayfa sinirina denk geliyorsa "eksik sayfa" isaretli
  - aciklamasi eksik sayfa sinirini asan sorular (yanlis aciklama/cevap alma riski!)
  - cevapsiz, ayni numarali, sik sayisi 5 olmayan, cevap harfi sik disinda olan sorular
  Cikti: <D>/yapi_denetim.json + ozet. "riskli" listesindekileri goruntuyle kontrol etmeden ekleme.

3. asama (JSON hazir, eklemeden once): bozuk (+)/(-), OCR artiklari, bitisik kelimeler, kutu/aciklama sizintisi,
  asiri uzun sik, kesik kok, bozuk Romen siklari. Cikti: <girdi>_metin_denetim.json.
"""
import collections
import json
import os
import re
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from PIL import Image

KAYNAK_IPUCU = [
    ("Tüm TUS Soruları", r"T[ÜU]M\s*TUS\s*SORULARI"),
    ("Meditus", r"MED[İI]TUS|Tamam\w*\s*A[çc][ıi]klamal|\d{3,4}\s*G[üu]ncel\s*Soru"),
    ("Vaka Soruları", r"VAKA\s*(SORU|[ÇC]ÖZ)|VAKALARLA"),
    ("Şampiyonların Notu", r"[ŞS]AMP[İI]YONLARIN\s*NOTU"),
    ("Deneme", r"DENEME\s*(SINAVI|SINAVLARI)?|K[ÜU]RESEL\s*DENEME"),
    ("TUSDATA", r"TUS\s*-?\s*DATA"),
]
DERSLER = ["ANATOM", "F[İI]ZYOLOJ", "B[İI]YOK[İI]MYA", "M[İI]KROB[İI]YOLOJ", "PATOLOJ", "FARMAKOLOJ",
           "DAH[İI]L[İI]YE", "PED[İI]ATR", "GENEL\\s*CERRAH", "KADIN\\s*DO[ĞG]UM", "K[ÜU][ÇC][ÜU]K\\s*STAJ"]


def calistir(*a, **k):
    return subprocess.run(list(a), capture_output=True, text=True, **k).stdout


def ocr(png, psm="6"):
    return " ".join(calistir("tesseract", png, "-", "--psm", psm, "-l", "tur",
                             env={"OMP_THREAD_LIMIT": "1", "PATH": "/usr/bin:/bin"}).split())


def sayfa_incele(pdf, p):
    """Ust ve alt baslik metni, sayi adaylari, kucuk parmak izi, murekkep orani."""
    with tempfile.TemporaryDirectory() as t:
        subprocess.run(["pdftoppm", "-f", str(p), "-l", str(p), "-r", "200", "-gray", "-png", "-singlefile", pdf,
                        f"{t}/s"], check=True)
        im = Image.open(f"{t}/s.png").convert("L")
        a = np.asarray(im) < 140
        h, w = a.shape
        murekkep = float(a.mean())
        izi = np.asarray(im.resize((16, 16))).astype(int)
        parmak = "".join("1" if v > izi.mean() else "0" for v in izi.flatten())
        satir = a[:, int(w * 0.05):int(w * 0.95)].mean(axis=1) > 0.004
        sonuc = {"sayfa": p, "murekkep": round(murekkep, 4), "parmak": parmak, "en": w, "boy": h}
        for ad, sira in (("ust", range(h)), ("alt", range(h - 1, -1, -1))):
            ilk = next((y for y in sira if satir[y] and h * 0.005 < y < h * 0.995), None)
            if ilk is None:
                sonuc[ad] = ""
                continue
            y0, y1 = (ilk, ilk + int(h * 0.035)) if ad == "ust" else (ilk - int(h * 0.035), ilk + 1)
            im.crop((0, max(0, y0 - 8), w, min(h, y1 + 8))).resize((w * 4 // 3, (min(h, y1 + 8) - max(0, y0 - 8)) * 4 // 3)) \
                .save(f"{t}/{ad}.png")
            sonuc[ad] = ocr(f"{t}/{ad}.png")
        # ikinci deneme: "—— 26 ——" tarzi: alt/ust bantta uzun yatay cizginin bulundugu satirlar, cizgi silinip
        # ortadaki rakam okunur
        for ad in ("ust", "alt"):
            y_bas = 0 if ad == "ust" else int(h * 0.85)
            band = a[: int(h * 0.15)] if ad == "ust" else a[y_bas:]
            uzun = []
            for y in range(band.shape[0]):
                d = np.diff(np.concatenate(([0], band[y].astype(np.int8), [0])))
                kos = np.flatnonzero(d == -1) - np.flatnonzero(d == 1)
                if len(kos) and kos.max() > w * 0.12:
                    uzun.append(y)
            if not uzun:
                continue
            yc = uzun[-1] if ad == "alt" else uzun[0]
            y0, y1 = max(0, yc - int(h * 0.012)), min(band.shape[0], yc + int(h * 0.012))
            parca = band[y0:y1].copy()
            for y in range(parca.shape[0]):
                d = np.diff(np.concatenate(([0], parca[y].astype(np.int8), [0])))
                for b0, b1 in zip(np.flatnonzero(d == 1), np.flatnonzero(d == -1)):
                    if b1 - b0 > w * 0.02:
                        parca[y, b0:b1] = False
            kol = np.flatnonzero(parca.sum(axis=0) >= max(4, parca.shape[0] // 6))
            if not len(kol):
                continue
            x0, x1 = max(0, kol[0] - 10), min(w, kol[-1] + 10)
            if x1 - x0 > w * 0.5:   # rakam degil, metin
                continue
            Image.fromarray(np.where(parca[:, x0:x1], 0, 255).astype(np.uint8)).resize(((x1 - x0) * 2, parca.shape[0] * 2)) \
                .save(f"{t}/{ad}r.png")
            sonuc[ad] += " " + " ".join(calistir("tesseract", f"{t}/{ad}r.png", "-", "--psm", "7", "-c",
                                                 "tessedit_char_whitelist=0123456789",
                                                 env={"OMP_THREAD_LIMIT": "1", "PATH": "/usr/bin:/bin"}).split())
        sonuc["sayilar"] = sorted({int(x) for k in ("ust", "alt")
                                   for x in re.findall(r"(?<![\d.,/-])(\d{1,3})(?![\d.,/%-])", sonuc[k])})
        return sonuc


def kaymalar(sayfalar):
    """Her sayfada kitap numarasini secer (komsularla tutarli kayma), kaymanin degistigi yerleri doner."""
    aday = {s["sayfa"]: {s["sayfa"] - x for x in s["sayilar"] if -60 <= s["sayfa"] - x <= 60} for s in sayfalar}
    n = max(aday)
    secilen = {}
    for p in sorted(aday):
        komsu = collections.Counter(k for q in range(p - 6, p + 7) for k in aday.get(q, ()))
        uygun = [k for k in aday[p] if komsu[k] >= 2]
        if uygun:
            secilen[p] = max(uygun, key=lambda k: komsu[k])
    # tek sayfalik sapma (yanlis okunan bir sayi) kayma degisikligi sayilmaz: once/sonra komsusu ayni kaymadaysa at
    # tek sayfalik sapma ve tek sayfalik kayma bolutleri (yanlis okunan sayi) kayma degisikligi sayilmaz
    for _ in range(3):
        sirali = sorted(secilen)
        bolut, bas = [], 0
        for i in range(1, len(sirali) + 1):
            if i == len(sirali) or secilen[sirali[i]] != secilen[sirali[bas]]:
                bolut.append(sirali[bas:i])
                bas = i
        for b in bolut:
            if len(b) == 1 and len(bolut) > 1:
                del secilen[b[0]]
    olay = []
    onceki = None
    for p in sorted(secilen):
        k = secilen[p]
        if onceki and k != onceki[1]:
            fark = onceki[1] - k
            if fark > 0:
                olay.append({"tur": "eksik_sayfa", "pdf": [onceki[0], p], "kitap": [onceki[0] - onceki[1], p - k],
                             "eksik_kitap_sayfalari": list(range(onceki[0] - onceki[1] + 1, p - k)) or
                             f"{fark} sayfa (aradaki numarasiz sayfalarla)"})
            else:
                olay.append({"tur": "fazla_ya_da_cift_sayfa", "pdf": [onceki[0], p], "kitap": [onceki[0] - onceki[1], p - k],
                             "fazla": -fark})
        onceki = (p, k)
    return secilen, olay, n


def asama_sayfa(pdf, cikti):
    os.makedirs(cikti, exist_ok=True)
    bilgi = calistir("pdfinfo", pdf)
    sayfa_sayisi = int(re.search(r"Pages:\s+(\d+)", bilgi).group(1))
    metin_katmani = len(calistir("pdftotext", "-f", "3", "-l", "12", pdf, "-").strip()) > 500
    with tempfile.TemporaryDirectory() as t:
        kapak = ""
        for p in range(1, min(6, sayfa_sayisi) + 1):
            subprocess.run(["pdftoppm", "-f", str(p), "-l", str(p), "-r", "100", "-gray", "-png", "-singlefile", pdf,
                            f"{t}/k"], check=True)
            kapak += " " + ocr(f"{t}/k.png", "3")
    with ThreadPoolExecutor(8) as h:
        sayfalar = list(h.map(lambda p: sayfa_incele(pdf, p), range(1, sayfa_sayisi + 1)))
    baslik_metni = " ".join(s["ust"] + " " + s["alt"] for s in sayfalar[:60])
    kaynak = [ad for ad, r in KAYNAK_IPUCU if re.search(r, kapak + " " + baslik_metni, re.I)]
    ders = collections.Counter(d for s in sayfalar for d in DERSLER if re.search(d, s["ust"] + " " + s["alt"], re.I))
    secilen, olaylar, _ = kaymalar(sayfalar)
    # cift tarama: ayni parmak izi ardisik/yakin sayfalarda
    cift = []
    for i in range(len(sayfalar)):
        for j in range(i + 1, min(i + 4, len(sayfalar))):
            a, b = sayfalar[i], sayfalar[j]
            if a["murekkep"] > 0.01 and sum(x != y for x, y in zip(a["parmak"], b["parmak"])) <= 8 and \
                    abs(a["murekkep"] - b["murekkep"]) < 0.002:
                cift.append([a["sayfa"], b["sayfa"]])
    bos = [s["sayfa"] for s in sayfalar if s["murekkep"] < 0.002]
    boyut = collections.Counter((s["en"], s["boy"]) for s in sayfalar)
    farkli = [s["sayfa"] for s in sayfalar if (s["en"], s["boy"]) != boyut.most_common(1)[0][0]]
    yatay = [s["sayfa"] for s in sayfalar if s["en"] > s["boy"]]
    rapor = {
        "pdf": os.path.basename(pdf), "sayfa_sayisi": sayfa_sayisi, "metin_katmani": metin_katmani,
        "kaynak_tahmini": kaynak, "ders_tahmini": [d for d, _ in ders.most_common(3)],
        "numarasi_okunan_sayfa": len(secilen), "sayfa_olaylari": olaylar,
        "cift_tarama_suphesi": cift, "bos_sayfa": bos, "farkli_boyutlu_sayfa": farkli, "yatay_sayfa": yatay,
        "kapak_metni": kapak[:600],
        "kayma": {str(p): k for p, k in secilen.items()},
    }
    json.dump(rapor, open(f"{cikti}/sayfa_denetim.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    ozet = {k: v for k, v in rapor.items() if k not in ("kayma", "kapak_metni")}
    print(json.dumps(ozet, ensure_ascii=False, indent=1))


def asama_yapi(D, bolumler=None):
    sys.argv = [sys.argv[0], D]
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import yeni_baski as yb  # noqa: E402
    Y = json.load(open(f"{D}/yapi.json", encoding="utf-8"))
    sd = f"{D}/sayfa_denetim.json"
    eksik_sinir = []
    if os.path.exists(sd):
        for o in json.load(open(sd, encoding="utf-8"))["sayfa_olaylari"]:
            if o["tur"] == "eksik_sayfa":
                eksik_sinir.append(tuple(o["pdf"]))
    sorun = collections.defaultdict(list)
    for b in sorted({y["bolum"] for y in Y if y["bolum"] is not None}):
        L = sorted([y for y in Y if y["bolum"] == b], key=lambda y: y["bas"])
        nolar = collections.Counter(y["no"] for y in L)
        for no, c in nolar.items():
            if c > 1:
                sorun["ayni_numara"].append([b, no])
        for a, c in zip(L, L[1:]):
            if c["no"] - a["no"] > 1:
                sa, sc = yb.satirlar[a["bas"]][0], yb.satirlar[c["bas"]][0]
                kayit = {"bolum": b, "arada": list(range(a["no"] + 1, c["no"])), "pdf": [sa, sc]}
                if any(sa <= x < y <= sc for x, y in eksik_sinir) or (not eksik_sinir and sc - sa == 1 and c["no"] - a["no"] > 3):
                    sorun["eksik_sayfadaki_sorular"].append(kayit)
                else:
                    sorun["numara_boslugu"].append(kayit)
    for y in Y:
        anahtar = y.get("eski_id") or f"{y['bolum']}-{y['no']}"
        if not y.get("cevap"):
            sorun["cevapsiz"].append(anahtar)
        if y.get("bitis"):
            s1, s2 = yb.satirlar[y["bas"]][0], yb.satirlar[y["bitis"]][0]
            for x, z in eksik_sinir:
                if s1 <= x and s2 >= z:
                    sorun["riskli_aciklama_eksik_sayfayi_asiyor"].append({"soru": anahtar, "pdf": [s1, s2],
                                                                          "not": "cevap ve aciklama baska soruya ait olabilir"})
            if s2 - s1 > 2:
                sorun["cok_uzun_aciklama"].append({"soru": anahtar, "pdf": [s1, s2]})
    json.dump(sorun, open(f"{D}/yapi_denetim.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps({k: (len(v), v[:6]) for k, v in sorun.items()}, ensure_ascii=False, indent=1))


# --- metin denetimi: aktarımdan önce kök/şık metnindeki bilinen OCR bozulmaları ---------------------------
# Hepsi gerçek veride görüldü (docs/HATALAR.md B13-B16). Rapor eder; düzeltme görüntüyle yapılır.
_ISARET_BOZUK = re.compile(r"\((?:4|\*|1|t|9|5|<|#|#9)\)")  # (+) → (4)(*)(1)(t), (-) → (9)(5)(<)
_ARTIK = re.compile(r"(©|€|£|\s\|\s|^\|\s|\bOo\b|\boo\b|\bo[A-ZÇĞİÖŞÜ]|\(o\s|H,N,|\bIl\b|\b111\b|\bLU\b"
                    r"|(?<![\d.,])9[0256]\d{1,3}\b|\d\s?[“”*9]\s?C\b|/mm[9“”]|\b8OS\b|\bCOJ|\d\s?um\b|\b\d{1,2}u\b)")
_ROMEN_SIK = re.compile(r"^(Yalnız\s+)?(I{1,3}|IV|VI{0,3})(\s*(,|ve)\s*(I{1,3}|IV|VI{0,3}))*\.?$")
_SON_OK = re.compile(r"(\?|\)|:|\.)\s*$")


def metin_sorunlari(kok, siklar):
    """Bir sorunun kök ve şıklarındaki şüpheli yerler: [(alan, tür, parça), ...]"""
    out = []
    alanlar = [("kok", kok or "")] + [(k, v or "") for k, v in (siklar or {}).items()]
    for alan, t in alanlar:
        for m in _ISARET_BOZUK.finditer(t):
            out.append((alan, "isaret_(+/-)", t[max(0, m.start() - 25):m.end()]))
        for m in _ARTIK.finditer(t):
            out.append((alan, "ocr_artigi", t[max(0, m.start() - 20):m.end() + 15]))
        for w in re.findall(r"\S+", t):
            w2 = re.sub(r"[^\wçğıöşüÇĞİÖŞÜ]", "", w)
            if len(w2) >= 22 and not re.search(r"[A-Z]{2}|\d|-", w):
                out.append((alan, "bitisik_kelime", w))
        if re.search(r"sorulmaya uygun|Doğru cevap|şöyle de sorulabilir", t, re.I):
            out.append((alan, "kutu_sizmasi", t[-60:]))
        if alan != "kok" and len(t) > 160:
            out.append((alan, "uzun_sik_aciklama_sizmis_olabilir", t[:60] + "…"))
    if not _SON_OK.search(kok or "") or re.search(r"\s[a-zçğıöşü]\s*\(", kok or ""):
        out.append(("kok", "kok_kesik_olabilir", (kok or "")[-60:]))
    vs = list((siklar or {}).values())
    if sum(bool(_ROMEN_SIK.match(v.strip())) for v in vs) >= 2:
        for k, v in siklar.items():
            if not _ROMEN_SIK.match(v.strip()):
                out.append((k, "romen_sik", v))
    if len({v.strip() for v in vs}) < len(vs):
        out.append(("siklar", "ayni_iki_sik", " | ".join(vs)))
    if len(vs) != 5 or any(len(v.strip()) < 1 for v in vs):
        out.append(("siklar", "sik_sayisi_ya_da_bos", len(vs)))
    return out


def asama_metin(girdi):
    """girdi: soru-ekle JSON'u ({sorular:[{metin, secenekler}]}) ya da yapi.json ([{kok, secenekler}])."""
    veri = json.load(open(girdi, encoding="utf-8"))
    sorular = veri["sorular"] if isinstance(veri, dict) else veri
    sayac = collections.Counter()
    rapor = []
    for i, s in enumerate(sorular):
        anahtar = s.get("eski_id") or s.get("numara") or s.get("no") or i
        for alan, tur, parca in metin_sorunlari(s.get("metin") or s.get("kok"), s.get("secenekler")):
            sayac[tur] += 1
            rapor.append({"soru": anahtar, "alan": alan, "tur": tur, "parca": parca})
    # Harf karışıklığı: bir kez geçen kelime, sık geçen bir kelimeden yalnızca OCR'ın karıştırdığı harflerle
    # (l/t/i/f, e/c, r/n, o/0 ...) ayrılıyorsa ("Btastomyces" ← "Blastomyces"). Sözlük girdinin kendisi
    # (+ varsa açıklamalar); büyük kitapta yeterince güçlü, küçük girdide daha az bulur.
    kar = [set("lti1ıj|!f"), set("ec"), set("rn"), set("o0ö"), set("uü"), set("gğ"), set("sş5$"), set("cç"), set("ıi")]
    kucuk = lambda w: w.replace("I", "ı").replace("İ", "i").lower()  # noqa: E731
    tok = r"[A-Za-zçğıöşüÇĞİÖŞÜâîû]+"
    say = collections.Counter()
    for s in sorular:
        for t in [s.get("metin") or s.get("kok") or "", s.get("aciklama") or ""] + list((s.get("secenekler") or {}).values()):
            say.update(kucuk(w) for w in re.findall(tok, t))
    sik = [w for w, c in say.items() if c >= 4 and len(w) >= 4]
    for i, s in enumerate(sorular):
        anahtar = s.get("eski_id") or s.get("numara") or s.get("no") or i
        for t in [s.get("metin") or s.get("kok") or ""] + list((s.get("secenekler") or {}).values()):
            for w in re.findall(tok, t):
                lw = kucuk(w)
                if len(lw) < 4 or say[lw] > 1:
                    continue
                for v in sik:
                    if len(v) == len(lw):
                        fark = [(a, b) for a, b in zip(lw, v) if a != b]
                        if 0 < len(fark) <= 2 and all(any(a in k and b in k for k in kar) for a, b in fark):
                            sayac["harf_karisikligi"] += 1
                            rapor.append({"soru": anahtar, "alan": "metin", "tur": "harf_karisikligi", "parca": f"{w} → {v}?"})
                            break
    cikti = os.path.splitext(girdi)[0] + "_metin_denetim.json"
    json.dump(rapor, open(cikti, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(dict(sayac), "→", cikti)


if __name__ == "__main__":
    if sys.argv[1] == "sayfa":
        asama_sayfa(sys.argv[2], sys.argv[3])
    elif sys.argv[1] == "yapi":
        asama_yapi(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
    elif sys.argv[1] == "metin":
        asama_metin(sys.argv[2])
