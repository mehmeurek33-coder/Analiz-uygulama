# Taranmış soru kitabı → JSON (OCR hattı)

Metin katmanı olmayan (taranmış) soru kitapları için. Metin katmanı olan PDF'lerde gerek yok,
Read aracı yeter. Bu klasörde **yalnızca kod** var; PDF, OCR çıktısı ve soru metni repoya girmez
(telif). Hepsi scratchpad'de üretilir.

TUSDATA "Tüm TUS Soruları – Mikrobiyoloji" (470 sayfa, 1492 soru) bu araçlarla aktarıldı.
Görüntüyle doğrulanan 517 soruda sessiz hata çıkmadı.

## Kurulum (her yeni oturumda)

```bash
apt-get install -y tesseract-ocr tesseract-ocr-tur poppler-utils
S=<scratchpad>; mkdir -p $S/araclar $S/ocr/sayfa $S/hazir
cp scripts/ocr/*.py scripts/ocr/*.sh $S/araclar/
cp scripts/ocr/bolumler_ornek_tts_mikro.py $S/araclar/bolumler.py   # sonra yeni kitaba göre düzenle
```

## Akış

1. **`bolumler.py`** — kitabın içindekiler sayfasından `(başlangıç sayfası, kitaptaki bölüm adı,
   uygulama konusu)` listesi ve `SON_SAYFA`. Her bölüm uygulamada ayrı set olur.
2. **`ocr_sayfa.sh <pdf> <pdf_sayfa> <kitap_sayfa> <çıkış>`** — sayfayı 300 dpi gri tona çevirir,
   yan sekmeyi kırpar, iki sütunu ayrı OCR'lar (`k001-L.txt`, `k001-R.txt`). Kırpma koordinatları
   TTS sayfa düzenine göre; yeni kitapta bir sayfa görüntüsüne bakıp ayarla.
   Paralel: `seq ... | xargs -P 8 -I{} ...`
3. **`ayristir.py`** — OCR satırlarından soruları çıkarır: numara, kök, A–E şıkları, "Doğru cevap"
   satırı. OCR harf karışıklıklarını (8→B, G/©/6→C, €/£/&→E, 0/O→D) düzeltir; "şöyle de
   sorulabilirdi" varyant kutularını ve sınav etiketi gürültüsünü atar.
4. **`bolum.py`** — bölüm bölüm çalışma: `goster` (bölümün sorularını kısaca listeler),
   `kontrol` (eksik numara, şık sayısı, cevapsız soru), `uret` (`hazir/NN.json`, `soru-ekle.ts`
   biçiminde). Şüpheli sorular sayfa görüntüsüyle kontrol edilip düzeltme dosyasıyla yamanır.
5. **`aciklama.py`** — her sorunun altındaki kitap açıklamasını çıkarır (`aciklamalar.json`),
   `hazir/*.json`'a eklenir.
6. `scripts/soru-ekle.ts` ile SQL üret ve çalıştır (CLAUDE.md).
7. **Açıklama görüntüleri** (tablo/şekil olduğu gibi, OCR hatası yok):
   - `ocr_tsv.sh <pdf> <pdf_sayfa> <kitap_sayfa> <scratchpad> [eşik]` — sütun PNG'lerini saklar,
     satır konumlu TSV üretir. **`OMP_THREAD_LIMIT=1` ver**, yoksa paralel tesseract kilitlenir.
     Eşikli OCR'lanan sayfalarda (gri zemin) 5. argüman `150`, `esik.py` gerekir.
   - `aciklama_gorsel.py <scratchpad>` — açıklamanın yerini bulur (son şıktan "Doğru cevap"
     satırına), sütun/sayfa geçişlerinde sütunu sonuna/başına kadar alır, iki sütuna yayılan
     tablo/şekli sütun arası boşluktaki mürekkepten tanıyıp tam genişlikte keser, varyant
     kutularını dışarıda bırakır → `gorsel/KK-no.webp`. Varsayılan 4 gri ton + kayıpsız WebP
     (ortalama ~32 KB; tam gri q50'de ~73 KB, okunurluk farkı yok). `GORSEL_TON=0` tam gri.
   - `gorsel_yukle.py <scratchpad> <proje_ref> <kaynak> <ders>` — `aciklamalar` deposuna
     `<soru_id>.webp` olarak yükler, `sorular.aciklama_gorsel`'i doldurur. Anahtarı yönetim
     API'sinden alır, yazdırmaz. Ortamın ağında `<proje_ref>.supabase.co` izinli olmalı.
     Yüklenmiş olanları atlar; tekrar çalıştırmak güvenli.
   - Metin katmanı olan PDF'lerde de aynı fikir geçerli: açıklama bölgesini sayfa
     görüntüsünden kesmek tabloları korur.

## Konu başlıkları değişince

**`yeniden_etiket.py`** — bir dersin mevcut sorularını yeni konu başlıklarına taşır: bire bir
eşleme, bölünen konularda anahtar kelime (kök → doğru şık → şıklar), belirsizleri
`inceleme.txt`'ye yazar; elle kararlar `elle.json`. Kurallar Mikrobiyoloji içindir, yeni derste
`BIRE_BIR` ve `B` sözlüklerini yeniden yaz.

## Soru kitabı (Meditus tarzı: soru → şıklar → açıklama → "Doğru cevap: X")

Meditus Mikrobiyoloji (6. baskı, 999 soru) böyle alındı. `<D>` = çalışma dizini (scratchpad).

1. **OCR:** `OMP_THREAD_LIMIT=1 KOLON_ARALIK=820,945 KENAR_BEYAZ=100,1690 python3 -I ocr_kolon.py <pdf> <sayfa> <D>/ocr`
   - `KOLON_ARALIK`: sütun arasının arandığı x aralığı (300 dpi px). Sütun arası 24 yatay bantta
     boş olan pencereden bulunur; iki sütuna yayılan tablolar artık yanıltmaz. Önce birkaç sayfada ölç.
   - `KENAR_BEYAZ`: metnin hiç girmediği dış şeritler; kenar sekmesi kırpılmaz, beyazlatılır
     (eski "yoğun kolon = sekme" ölçütü hizalı metnin sol kenarını ve çerçeve çizgilerini de kesiyordu).
   - Kesik sayfa kontrolü: kırpıntının kenarında mürekkep varsa (`pNNN-L.png` sol 4 px) sayfayı yeniden al.
2. **`meditus_yapi.py <D> <bolumler.json>`** → `yapi.json`. Bölümler PDF sayfa aralığıyla
   (`[{"no":1,"ad":"...","bas":5,"son":48}]`). Numara zinciri bölüm içinde; ilk hanesi taramada kesilen
   numaralar ("8." → 18) iki komşu soru arasındaki konumdan bulunur; açıklamadaki numaralı liste
   soru sanılmaz (gerçek soru cevap satırından sonra ya da sütun başında gelir). Rapor: eksik numara,
   cevapsız. Kitapta gerçekten olmayan numara olabilir (Meditus İmmünoloji 83).
3. **`meditus_soru.py <D>`** → `sorular.json`: şıklar sırayla A–E aranır (G)=C, €)=E, AJ=A),
   öncül (I. II. III.) kökleri yeniden numaralanır, OCR artıkları temizlenir. Sorunlu çıkanları
   `soru_kirp.py <D> <anahtarlar> <önek> [--siklar]` ile görüntüden oku, `elle_sik.json`,
   `elle_kok.json`, `sik_son.json`'a yaz. Romen rakamlı şıkları ("I ve III") her zaman görüntüden oku.
4. **`konu_tahmin.py <D>`**: etiketli sorulardan (`tts_etiket.json`: konu, alt_konu, metin, dogru, ac)
   en yakın komşu; TTS'te birini-dışarıda-bırak doğruluğu %83. Güveni < 0,5 olanları kök + doğru
   cevaptan elle kontrol et (`elle_konu.json`).
5. `soru-ekle.ts` ile bölüm bölüm ekle, sonra `aciklama_blok.py <D>` (blok açıklama),
   `meditus_aciklama.py <D> <b2_klasörü>` (yükleme listesi + update SQL) ve `b2_yukle.py`.
