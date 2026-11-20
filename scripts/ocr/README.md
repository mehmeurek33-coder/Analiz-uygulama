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
