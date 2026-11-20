#!/usr/bin/env python3
"""
Bolum bazli inceleme ve aktarim dosyasi uretimi.

  goster <taslak.json> <bolum>                 -> taslagi ve okunacak PDF sayfalarini yazdir
  uret   <taslak.json> <bolum> <duzeltme.json> <cikis.json>
                                               -> duzeltmeleri uygula, soru-ekle.ts girdisi uret

Duzeltme dosyasi (soru numarasina gore; hepsi istege bagli):
  {
    "_alt_konu": "Prionlar",                  # bolumdeki tum sorular icin varsayilan alt konu
    "3":  {"kok": "..."},                     # kok metnini degistir
    "5":  {"secenekler": {"B": "..."}},       # yalnizca verilen siklari degistir
    "7":  {"cevap": "D", "alt_konu": "..."},
    "9":  {"sil": true},                      # sahte/okunamayan soruyu cikar
    "13": {"kok": "...", "secenekler": {...}, "cevap": "B", "sayfa": 5}   # taslakta olmayan soru
  }
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bolumler import BOLUMLER, SON_SAYFA  # noqa: E402



def tekil(taslak, k):
    """Bolumun sorulari, numaraya gore. Ayni numara tekrar ediyorsa isaretlenir (gozle secilecek)."""
    ss, sayac = {}, {}
    for s in taslak:
        if s["bolum"] == k:
            sayac[s["no"]] = sayac.get(s["no"], 0) + 1
            ss.setdefault(s["no"], dict(s, uyari=list(s["uyari"])))
    for no, adet in sayac.items():
        if adet > 1:
            ss[no]["uyari"].append(f"numara {adet} kez cikti: dogru soru secilmeli")
    return ss


def pdf_sayfasi(kitap):
    # Kitaba özgü: kitap sayfası -> (PDF parçası, PDF sayfası). TTS Mikrobiyoloji iki parça
    # halinde geldi (ilk 6 sayfa ön kısım, part-2 kitap sayfası 224'ten başlar). Yeni kitapta düzenle.
    return ("part-1", kitap + 6) if kitap <= 223 else ("part-2", kitap - 223)


def sayfa_araligi(k):
    bas = BOLUMLER[k][0]
    son = BOLUMLER[k + 1][0] if k + 1 < len(BOLUMLER) else SON_SAYFA
    return bas, son


def goster(taslak, k):
    bas, son = sayfa_araligi(k)
    ss = [s for s in taslak if s["bolum"] == k]
    print(f"### {k:02d} {BOLUMLER[k][1]}  ->  konu: {BOLUMLER[k][2]}")
    print(f"kitap s.{bas}-{son}", end="  |  PDF: ")
    parcalar = {}
    for sf in range(bas, son + 1):
        dosya, p = pdf_sayfasi(sf)
        parcalar.setdefault(dosya, []).append(p)
    print(", ".join(f"{d} {min(p)}-{max(p)}" for d, p in parcalar.items()))
    for s in ss:
        u = f"  !! {'; '.join(s['uyari'])}" if s["uyari"] else ""
        print(f"\n#{s['no']} (s.{s['sayfa']}) {s['kok']}{u}")
        for h, t in s["secenekler"].items():
            print(f"  {h}) {t}")
        print(f"  => {s['cevap']}")


def uret(taslak, k, duz, cikis):
    bas, son = sayfa_araligi(k)
    ss = tekil(taslak, k)
    varsayilan_alt = duz.get("_alt_konu")
    kontrolsuz = [no for no, s in ss.items() if s.get("uyari") and str(no) not in duz]
    for no in kontrolsuz:
        ss.pop(no)

    for anahtar, d in duz.items():
        if anahtar.startswith("_"):
            continue
        # "15b": kitapta ayni numarayla basilmis ikinci soru (numarasiz eklenir, 15'ten sonra siralanir)
        no = int(anahtar[:-1]) + 0.5 if anahtar.endswith("b") else int(anahtar)
        if d.get("sil"):
            ss.pop(no, None)
            continue
        s = ss.get(no) or {"no": no, "sayfa": d.get("sayfa", bas), "kok": "", "secenekler": {}, "cevap": None}
        if "kok" in d:
            s["kok"] = d["kok"]
        if "secenekler" in d:
            s["secenekler"] = {**s["secenekler"], **d["secenekler"]}
        if "cevap" in d:
            s["cevap"] = d["cevap"]
        if "alt_konu" in d:
            s["alt_konu"] = d["alt_konu"]
        ss[no] = s

    sorular = []
    for no in sorted(ss):
        s = ss[no]
        sorular.append({
            "numara": no if isinstance(no, int) else None,
            # satir sonlari korunur (Roma rakamli onculler icin), satir ici bosluklar sadelestirilir
            "metin": "\n".join(re.sub(r"[ \t]+", " ", x).strip() for x in s["kok"].split("\n")).strip(),
            "secenekler": s["secenekler"],
            "dogru_cevap": s["cevap"],
            "ders": "Mikrobiyoloji",
            "konu": BOLUMLER[k][2],
            "alt_konu": s.get("alt_konu") or varsayilan_alt,
        })

    nos = sorted(x for x in ss if isinstance(x, int))
    eksik = sorted(set(range(1, max(nos) + 1)) - set(nos)) if nos else []
    girdi = {
        "ad": f"TTS Mikrobiyoloji · {k + 1:02d} {BOLUMLER[k][1]}",
        "sayfa_sayisi": son - bas + 1,
        "sorular": sorular,
    }
    with open(cikis, "w", encoding="utf-8") as f:
        json.dump(girdi, f, ensure_ascii=False, indent=1)
    print(f"{len(sorular)} soru -> {cikis}" + (f"  (eksik numara: {eksik})" if eksik else "")
          + (f"  !! KONTROL EDILMEMIS ISARETLI SORU DISARIDA: {kontrolsuz}" if kontrolsuz else ""))


def kontrol(taslak, k):
    bas, son = sayfa_araligi(k)
    ss = tekil(taslak, k)
    nos = set(ss)
    eksik = sorted(set(range(1, max(nos) + 1)) - nos) if nos else []
    isaretli = [s for s in ss.values() if s["uyari"]]
    # bolum sonunda kacan sorular: son sorudan buyuk numarayla baslayan OCR satirlari
    enbuyuk = max(nos) if nos else 0
    sonsf = max([x["sayfa"] for x in ss.values()], default=bas)
    kuyruk = []
    ocr = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ocr", "sayfa")
    for sf in range(sonsf, min(son, SON_SAYFA) + 1):
        for sut in "LR":
            yol = os.path.join(ocr, f"k{sf:03d}-{sut}.txt")
            if not os.path.exists(yol):
                continue
            for satir in open(yol, encoding="utf-8"):
                m = re.match(r"^[\s\W_]{0,3}?(\d{1,3})\s?[.,]\s*(\S.{10,})", satir.strip())
                if m and enbuyuk < int(m.group(1)) <= enbuyuk + 4:
                    kuyruk.append((int(m.group(1)), sf, m.group(2)[:60]))
    if kuyruk:
        eksik = sorted(set(eksik) | {x[0] for x in kuyruk})
    sayfalar = sorted({s["sayfa"] for s in isaretli} | {max([x["sayfa"] for x in ss.values() if x["no"] < e] or [bas]) for e in eksik} | {x[1] for x in kuyruk})
    pdfler = {}
    for sf in sayfalar:
        d, p = pdf_sayfasi(sf)
        pdfler.setdefault(d, []).append(p)
    print(f"### {k:02d} {BOLUMLER[k][1]} (s.{bas}-{son}) | taslak {len(ss)} soru, temiz {len(ss) - len(isaretli)}, isaretli {len(isaretli)}, eksik {eksik}")
    print("   bakilacak PDF sayfalari: " + "; ".join(f"{d}: {','.join(map(str, p))}" for d, p in pdfler.items()))
    for no, sf, t in kuyruk:
        print(f"   ?? bolum sonu adayi #{no} s{sf}: {t}")
    for s in sorted(isaretli, key=lambda x: x["no"]):
        sec = " | ".join(f"{h}) {v[:50]}" for h, v in s["secenekler"].items())
        print(f"   #{s['no']} s{s['sayfa']} => {s['cevap']}  [{'; '.join(s['uyari'])}]  {s['kok'][:90]} || {sec}")


if __name__ == "__main__":
    komut = sys.argv[1]
    taslak = json.load(open(sys.argv[2], encoding="utf-8"))
    k = int(sys.argv[3])
    if komut == "goster":
        goster(taslak, k)
    elif komut == "kontrol":
        kontrol(taslak, k)
    else:
        uret(taslak, k, json.load(open(sys.argv[4], encoding="utf-8")), sys.argv[5])
