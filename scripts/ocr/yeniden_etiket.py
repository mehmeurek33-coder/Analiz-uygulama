#!/usr/bin/env python3
"""
Mikrobiyoloji sorularini Sampiyon Notlari basliklarina yeniden etiketler.
Kullanim: python3 -I yeniden_etiket.py <scratchpad>
Girdi:  yeniden/sorular.json, yeniden/elle.json (istege bagli: {id: konu})
Cikti:  yeniden/atama.json {id: yeni_konu}, yeniden/inceleme.txt (belirsizler)
"""
import json
import os
import re
import sys
from collections import Counter, defaultdict

S = sys.argv[1]
D = os.path.join(S, "yeniden")
sorular = json.load(open(f"{D}/sorular.json", encoding="utf-8"))
elle = {}
if os.path.exists(f"{D}/elle.json"):
    elle = json.load(open(f"{D}/elle.json", encoding="utf-8"))


def kucuk(t):
    return (t or "").replace("İ", "i").replace("I", "ı").lower()


# Bire bir eslesenler
BIRE_BIR = {
    "Mikroorganizmaların Sınıflandırılması": "Mikroorganizmaların Sınıflandırılması",
    "Bakteri Hücresinin Yapısı": "Bakteri Hücrelerinin Yapısı",
    "Bakteri Metabolizması ve Üreme": "Bakterilerin Metabolizması ve Üretimi",
    "Bakteri Genetiği": "Bakteri Genetiği",
    "Bakteri Toksinleri": "Bakteri Patogenezi",
    "Dezenfeksiyon ve Sterilizasyon": "Sterilizasyon ve Dezenfeksiyon Yöntemleri",
    "Antimikrobiyaller": "Antimikrobiyaller ve Aşılar",
    "Gram Pozitif Koklar": "Gram Pozitif Koklar",
    "Gram Negatif Diplokoklar": "Gram Negatif Diplokoklar",
    "Enterobakteriler": "Gram Negatif Enterik Bakteriler (Enterobacteriaceae)",
    "Vibrio, Campylobacter ve Helicobacter": "Oksidaz Pozitif Kıvrık Gram Negatif Basiller",
    "Gram Negatif Kokobasiller": "Gram Negatif Kokobasiller",
    "Non-Fermentatif Gram Negatif Basiller": "Non-fermentatif Gram Negatif Basiller",
    "Çeşitli Gram Negatif Bakteriler": "Çeşitli Gram Negatif Bakteriler",
    "Mikobakteriler": "Mikobakteriler",
    "Klamidyalar": "Klamidyalar",
    "Mikoplazmalar": "Mikoplazmalar ve Üreplazmalar",
    "Anaerop Bakteriler": "Çeşitli Anaerop Bakteriler",
    "Mikrobiyolojik Örnek Alma": "Bakterilerin Tanılama Yöntemi",
    "Temel Mikoloji": "Genel Mikoloji",
    "Yüzeyel ve Kutanöz Mikozlar": "Yüzeyel ve Kutanöz Mikozlar",
    "Fırsatçı Mikozlar": "Fırsatçı Mikozlar",
    "Antifungal İlaçlar": "Antifungal İlaçlar",
    "Kan ve Doku Protozoonları": "Kan ve Doku Protozoonları",
    "Sestodlar": "Sestodların Genel Özellikleri",
    "Herpesvirüsler": "DNA Virüsleri",
    "Poks, Papova, Adeno ve Parvovirüsler": "DNA Virüsleri",
    "Ortomikso ve Paramiksovirüsler": "Negatif Kutuplu RNA Virüsleri",
    "HIV ve Retrovirüsler": "Retrovirüsler",
    "Hepatit Virüsleri": "Primer Hepatotrop Virüsler",
    "Antiviral Tedavi": "Antiviral İlaçlar ve Aşılar",
}

# Bolunenler: (anahtar kelime regex, hedef) listesi + varsayilan
B = {
    "Bacillus ve Clostridium": ([
        (r"clostrid|tetanoz|tetanus|botul|gazlı gangren|perfringens|difficile|psödomembran", "Sporlu Gram Pozitif Anaerop Basiller"),
        (r"bacillus|şarbon|anthrax|antraks|cereus", "Gram Pozitif Sporlu Basiller"),
    ], None),
    "Sporsuz Gram Pozitif Basiller": ([
        (r"actinomyces|aktinomikoz|propionibacter|cutibacter", "Çeşitli Anaerop Bakteriler"),
    ], "Sporsuz Gram Pozitif Aerop Basiller"),
    "Spiroketler": ([
        (r"borrel|lyme|borelya|relaps|dönek ateş", "Borelyalar"),
        (r"leptospir|weil", "Leptospiralar"),
        (r"trepone|sifiliz|frengi|vdrl|rpr|fta|şankr|pinta|yaws|bejel", "Spiroketler"),
    ], None),
    "Riketsiya ve Coxiella": ([
        (r"coxiella|q ateş|anaplasm|ehrlich|bartonel", "Coxiella, Anaplasma"),
        (r"rickett|riketsi|tifüs|kayalık dağ|akdeniz benekli|orientia|tsutsugamushi", "Riketsiyalar"),
    ], None),
    "Subkutanöz ve Endemik Mikozlar": ([
        (r"sporothri|sporotrik|kromoblasto|kromomiko|miçetom|micetom|mycetom|feohifo|rhinosporid|lobomiko|madura", "Subkutan (Deri Altı) Mikozlar"),
        (r"histoplasm|blastomy|blastomik|coccidioid|koksidioid|paracocci|parakoksi|talaromy|marneffei|emmonsi|dimorf", "Endemik (Sistemik, Derin) Dimorfik Mikozlar"),
    ], None),
    "Gastrointestinal ve Ürogenital Protozoonlar": ([
        (r"trichomon|trikomon", "Ürogenital Sistem Protozoonları"),
        (r"giardi|entamoeb|amip|cryptospor|kriptospor|cyclospor|cystoisospor|isospor|balantid|blastocyst|dientamoeb|microspor|mikrospor", "Gastrointestinal Sistem Protozoonları"),
    ], "Gastrointestinal Sistem Protozoonları"),
    "Trematodlar": ([
        (r"schistosom|şistozom|bilharz", "Venalar İçinde Yaşayan Trematodlar"),
        (r"paragonim", "Akciğer Trematodu"),
        (r"fasciola hepatica|fasciola|fasiyola|clonorch|klonork|opisthorch|opistork|dicrocoel|dikrosel", "Safra Yolu Trematodları"),
        (r"fasciolopsis|heterophy|metagonim|echinostom", "Gastrointestinal Sistem Trematodları"),
    ], None),
    "Nematodlar": ([
        (r"ancylostom|necator|kancalı|çengelli", "Kancalı Kurtlar (Çengelli Solucanlar)"),
        (r"wuchereri|brugia|onchocerc|onkoserk|loa loa|filar|mansonell", "Filaryalar"),
        (r"strongyloid|trichinel|trişin|trikinel", "İntestinal ve Doku Nematodları"),
        (r"toxocar|toksokar|dracuncul|larva migrans|angiostrong|anisaki|gnathostom|dirofilar", "Doku Nematodları"),
        (r"enterobius|oksiyür|ascaris|askaris|trichuris|trikuris|kıl kurdu|kamçılı kurt", "İntestinal Nematodlar"),
    ], None),
    "Diğer RNA Virüsleri": ([
        (r"kuduz|rabies|rabdo|lyssa|ebola|marburg|filovir|bunya|hantavir|hanta|kırım|kongo|kkka|phlebo|arenavir|lassa|lenfositik koryomenenjit|lcmv|borna|nairovir", "Negatif Kutuplu RNA Virüsleri"),
        (r"picorna|pikorna|polio|enterovir|coxsackie|koksaki|echovir|ekovir|rinovir|rhinovir|calici|kalisi|norovir|norwalk|sapovir|togavir|toga|rubella|kızamıkçık|flavivir|flavi|dang|dengue|sarı humma|zika|batı nil|west nile|kene kaynaklı ensefalit|japon ensefalit|coronavir|koronavir|sars|mers|astrovir|alfavir|chikungunya|hepatit a|parechovir", "Pozitif Kutuplu RNA Virüsleri"),
        (r"rotavir|reovir|orbivir|coltivir", "RNA Virüsleri"),
    ], None),
    "Genel Viroloji": ([
        (r"duyarlılı[gğ]ı|özgüllü|spesifite|sensitivite|prediktif|pozitif kestirim|negatif kestirim|insidans|prevalans|atak hızı", "Enfeksiyon Hastalıklarında İstatistik"),
        (r"prion|prion|kuru hastalığı|creutzfeldt|scrapie", "Prionlar ve Neden Olduğu Hastalıklar"),
    ], "Genel Viroloji"),
    "İmmün Sistem Organları, Hücreleri ve Sitokinler": ([
        (r"sitokin|interlökin|\bil-\d|\bıl-\d|tnf|interferon|ifn|kemokin|tgf", "Sitokinler"),
        (r"timus|timüs|dalak|lenf nod|lenfoid organ|germinal merkez|peyer|malt\b|kemik iliği|lenf düğüm", "Lenfoid Organlar"),
        (r"olgunlaş|seleksiyon|seçilim|v\(d\)j|vdj|rag-?\d|rag gen|timosit|pre-?b|pre-?t|gen yeniden düzen|rearrange", "Bağışık Yanıt Hücrelerinin Olgunlaşma Süreci"),
        (r"doğal bağışık|doğuştan bağışık|kazanılmış bağışık|edinsel bağışık|innate|tlr|toll|prr|pamp|damp|inflamazom|aktif bağışık|pasif bağışık", "İmmünite"),
        (r"\bnk\b|nk hücre|t hücre|b hücre|makrofaj|nötrofil|eozinofil|bazofil|mast|dendritik|cd\d|lenfosit|treg|th1|th2|th17|monosit", "Bağışık Yanıt Hücrelerinin Özellikleri"),
    ], None),
    "Antijen, Antikor ve Kompleman": ([
        (r"kompleman|komplemen|\bc1|\bc3|\bc4|\bc5|\bc9|mac\b|membran atak|properdin|lektin yolu|klasik yol|alternatif yol|herediter anjiyoödem|c1 inhibit", "Kompleman Sistemi"),
        (r"antikor|ig[gmade]\b|immünoglobulin|ımmünoglobulin|izotip|idiotip|allotip|fab|fc\b|hafif zincir|ağır zincir|monoklonal", "Antikor"),
        (r"antijen|hapten|epitop|süperantijen|adjuvan|immünojen|ımmünojen|t-?bağımsız|t-?bağımlı", "Antijen"),
    ], None),
    "MHC ve Bağışık Yanıt": ([
        (r"antijen sunu|apc|antijen işlen|proteazom|tap\b|endozom|çapraz sunum", "Antijen Sunumu"),
        (r"mhc|hla|doku uygunluk", "Büyük Doku Uygunluk Antijenleri"),
    ], None),
    "Aşırı Duyarlılık ve Diğer İmmünoloji Konuları": ([
        (r"aşırı duyarlı|hipersensitiv|anafilak|tip i\b|tip ii\b|tip iii\b|tip iv\b|arthus|serum hastalığı|atopi|alerji|ppd|tüberkülin|kontakt dermatit|immün kompleks", "Aşırı Duyarlılık Reaksiyonları"),
    ], None),
}


def eslesmeler(metin, kurallar):
    bulunan = []
    for rx, hedef in kurallar:
        if re.search(rx, metin) and hedef not in bulunan:
            bulunan.append(hedef)
    return bulunan


atama, inceleme, neden = {}, defaultdict(list), Counter()
for s in sorular:
    sid, eski, alt = s["id"], s["konu"], s["alt_konu"]
    if sid in elle:
        atama[sid] = elle[sid]
        neden["elle"] += 1
        continue
    if eski == "Mikroorganizmaların Sınıflandırılması" and alt == "Prionlar":
        atama[sid] = "Prionlar ve Neden Olduğu Hastalıklar"
        continue
    if eski == "Bakteri Metabolizması ve Üreme" and alt == "Örnek kabul kriterleri":
        atama[sid] = "Bakterilerin Tanılama Yöntemi"
        continue
    if eski in BIRE_BIR:
        atama[sid] = BIRE_BIR[eski]
        continue
    if eski not in B:
        inceleme["bilinmeyen eski konu"].append(s)
        continue
    kurallar, varsayilan = B[eski]
    sec = json.loads(s["sec"])
    kok = kucuk(s["metin"]) + " " + kucuk(alt)
    dogru = kucuk(sec.get(s["dogru_cevap"] or "", ""))
    hepsi = kucuk(" ".join(sec.values()))
    # 1) kok, 2) dogru sik, 3) tum siklar (tek hedef varsa)
    sonuc = None
    for katman, metin in (("kök", kok), ("doğru şık", dogru), ("şıklar", hepsi)):
        e = eslesmeler(metin, kurallar)
        if len(e) == 1:
            sonuc = e[0]
            neden[katman] += 1
            break
        if len(e) > 1:
            if katman == "kök":
                # kökte birden çok: doğru şıkla daralt
                e2 = [x for x in eslesmeler(dogru, kurallar) if x in e]
                if len(e2) == 1:
                    sonuc = e2[0]
                    neden["kök+doğru"] += 1
                    break
            inceleme[f"{eski} · çoklu ({katman}: {', '.join(e)})"].append(s)
            sonuc = "?"
            break
    if sonuc is None:
        if varsayilan:
            sonuc = varsayilan
            neden["varsayılan"] += 1
        else:
            inceleme[f"{eski} · eşleşme yok"].append(s)
            sonuc = "?"
    if sonuc != "?":
        atama[sid] = sonuc

json.dump(atama, open(f"{D}/atama.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
with open(f"{D}/inceleme.txt", "w", encoding="utf-8") as f:
    for baslik, liste in inceleme.items():
        f.write(f"\n### {baslik} ({len(liste)})\n")
        for s in liste:
            sec = json.loads(s["sec"])
            f.write(f"{s['id']} | {s['metin'][:230]!r} | doğru: {sec.get(s['dogru_cevap'] or '', '')[:60]!r}\n")
print("atanan", len(atama), "inceleme", sum(len(x) for x in inceleme.values()), dict(neden))
print(Counter(atama.values()).most_common())
