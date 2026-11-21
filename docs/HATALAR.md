# Hata ve düzeltme günlüğü

Bu projede yaşanan hatalar, kök nedenleri, yapılan düzeltme ve bir daha olmaması için alınan önlem.
Yeni bir kitap/PDF aktarırken önce `CLAUDE.md` → "PDF geldiğinde: önce denetim" bölümünü uygula; buradaki
maddeler o kontrol listesinin gerekçesidir. Yeni hata bulunca buraya ekle.

## A. Kaynak PDF ve tarama

| # | Hata | Neden | Düzeltme | Önlem |
|---|------|-------|----------|-------|
| A1 | TTS 36. baskıda 17 eski soru "yeni baskıda yok" sanıldı | Yüklenen PDF'te 3 aralık taranmamış (kitap s. 61-62, 77-78, 109-110) | Sorular eski baskı metniyle bırakıldı; kullanıcıya eksik sayfalar söylendi | `pdf_denetim.py sayfa`: kitap sayfa numarasıyla eksik/çift sayfa tespiti; aktarımdan önce rapor |
| A2 | CAMP sorusunun (TTS 9. bölüm) anahtarı "E", açıklaması enterokok tablosu göründü | Açıklama eksik sayfaya (77) denk geliyordu; araç atlamadan sonraki ilk "Doğru cevap" satırını aldı | Anahtar C kaldı, eski baskının açıklaması geri kondu | `pdf_denetim.py yapi` "açıklaması eksik sayfayı aşan" listesi; bu sorular görüntüyle kontrol edilir |
| A3 | Meditus'ta 50 sayfada sütun yanlış kesildi, soru numaraları kayboldu | Sütun arası "en az mürekkepli pencere" iki sütuna yayılan tabloda yanılıyordu | Sütun arası 24 yatay bantta boş kalan pencereyle bulunuyor; `KOLON_ARALIK` | Kırpıntı kenarında mürekkep kontrolü |
| A4 | Hizalı metnin sol kenarı ve çerçeve çizgisi "sekme" sanılıp kırpıldı | Kenar sekmesi ölçütü yalnızca mürekkep yoğunluğuydu | Sekme kırpılmıyor, dış şerit beyazlatılıyor (`KENAR_BEYAZ`) | — |
| A5 | Taramada sayfa kenarı kesik: "18." → "8." | Kitap kaymış taranmış | Komşu sorular arasındaki konumdan numara atanıyor | Numara zinciri bölüm içinde, boşluk raporu |

## B. OCR ve ayrıştırma

| # | Hata | Neden | Düzeltme |
|---|------|-------|----------|
| B1 | Açıklamaya sonraki sorunun metni karıştı (TTS'te 8, ayrıca birkaç başka) | "Doğru cevap" satırı "Joğru/ığru/'oğru/u cevap" okundu, bitiş bulunamadı | Cevap satırı deseni yalnız "u cevap: X" sonuna bakıyor; "Cc"/"GC" gibi çift harf kabul |
| B2 | Varyant kutusunun ("şöyle de sorulabilirdi") cevabı asıl soruya yazıldı (HPV 6/11 sorusu E→A) | Kutu kendi "Doğru cevap" satırını taşıyor | Varyant kutuları ayrı işaretleniyor; Meditus'ta "sorulabilecek" cümlesi varyant sanılmasın diye kapalı |
| B3 | Açıklamadaki "1. Ökaryot 2. Prokaryot" listesi soru başı sanıldı | Numaralı satır deseni | Gerçek soru ya cevap satırından sonra ya da sütun başında gelir; yapı bir sonraki soruya kadar yeniden çıkarılır |
| B4 | Seçenekler kayboldu: "A)" → "AJ"/"Aji", "C)" → "G)", "E)" → "€)/EY" | OCR | Şık işaretleri sırayla A-E aranır, bilinen bozulmalar eşlenir |
| B5 | Son şık alt satıra taştı, kesildi (Meditus 87 soru) | Şık bloğu satır sonunda bitiriliyordu | Noktalamayla bitmeyen satırdan sonra küçük harfle başlayan satır şıka eklenir |
| B6 | İki sütunlu eşleştirme şıkları (Etken — Tedavi) karıştı | Satır satır OCR iki sütunu birleştirir | 85 Meditus sorusu görüntüden elle yazıldı (`elle_kok.json`, `elle_sik.json`) |
| B7 | Romen rakamlı öncül/şıklar bozuk ("Il", "IN", "ivelV") | OCR | Öncüller sırayla I, II, III… numaralanır; şıklar görüntüden okunur |
| B8 | Altı çizili kelimeden "(" ve tek "o" artıkları, yapışık "o" (omikroorganizma) | OCR | Kapanmayan "(" silinir; sözlükle yapışık "o" ayrılır |
| B9 | Kelime bozulmaları ("Fiajella", "HIVAIDS", "Jenfosit", "1L-6") | OCR | `kelime_duzelt.json` (350 kalıp), interlökin kuralı |
| B10 | Eski TTS aktarımında ~230 kök kesik ("... aşağıdakilerden i (Sonbahar 2001)") | İlk OCR'da sağ kenar kırpılmıştı | 36. baskı OCR'ından düzeltildi; kök "?" veya sınav etiketiyle bitmeli kontrolü |
| B11 | TTS'te 58 sorunun son şıkkına açıklamanın ilk cümlesi karıştı | İlk aktarımda şık bloğunun sonu yanlış | 36. baskı şık metniyle kesildi; 49 şıkta karakter bozulması ("Tip |", "!L-4", "Guillain-Barr&") düzeltildi |
| B12 | Eşleştirme kaçırdı: 66 eski soru "bulunamadı" | Bölüm ilk soruları, şekilli kökler, bozuk eski kökler | Komşu sorular arasında konumla arandı; 49'u bulundu |
| B13 | **(+)/(-) işaretleri bozuk** (hepatit seroloji şıkları, "gram (*)", "katalaz (4)"): 41 kök/şık, 45 açıklama. Bir soruda "anti-HBc IgG (-)" → "(9)" okunmuştu: sorunun anlamı değişiyordu | Parantez içindeki +/- OCR'da (4) (*) (1) (t) ve (9) (5) (<) oluyor | Hepatit soruları (7) görüntüden tek tek yazıldı; kalanlar eşlemeyle, birkaçı görüntüyle örneklenerek doğrulandı. Açıklamada yalnız test adından sonra gelenler değişti (liste numaraları korunur) |
| B14 | E şıkkına açıklamanın başlığı/ilk cümlesi karıştı (61 soru daha: "Oseltamivir KIRIM-KONGO HEMORAJİK ATEŞİ * Etken:", "Lamivudin Lamivudin: Bir nükleozid…") | İlk aktarımda son şıkkın bitişi bulunamadı (B11'in kalanı) | 36. baskı şıklarıyla kıyaslanıp (şık = baş kısmı) kesildi; eşleşmeyenlerde şık uzunluğu diğerlerinin ~2 katını aşınca elle bakıldı. Çok satırlı gerçek şıklar (yeni baskı OCR'ında kesik olanlar) korundu |
| B15 | Bitişik kelimeler ("Diyaresiolanvedışkiyaymasındaboltökositgörülen", "memelihücrelerininen:?") ve ortası düşmüş kökler ("savunmasından ka sahiptir?") | Eski baskı OCR'ı | 40'a yakın kök sözlük tabanlı bölme + yeni baskı/görüntüyle düzeltildi |
| B16 | Meditus'ta "MHC sınıf |", "©", "Oo", "oX" artıkları, Romen şıkları ("! veli", "IN ve IV"), "H,N," (H₁N₁), "JG virüs" (JC) | OCR | Görüntüyle düzeltildi (71 soru); kitabın kendi yazım hataları ("II ve IIII", "ilişkilimoleküler") yalnızca boşluk düzeltmesiyle korundu |
| B17 | Paralel iki sütunlu şıklarda sütun başlığı kayboldu ("Babesia microti Trichuris trichiura") | Satır OCR'ı başlık satırını köke yapıştırır | Şıklar "X — Y" biçimine getirildi, başlık kökün sonuna "(Protozoon — Helmint)" olarak eklendi |
| B18 | OCR harf karışıklıkları ("Btastomyces", "Chfamydia", "Sirepfococcus", "tenfadenopati", "likbahar") — 171 soru | l/t/i/f, e/c, r/n karışması; eski baskı OCR'ı | Külliyatta bir kez geçen kelime, sık bir kelimeden yalnız karışabilir harflerle (≤2) ayrılıyorsa düzeltildi; bağlama bağlı olanlar ("karında/kanında", "enjeksiyon/enfeksiyon", "medulla spinalis") listeden çıkarıldı. İlaç kombinasyonlarında "*" → "+", "CD8*" → "CD8+", "37*C" → "37°C" |
| B19 | Sınav etiketi bozuk/eksik: "rijinal", "dikbahar 2001", "(l 98", "İ 2018", ayrıca etiketi tamamen düşmüş 4 kök; 1 kökün ortası eksikti ("üremeden? Sonbahar…") | Vurgulu/gri kutulu satır OCR'ı | 59 kök: yeni baskı OCR'ı ve görüntüyle düzeltildi |
| B20 | **Sayı/rakam hataları** — anlamı değiştirenler: "52 yaşında" → 32, "50 yaş üzeri" → 30, HBIG dozu "0.06 mL/kg" → 0.006, "pro-IL-1β → IL-1β" → "IL-18", "Parvovirüs B19" → 819, "H3N8" → H3NB | Eski baskı/Meditus OCR'ı | TTS: DB kökündeki sayılar 36. baskı OCR'ıyla karşılaştırıldı (iki bağımsız OCR), farklar görüntüyle çözüldü (30 soru). Meditus: soru bölgesi 2× büyütülüp ikinci kez OCR'landı, farklar görüntüyle |
| B21 | **"%" → "96/95/90/92"** ("eozinofil oranı 9625" = %25, "966.5 NaCl" = %6.5, "Duyarlılık-9548" = Duyarlılık=%48), **"°C" → "“C" / "*C" / "9C"**, "+4 °C" → "*4", "µ/µm" → "u", "mm³" → "mm3/mm9/mm“", "BOS" → "8OS", "CO₂" → "COJ" | OCR | 62 + 30 soru; genel desenlerle ve görüntüyle. `pdf_denetim.py metin` bunları "isaret_(+/-)"/"ocr_artigi" altında yakalar |
| B22 | Meditus konu etiketi yanlış (12): "hangi virüsün aşısı yoktur" → Sterilizasyon; Shigella/E. coli → "Oksidaz Pozitif Kıvrık"; Listeria/Klamidya özellik soruları genel başlıkta | kNN'in genel bölüm sorularında organizmaya özgü soruyu yakalayamaması | İkinci görüş: doğru şıktaki cins adının TTS'teki konu dağılımı (≥%80) + setin bölümü; uyuşmayanlar elle karar verildi |
| B23 | Açıklama metinlerinde aynı "%"/°C bozulması (179 açıklama) | B21 ile aynı | Aynı desen açıklama ve blok metinlerine uygulandı (görüntü zaten doğruydu) |
| B24 | Açıklama metinlerinde harf karışıklığı ("Jenfoid", "Sirongyloides", "Ftukonazol", "azireonam") — 103 açıklama, 119 kelime | B18 ile aynı | Aynı yöntem açıklama + blok metinlerine; ö/o, ü/u ve r/n farkları (yazım varyantı ya da çekim eki olabilir) bilerek dışarıda bırakıldı |
| B25 | **Tek şekil açıklamada ikiye bölündü** (kullanıcı bildirimi, Meditus 01-009 "Genom/DNA" şekli; aynı sorun 5 Meditus sorusunda daha: T/B lenfosit, eritema nodosum fotoğrafı, Enterobius ve Dicrocoelium yumurtaları, Tinea nigra) | Şekil sütun sonuna denk gelince blok aracı iki ayrı parça kesti; fotoğraflar ortadan ikiye bölündü | Tam sayfa görüntüsünde parçaların yeri şablon eşleştirmeyle bulundu, şekil tek parça yeniden kırpıldı (aynı B2 adına), ikinci parça bloktan ve B2'den silindi. Parça yapıştırmak hizayı bozdu, kullanılmadı | `scripts/ocr/bolunmus_sekil.py <blok_dizini>`: art arda iki görsel parçada kesik kenar araması; yüklemeden önce çalıştır |
| B26 | **"… ile İlgili Sorulabilecek Önemli Bilgiler" özet kutuları "şöyle de sorulabilirdi" varyant kutusu sanıldı**; varyant işareti bir sonraki cevap satırına kadar her şeyi (gerçek 1. soru dahil) gizledi (TTS Farmakoloji) | `yeni_baski.py` deseni "sorulab" kadar genişti | Desen "başka bir hoca / şöyle de sor" ile sınırlandı (OCR için h[oö0]ca) | Varyant deseni asla genel bir kök ("sorulab") olmasın |
| B27 | **Soru numarası alt bölümde 1'e dönmüyor**, ana bölüm boyunca sürüyor (Farmakoloji "Dağılım" 24'ten başlar); bölüm sonu özet kutularında "1. … 36." kalın numaralı maddeler soru sanıldı | TTS'te numaralandırma kitaptan kitaba farklı | `tts_yapi.py`: zincir ana bölüm düzeyinde, en uzun artan dizi; alt bölüm sayfadaki başlıktan; ardışık numaralı satırlar arasında şık yoksa liste maddesi | Yeni kitapta önce birkaç bölüm sınırında numaranın 1'e dönüp dönmediğine bak |
| B28 | **Varyant kutusu şıklardan hemen sonra, açıklamadan ÖNCE** (Farmakoloji); kutunun kendi "Doğru cevap"ı sorunun cevabı sanılabilir. 32-120'de C (kutunun) yazılmıştı, doğrusu E | Mikrobiyoloji'de kutu cevaptan sonraydı | İki cevap satırı varsa kutunun konumuna göre seçildi (`cevap_denetim.py` mantığı); 17 cevapsız soru da böyle dolduruldu | Her yeni kitapta "kutu nerede" kontrolü; iki cevap satırı olan soruları listele |
| B29 | **Kullanıcının kalemle üstünü çizdiği şıklar** (taranmış kişisel kitap): OCR şık işaretlerini bulamadı, 19 sorunun şıkları bir sonraki sorudan alındı | Taramada el yazısı/çizgi | "Şık başlangıcı sonraki sorudan sonra" ise `sik_yok` işaretlenir, görüntüden elle okunur | Şıkları bulunamayan soru asla sonrakinin şıklarını almasın |
| B30 | **Gri "(DUS'ta sorulmaya uygun)" kutusunun yanındaki kelimeler kayboldu** ("…aşağıdakilerden Ye eğ (Sonbahar 2010)") | Gri zemin OCR'ı bozuyor | Soru bölgesi eşiklenip (165) 2× büyütülerek yeniden OCR'landı; her kök/şık için sözlükle daha tutarlı okuma seçildi (`kok_yeniden.py`) | Gri kutulu kitaplarda soru bölgesini eşikli ikinci okumayla karşılaştır |
| B31 | Tablo içeren açıklamalarda TSV satır sırası karışık: önceki sorunun tablo satırları sonraki sorunun köküne, cevabı da sonraki sorunun ardına düştü (15-071/072) | Tesseract blok sırası | Elle düzeltildi | Kökte "Doğru cevap" ya da tablo başlığı geçiyorsa yapıyı görüntüyle kontrol et |
| B32 | **Kalın kökte kelimeler bitişik** ("Aşağıdakilerdenhangisikimyasalantagonizmadır?", "hangisihem") — 27 Farmakoloji kökü | Kitapta sıkışık dizgi; OCR boşluğu atıyor | Görüntüden yazıldı | `pdf_denetim.py metin` artık "aşağıdaki/hangisi" ile bitişen kelimeleri de bulur |
| B33 | **Gri DUS kutusu kökün son kelimelerini yuttu ya da çöple değiştirdi** ("… i Seğilir?", "(kolinesteraz p pr yar 4 2023)", "terapötik p i?"); bir kökte soru tamamen kayboldu ("k« es", soru işareti E şıkkına kaydı) — ~90 kök | B30 ile aynı; eşikli ikinci okuma da kurtaramadı | Görüntüden yazıldı | Yeni denetimler: `tek_harf_kalinti`, `kok_soru_isaretsiz`, `sikta_soru_isareti`, `sik_sonunda_kalinti` |
| B34 | **"+" → "*"** ("Asetilkolin * Atropin", "Ampisilint Kloramfenikol"), **"β₁" → "$1"/"B,"/"B-"**, **"α" → "a"**, "50S" → "50$", "Na⁺" → "Na'"/"Nat"/"Na*" | OCR | " * " toplu " + "; diğerleri görüntüden | Denetim: `sembol_(+ * $)` |
| B35 | **Alt simge kaybı**: "D₂" → "D,", "5-HT₃" → "5-HT,", "H₁" → "H,", "Prostaglandin E₂" → "Prostaglandin E", "B₁₂" → "B."; bazen simge tamamen düşüyor ("Histamin H", "Dopamin D") — ~120 yer | Küçük punto alt simge | Görüntüden (Unicode alt simge) | Denetim: `alt_simge_kaybi`; şıkta tek büyük harfle biten reseptör adlarına görüntüyle bak |
| B36 | **"(DUS 2018 Orijinal)" etiketi silindi** — `tts_temizle.py` onu gri kutu artığı saydı (7 soru) | DUS kelimesi iki anlamda | Ham OCR'dan geri yazıldı; araç artık "(DUS yyyy …)"yi sınav etiketi sayar | — |
| B37 | **Varyant kutusunun kendi cevap satırı bozuk okununca** ("Doğru cavap: C", "Doğrü cevap: â", hiç okunamayan) kutu işareti gerçek açıklamayı ve asıl cevabı da kapladı: 15 soruda açıklama boş kaldı | `yeni_baski.py` kutuyu yalnız sağlam "Doğru cevap" deseniyle bitiriyordu | Gevşek cevap deseni + kutunun E) şıkkından sonra cevap yoksa orada bitir; iki kutu elle | Açıklaması boş çıkan her soruya bak |
| B38 | **Cevap satırı şıkların hemen altında, açıklama ondan sonra** (bazı Farmakoloji sayfaları; 13 soru) ya da bölüm sonunda açıklama yok, ardından "… ile İlgili Sorulabilecek Önemli Bilgiler" özeti | Sayfa düzeni farkı | `aciklama_blok.py`: bölge boşsa cevap satırından sonraki satırlar, özet kutusu / büyük harfli başlıkta durur | Özet kutusu açıklamaya karışmasın |
| B39 | **Anlamı tersine çeviren kök bozulmaları**: "uygulanmamalıdır?" → "uygul lıdır?", "tercih edilmelidir?" → "dilmelidir?", "faz I" → "faz II", "oksitotoksik" → "sitotoksik", "en az" → "en gz"; seroloji "AntiHbc-IgM" → "AntiHbe-IgM", "Anti-HBc" → "Anti-H8c" | Gri kutu + l/i/t, c/e karışıklığı | Görüntüyle düzeltildi (TTS Farma 43 pafta tam tarama + nadir kelime yöntemi; Mikro 215, Farma ~240 soru) | `ocr_kural.py nadir`: külliyatta bir kez geçen kelimeler metin olarak okunur; kökü anlamsız kalan görüntüyle |
| B40 | Tam görsel tarama pahalı: 251 soruda 84 hatalı (çoğu kozmetik, ~%2 anlam değiştiren), kural denetimi bunların yalnız 20'sini yakaladı | Tekil yazım bozuklukları kurala uymuyor | Yöntem değişti: `ocr_kural.py duzelt` (245 öğrenilmiş eşleme, `ocr_sozluk.json`) → `nadir` listesini Claude metin olarak okur → yalnız şüpheliler görüntüyle. Kullanıcı ⚑ Hata bildir ile kalanları yakalar | Her taramada yeni eşlemeleri `ocr_sozluk.json`'a ekle |
| B41 | Farmakoloji'de soru numaraları/etiket: "(Sonbahar-B8)", "(İlkbahar-38)", "(Sonbahar 20191)", "(İlkbahar 22018)"; "Fazl/Fazli/Faz iV"; "*" yerine "+" | OCR | Kural + görüntü | `ocr_kural.py denetle`: bozuk_mevsim_yil, Faz kuralları |
| B42 | Mikrobiyoloji tam metin okuması (2524 soru, 21.11): 533 soruda düzeltme. Türleri: tek harf/kelime bozulması (gonorrhosae/gonorrhogae/gonorrhcaeae, ftumigatus, Aspergiltus, iökosit, olasi, Diphyilobothrium tatum), Yunan harfi (IFN-y, TGF-B, faktörü-B, B-1,3 glukan, 6hemolitik → β), alt simge (B,, → B₁₂, LTB, → LTB₄, C,b → C₃b, Th, → Th₁, H,S → H₂S, mm0 → mm³), harf/rakam (Grup 8 → B, Paratyphi 8, Hepatit 8, Amfoterisin 8, CCR9 → CCR5, O → Q ateşi, ONA → DNA, POR/PER → PCR, VORL → VDRL, KIV → HIV, COR → CDR), kesik/bozuk kök ("hi i üşünülmelidir", "birlikt ilmiştir", "han isinde", "aşağı rden"), iki sütunlu şıklarda ayraç kaybı ("Rubella Artrit"), yanlış seçenek takımı (Meditus 05#146: Romen şıkları başka sorudan), "(Resim)" kökünde görsel yok (4 Meditus soru_gorsel) | OCR | 8 güvenli desen + ~60 sözlük eşlemesi eklendi; 35 şüpheli soru görüntüyle doğrulandı. Kitap yazım hataları (Staphyloccus, Heamophilus, sülfometaksazol, Nocardia tauacia) olduğu gibi bırakıldı | `ocr_kural.py duzelt` yeni desenler: H,S, IFN-y, Ziehi, VORL, sınıf İl, FaktörH, Bilenfosit, İL-, een, en sik, E-Tor, 42'C. Sözlüğe küçük harfli ilaç adı büyük harfle EKLEME (cümle içini bozar) |

## C. Cevap anahtarı

| # | Hata | Düzeltme | Önlem |
|---|------|----------|-------|
| C1 | Anaerobik İYE sorusu D → A (kitabın 36. baskısı ve açıklaması) | Uygulandı, cevaplar yeniden puanlandı | Baskılar arası anahtar farkı listelenir, kısa mesafeli ve açıklamayla desteklenenler uygulanır |
| C2 | Meditus cevap harfi OCR'ı (G/c → C) | 18 bozuk okuma görüntüyle doğrulandı, hepsi doğru eşlenmiş | "Soruda X tanımlanmaktadır" ↔ anahtar uyumu (178/178) |

## D. Uygulama

| # | Hata | Düzeltme |
|---|------|----------|
| D1 | Açıklamayı alttan kapatınca ekran zıplıyordu | Kapatma öncesi/sonrası konum farkı kadar anında kaydırma; alttaki soru yerinde kalır |
| D2 | Ana ekran simgesi kayboldu (workers.dev üzerinden eklenince) | `manifest.webmanifest` girişsiz isteklerde giriş sayfasına yönleniyordu; middleware dışında bırakıldı |
| D3 | "Bitir" iki kez çağrılınca yeniden puanlama ve bitiş saati değişiyordu | Bitmiş denemede rota hemen döner (`zatenBitti`) |
| D4 | Operatör `*.vercel.app`'i engelledi (mobil veride ERR_CONNECTION_CLOSED) | Cloudflare Worker `tusanaliz.mehmeurek33.workers.dev` ara adresi (`cloudflare/worker.js`) |
| D5 | Bir yanlış konuyu listenin başına oturtuyordu ("takıntı") | Öncelik formülüne kanıt ağırlığı, karekök hata katkısı, 36 saatlik doygunluk, denemede tavan |
| D6 | Bir kez doğru yapınca soru tekrar listesinden düşüyordu | Aralıklı tekrar (kutu 0-4, 2/7/21 gün) |

## E. Depolama ve veri işlemleri

| # | Hata | Düzeltme | Önlem |
|---|------|----------|-------|
| E1 | B2'de yeniden yüklenen görsellerin eski sürümleri 106 MB yer kaplıyordu | `/api/b2-bakim` ile 3513 eski sürüm ve 10 referanssız dosya silindi | Her toplu yeniden yüklemeden sonra `{"islem":"eski_surumler"}` |
| E2 | `update ... from (values ...)` aynı soruya iki satır gelince yalnız birini uyguladı | Değerler soru başına birleştirildi (`jsonb` birleştirme) | Toplu güncellemede kimlik başına tek satır |
| E3 | Supabase'te kullanılmayan eski görseller (93 MB) ve aktarım tablosu | Silindi (önce tüm yolların B2'de olduğu doğrulandı) | Silmeden önce referans kontrolü |
| E4 | Görseller 4 gri tona indirilmişti, okunurluk düşüktü | Tam çözünürlük + tam gri WebP q88 (`GORSEL_YUKSEK=1`) | Kullanıcı isteği: kalite düşürülmez |
| E5 | Toplu SQL düzeltmesinde `regexp_replace(..., '\s*\S*\s*(Bu soru…)')` sızıntıyla birlikte şıkkın son kelimesini de sildi | Değerler elle geri yazıldı | Silme deseninde önceki kelimeyi yakalayan `\S*` kullanma; sonucu `returning` ile hemen oku |
| E6 | "MHC |" (Meditus 02-039 A) tahminle "MHC II" yapıldı; görüntüde "MHC I" idi (aynı şık iki kez çıktı) | Görüntüyle düzeltildi | Romen rakamını tahminle yazma, her zaman görüntüye bak; düzeltmeden sonra "aynı iki şık" denetimi |
| E7 | **Açıklama görselleri ve "Kitaptaki hâlini göster" açılmadı** (kullanıcı bildirimi, TTS 06-11/12) | İmzalı B2 jetonu 6 saat geçerli ama sunucuda 5 saat önbellekteydi: önbelleğin sonunda açılan sayfanın bağlantıları ~1 saatte ölüyordu; uzun çözüm oturumunda görseller yüklenmedi | Jeton 26 saat / önbellek 2 saat (bağlantı ≥24 saat); görsel yüklenemezse `/api/gorsel?yol=` ile taze bağlantıyla bir kez yeniden dener (`Gorsel.tsx`) | Önbellek süresi, verilen bağlantının ömrünü asla kısaltmasın |

## F. Denetim aracı

`scripts/ocr/pdf_denetim.py metin <girdi.json>` (soru-ekle JSON'u ya da `yapi.json`): B13-B17'nin hepsini
aktarımdan önce raporlar (bozuk +/- işareti, OCR artığı, bitişik kelime, varyant kutusu sızıntısı, aşırı uzun şık,
kesik kök, bozuk Romen şıkkı). 21.11.2026'da veritabanının tamamında çalıştırıldı; kalan bulgular kitabın kendi
yazımı (ör. "II ve IIII") ya da gerçek uzun şıklardır.

Veri düzeltmelerinin önceki hâlleri scratchpad'de `deney/duzeltme_tur3b.json`, `tur3c`, `tur3d`,
`aciklama_isaret_once.json`, `sik_E_sizinti_once.json` (geri almak gerekirse).
