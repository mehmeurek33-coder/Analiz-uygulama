#!/usr/bin/env python3
"""
OCR kural motoru: taranmış kitaplarda TEKRAR EDEN bozulmaları kuralla düzeltir, belirsizleri işaretler.
Tam görsel tarama yerine: (1) güvenli kurallar otomatik, (2) şüpheli sorular listelenir, yalnızca onlara
görüntüyle bakılır (soru_kirp.py / kirp_aralik.py). Her yeni hata türü bulunduğunda buraya kural eklenir;
böylece zamanla daha az soru elle bakmaya kalır (docs/HATALAR.md B32-B40).

Kullanım:
  python3 -I ocr_kural.py duzelt <girdi.json> [<cikti.json>]   # güvenli kurallar; değişiklik raporu
  python3 -I ocr_kural.py denetle <girdi.json>                 # şüpheli sorular (görüntüyle bakılacak)
  python3 -I ocr_kural.py nadir <girdi.json> [<ek_külliyat.json>] # külliyatta bir kez geçen kelimeler + bağlam
Yöntem (TTS Farmakoloji/Mikrobiyoloji'de denendi): duzelt → nadir (Claude listeyi METİN olarak okur, bariz
OCR bozukluklarını düzeltir, sözlüğe ekler) → yalnızca kökü anlamsız kalanlara görüntüyle bakılır. Tam görsel
taramanın ~onda biri maliyetle anlam değiştiren hataların çoğunu yakalar. Yeni eşlemeler ocr_sozluk.json'a.
Girdi: soru listesi [{anahtar|id, metin, secenekler, [aciklama]}] ya da soru-ekle JSON'u ({sorular:[...]}).
"""
import collections
import json
import os
import re
import sys

H = r"[A-Za-zÇĞİÖŞÜçğıöşüâîû]"          # harf
S = r"(?<![\wçğıöşüÇĞİÖŞÜ])"            # kelime başı
E = r"(?![\wçğıöşüÇĞİÖŞÜ])"             # kelime sonu

# --- 1. GÜVENLİ KURALLAR (anlam değiştirmez, yanlış pozitifi görülmedi) -----------------------------------
# (desen, yerine, açıklama). Kelime bazlı olanlar S...E ile sınırlı.
KELIME = {
    # gri "DUS'ta sorulmaya uygun" kutusu / l-i-t-f karışıklığı (TTS Farmakoloji + Mikrobiyoloji)
    "olaşı": "olası", "olaşıdır": "olasıdır", "yükşek": "yüksek", "gn": "en",
    "irreversibi": "irreversibl", "İrreversibi": "İrreversibl", "reversibi": "reversibl",
    "bioke": "bloke", "biokör": "blokör", "biokörü": "blokörü", "biokörler": "blokörler",
    "biokörleri": "blokörleri", "biokörlerinden": "blokörlerinden", "biokajı": "blokajı",
    "giokom": "glokom", "giokomun": "glokomun", "giokomda": "glokomda",
    "Aşağıdakiterden": "Aşağıdakilerden", "aşağıdakiterden": "aşağıdakilerden",
    "Orijinai": "Orijinal", "Orjinal": "Orijinal",
    "Fazl": "Faz I", "Fazli": "Faz II", "Fazil": "Faz II", "Fazlil": "Faz III", "Fazlll": "Faz III",
    "Sireptococcus": "Streptococcus", "Parainfiuenza": "Parainfluenza", "Giukokortikoid": "Glukokortikoid",
    "Vezamikoi": "Vezamikol", "adrenatin": "adrenalin", "noradrenatin": "noradrenalin",
}
# Öğrenilmiş kelime eşlemeleri (bağlamsız, tek kelime): ocr_sozluk.json. Her taramada büyür.
_SOZLUK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ocr_sozluk.json")
if os.path.exists(_SOZLUK):
    for _a, _b in json.load(open(_SOZLUK, encoding="utf-8")).items():
        KELIME.setdefault(_a, _b)
DESEN = [
    (r"\ben\. (?=[a-zçğıöşü])", "en ", "'en. uzun' → 'en uzun'"),
    (r"\bGg (?=proteini)", "Gq ", "Gq proteini"),
    (r"\bFaz [iİ]V\b", "Faz IV", "Faz IV"),
    (r"\bFaz [iİl]ll\b|\bFaz İll\b", "Faz III", "Faz III"),
    (r"\bCD(\d)\*", r"CD\1⁺", "CD4* → CD4⁺"),
    (r"(?<=\w) \* (?=\w)", " + ", "'A * B' → 'A + B' (OCR '+' işaretini '*' okur)"),
    (r"\(K\*\)", "(K⁺)", "K⁺"),
    (r"(?<=[a-zçğıöşü]{3}) (\w{2,3}) \1(?=[?.,])", r" \1", "tekrar eden hece 'biri ri' "),
]
SIK_SONU = re.compile(r"(?<=[a-zçğıöşü)]{2})\s[oi]$")   # şık sonunda madde imi kalıntısı ' o' / ' i'


def duzelt_metin(t, alan, sayac):
    if not t:
        return t
    for a, b in KELIME.items():
        t2 = re.sub(S + re.escape(a) + E, b, t)
        if t2 != t:
            sayac[f"kelime:{a}"] += 1
            t = t2
    for d, y, ad in DESEN:
        t2 = re.sub(d, y, t)
        if t2 != t:
            sayac[ad] += 1
            t = t2
    if alan != "kok":
        t2 = SIK_SONU.sub("", t.strip())
        if t2 != t.strip():
            sayac["şık sonu kalıntı"] += 1
            t = t2
    return t


# --- 2. ŞÜPHE KURALLARI (görüntüyle bakılır) -------------------------------------------------------------
ROMEN_TAM = re.compile(r"^(Yalnız\s+)?(I{1,3}|IV|VI{0,3}|V)(\s*(,|ve)\s*(I{1,3}|IV|VI{0,3}|V))*\.?$")
ROMEN_BOZUK = re.compile(r"^(Yaln[ıi]z\s*)?[IiİlL1|!VvY\s,.:;]*(ve|vel|veli|velI)?[IiİlL1|!VvY\s,.:;]*$")
SUPHE = [
    ("bitisik_kok", re.compile(r"\w(?:aşağıdaki|yukarıdaki|hangisi)|(?:aşağıdakilerden|ilaçlardan|hangisi)"
                               r"(?!dir|dır|nin|nın|ni|ne|nde|nden|yle|ler|lerin|leri|lerinin|ydi)\w{3,}", re.I)),
    ("tek_harf_kalinti", re.compile(r"(?<=[a-zçğıöşü]{3}) [a-zçğıöşü] (?=[a-zçğıöşü])")),
    ("kesik_kelime", re.compile(r"\b(aşağıdak|aşağıdakilerd|dakilerden|yukarıdak|hangisinir|kullanılmas|tedav)\b")),
    ("sembol", re.compile(r"\w[*#$€£©]|[*#$€£©]\w|^[$#]|\s[$#]")),
    ("alt_simge", re.compile(r"(?<![\w'])(?:[HDMVBE]|CB|ET|AT|NK|PGE|5-?HT)[,;]\s?(?=reseptör|agonist|antagonist|blok|analo|ve\b|tip\b)"
                             r"|(?<!\w)[aB],?-?\s?(?=adren)|(?<![\w-])5-?HT,")),
    ("harf_rakam_karisik", re.compile(r"\b(?:CYP\d{3,}|[A-Z]{2,}\d[O0o]\d|\d[lI]\b|[a-z]\d{2,}[a-z])")),
    ("bozuk_mevsim_yil", re.compile(r"\((?:İlkbahar|Sonbahar)\s*-?\s*(?:[A-Z]\d|\d{3}\b|\d{5,}|\d[A-Za-z])")),
    ("soru_kokunde_isaret_yok", None),
    ("sikta_soru_isareti", None),
    ("romen_sik_bozuk", None),
    ("ayni_iki_sik", None),
]


def suphe(kok, siklar):
    out = []
    alanlar = [("kok", kok or "")] + [(k, v or "") for k, v in (siklar or {}).items()]
    for ad, d in SUPHE:
        if d is None:
            continue
        for alan, t in alanlar:
            m = d.search(t)
            if m:
                out.append((ad, alan, t[max(0, m.start() - 25):m.end() + 20]))
    k = kok or ""
    if "?" not in k and not re.search(r"[:…]\s*(\([^)]*\))?\s*$", k):
        out.append(("soru_kokunde_isaret_yok", "kok", k[-60:]))
    for h, v in (siklar or {}).items():
        if "?" in v:
            out.append(("sikta_soru_isareti", h, v[-50:]))
    vs = list((siklar or {}).values())
    if sum(bool(ROMEN_TAM.match(v.strip())) or bool(ROMEN_BOZUK.match(v.strip()) and re.search(r"[IiVl1|]", v)) for v in vs) >= 3:
        for h, v in siklar.items():
            if not ROMEN_TAM.match(v.strip()):
                out.append(("romen_sik_bozuk", h, v))
    if len({v.strip() for v in vs}) < len(vs):
        out.append(("ayni_iki_sik", "siklar", " | ".join(vs)))
    return out


def sozluk_disi(sorular):
    """Tüm külliyatta bir kez geçen ve sık bir kelimeden yalnızca OCR'ın karıştırdığı harflerle ayrılan kelimeler."""
    kar = [set("lti1ıj|!f"), set("ec"), set("rn"), set("o0ö"), set("uü"), set("gğq"), set("sş5$"), set("cç"), set("ıi")]
    kucuk = lambda w: w.replace("I", "ı").replace("İ", "i").lower()  # noqa: E731
    tok = r"[A-Za-zçğıöşüÇĞİÖŞÜâîû]+"
    say = collections.Counter()
    for s in sorular:
        for t in [s.get("metin") or "", s.get("aciklama") or ""] + list((s.get("secenekler") or {}).values()):
            say.update(kucuk(w) for w in re.findall(tok, t))
    sik = [w for w, c in say.items() if c >= 4 and len(w) >= 4]
    out = collections.defaultdict(list)
    for s in sorular:
        for t in [s.get("metin") or ""] + list((s.get("secenekler") or {}).values()):
            for w in re.findall(tok, t):
                lw = kucuk(w)
                if len(lw) < 4 or say[lw] > 1:
                    continue
                for v in sik:
                    if len(v) == len(lw):
                        fark = [(a, b) for a, b in zip(lw, v) if a != b]
                        if 0 < len(fark) <= 2 and all(any(a in k and b in k for k in kar) for a, b in fark):
                            out[anahtar(s)].append(f"{w}→{v}?")
                            break
    return out


def anahtar(s):
    return str(s.get("anahtar") or s.get("id") or s.get("eski_id") or s.get("numara"))


def oku(yol):
    v = json.load(open(yol, encoding="utf-8"))
    return v["sorular"] if isinstance(v, dict) else v


if __name__ == "__main__":
    islem, girdi = sys.argv[1], sys.argv[2]
    sorular = oku(girdi)
    if islem == "duzelt":
        sayac = collections.Counter()
        degisen = []
        for s in sorular:
            m = duzelt_metin(s["metin"], "kok", sayac)
            sk = {h: duzelt_metin(v, h, sayac) for h, v in s["secenekler"].items()}
            if m != s["metin"] or sk != s["secenekler"]:
                degisen.append(anahtar(s))
                s["metin"], s["secenekler"] = m, sk
        cikti = sys.argv[3] if len(sys.argv) > 3 else girdi
        json.dump(sorular, open(cikti, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
        print(json.dumps({"degisen_soru": len(degisen), "kurallar": dict(sayac), "ornek": degisen[:10]}, ensure_ascii=False))
    elif islem == "nadir":
        ek = oku(sys.argv[3]) if len(sys.argv) > 3 else []
        tok = r"[A-Za-zçğıöşüÇĞİÖŞÜâîû][\wçğıöşüÇĞİÖŞÜâîû'’-]*"
        kucuk = lambda w: w.replace("I", "ı").replace("İ", "i").lower().strip("'’-")  # noqa: E731
        say, kok = collections.Counter(), collections.Counter()
        for s in sorular + ek:
            for t in [s.get("metin") or "", s.get("aciklama") or ""] + list((s.get("secenekler") or {}).values()):
                say.update(kucuk(w) for w in re.findall(tok, t))
        for w, c in say.items():
            kok[w[:7]] += c
        for s in sorular:
            for h, t in [("K", s["metin"])] + list(s["secenekler"].items()):
                for m in re.finditer(tok, t):
                    lw = kucuk(m.group())
                    if say[lw] == 1 and (len(lw) < 7 or kok[lw[:7]] <= 1):
                        print(f"{m.group()} | {anahtar(s)} {h} | {t[max(0, m.start() - 40):m.end() + 30]}".replace("\n", " "))
    elif islem == "denetle":
        rapor = collections.defaultdict(list)
        for s in sorular:
            for ad, alan, parca in suphe(s.get("metin"), s.get("secenekler")):
                rapor[anahtar(s)].append(f"{ad}[{alan}]: {parca}")
        for k, v in sozluk_disi(sorular).items():
            rapor[k].extend(f"harf_karisikligi: {x}" for x in v)
        tur = collections.Counter(x.split("[")[0].split(":")[0] for v in rapor.values() for x in v)
        json.dump(rapor, open(girdi.rsplit(".", 1)[0] + "_suphe.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(json.dumps({"supheli_soru": len(rapor), "toplam": len(sorular), "tur": dict(tur)}, ensure_ascii=False))
