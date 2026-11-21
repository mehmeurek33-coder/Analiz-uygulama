#!/usr/bin/env python3
"""
TTS koklerinde sinav etiketi ve gri "(DUS'ta sorulmaya uygun)" kutusu kalintilarini temizler.
Girdi/cikti: meditus_soru.py'nin <D>/sorular.json'u (yerinde gunceller, once <D>/sorular_once_temizle.json yedegi).

- "(DUS'ta sorulmaya uygun)" ve bozuk bicimleri ("(US'ta sorulmaya uygun)", "(© aya uygun).", "DUS") silinir
- "(DUS Sonbahar 2012)" -> "(Sonbahar 2012)"; "likbahar/ilkbahar/Ilkbahar" -> "İlkbahar"; "Orjinal/rijinal" -> "Orijinal"
- son etiketin ardindaki kisa cop ("©", "9", "i in)") silinir
Kullanim: python3 -I tts_temizle.py <D>
"""
import json
import re
import sys

D = sys.argv[1]
yol = f"{D}/sorular.json"
d = json.load(open(yol, encoding="utf-8"))
json.dump(d, open(f"{D}/sorular_once_temizle.json", "w", encoding="utf-8"), ensure_ascii=False)

DUS = re.compile(r"\s*\(?\s*(?:[DBOİ]?[UÜ]S|DUS)?\s?['’`/]?\s?ta\s*sor\w*\s*uyg\w*\s*\)?[.”\"]?|\s*\((?:©\s*)?\w{0,4}\s*aya\s*uyg\w*\)\.?", re.I)
MEVSIM = re.compile(r"\b[lIiİ]{1,2}[lIiİ]?kbahar\b|\bİlkb\s?her\b")


def temizle(t):
    t = DUS.sub("", t)
    # "(DUS 2018 Orijinal)" gercek sinav etiketidir (gri kutu degil); asagidaki cop temizligi silmesin
    t = re.sub(r"\(\s*[DBO]?[UÜ]S\s*\(?\s*(\d{4})\s*(Orijinal)?\s*\)?",
               lambda m: f"(DUS {m.group(1)}" + (" Orijinal)" if m.group(2) else ")"), t)
    t = re.sub(r"\(\s*DUS\s+(?=(?:İlkbahar|Sonbahar|[lIi]kbahar))", "(", t)
    t = MEVSIM.sub("İlkbahar", t)
    t = re.sub(r"\b(?:Orjinal|rijinal|Orjinel|Orijnal)\b", "Orijinal", t)
    t = re.sub(r"\((?:İlkbahar|Sonbahar)\s*\((\d{2,4})\)", lambda m: m.group(0).replace("(" + m.group(1) + ")", m.group(1)), t)
    # "Sonbahar (2009)" -> "(Sonbahar 2009)" (kok sonunda)
    t = re.sub(r"(?<!\()\b(İlkbahar|Sonbahar)\s*\((\d{2,4})\)\s*$", r"(\1 \2)", t)
    # son sinav etiketinden sonra kalan kisa cop
    m = list(re.finditer(r"\((?:[^()]*?(?:İlkbahar|Sonbahar|Eylül|Nisan|DUS \d{4})[^()]*)\)", t))
    if m:
        kalan = t[m[-1].end():]
        if (len(kalan.strip()) <= 8 and not re.search(r"[a-zçğıöşü]{3}", kalan)) or (
                len(kalan) < 60 and re.search(r"(uy?g|sor[uü]?l|ulm|aya|[DBÖ]?[UÜ]S|g[uü]n\b|ygul)", kalan, re.I)):
            t = t[:m[-1].end()]
    else:
        # etiketsiz kok: soru isaretinden sonra gelen DUS kalintisi
        i = t.rfind("?")
        if i >= 0 and re.search(r"(uy?g|sor[uü]?l|ulm|[DBÖ]?[UÜ]S)", t[i + 1:], re.I) and len(t) - i < 60:
            t = t[:i + 1]
    t = re.sub(r"\s+DUS\s*$", "", t)
    return re.sub(r"[ \t]{2,}", " ", t).strip()


degisen = 0
for x in d:
    y = temizle(x["metin"])
    if y != x["metin"]:
        degisen += 1
        x["metin"] = y
json.dump(d, open(yol, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print({"soru": len(d), "degisen": degisen,
       "dus_kalan": sum(bool(re.search(r"sorulm|uygun\)", x["metin"])) for x in d)})
