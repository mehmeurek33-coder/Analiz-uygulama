# Soru Analiz — Claude için çalışma notları

Tek kişilik TUS soru çözme ve analiz uygulaması (Next.js + Supabase). Kullanıcı soru PDF'lerini
sohbete gönderir; Claude soruları ayrıştırıp veritabanına ekler, kullanıcı uygulamada çözer,
Claude istendiğinde sonuçları analiz eder. Uygulama içi Anthropic API ile yükleme isteğe bağlıdır
ve `ANTHROPIC_API_KEY` yoksa kapalıdır.

## Veritabanı erişimi

- Supabase projesi: **TıpAnaliz**, ref `lbprozrznswlyqwybenw` (eu-west-1)
- SQL çalıştırma (yönetim API'si, `postgres` rolüyle, RLS'i geçer):

  ```bash
  curl -sS -X POST "https://api.supabase.com/v1/projects/lbprozrznswlyqwybenw/database/query" \
       -H "Content-Type: application/json" -d @istek.json      # {"query": "..."}
  ```

- Erişim anahtarı ortamda kayıtlı ve proxy tarafından eklenir. `Authorization` başlığını sen
  ekleme, anahtarı hiçbir yere yazdırma. 401/403 alırsan kullanıcıya anahtarın geçersiz
  olabileceğini söyle.
- Şema: `supabase/schema.sql`. Analiz görünümü: `v_konu_performans`.

## PDF → soru aktarma

Kullanıcının hesabı yoksa (aşağıdaki sorgu boş dönerse) önce uygulamada ilk kurulumu yapmasını
iste. Sorular bir kullanıcıya bağlı olmak zorunda.

```sql
select id from auth.users order by created_at limit 1;
```

1. **Müfredatı oku:** `src/lib/mufredat.ts`. Etiketlemeden önce her seferinde güncel listeye bak.
2. **PDF'i oku:** Read aracı, `pages` ile en fazla 20 sayfa. Büyük kitabı parça parça işle.
3. **Her soruyu çıkar:**
   - Metni ve şıkları **birebir** aktar. Düzeltme, sadeleştirme, yeniden yazma yapma.
   - `numara` PDF'teki soru numarasıdır.
   - Sayfa sınırında kesilmiş ya da şıkları eksik soruyu bir sonraki parçada tamamla. Tamamlanamıyorsa atla ve kullanıcıya söyle.
   - Şekil, tablo veya görüntü varsa kökün sonuna köşeli parantez içinde kısa ve tarafsız bir tarif ekle. Cevabı ele veren tarif yazma.
4. **Etiketle:** `ders` ve `konu` müfredattan **harfi harfine**, `alt_konu` serbest. TUSDATA'nın 11 branş kuralları:
   - Nöroloji, Psikiyatri, Dermatoloji, Göz, KBB, Ortopedi, Üroloji, Radyoloji, Halk Sağlığı, Adli Tıp vb. → ders **Küçük Stajlar**, konu branşın adı
   - İç Hastalıkları = **Dahiliye**, Çocuk Sağlığı = **Pediatri**
   - Histoloji/Embriyoloji → **Anatomi**; tıbbi genetik/moleküler biyoloji → **Biyokimya**; immünoloji → **Mikrobiyoloji**
   - Hiçbir konu uymuyorsa konu `"Belirsiz"`
5. **Cevap anahtarı:** Varsa PDF'in kendi anahtarını kullan (genelde son sayfalarda). Yoksa
   kullanıcıdan iste. **Cevabı kendin çözüp yazma.** Yanlış anahtar bütün analizi bozar.
   Anahtar yoksa `dogru_cevap` boş kalır. `aciklama` alanına kitabın kendi açıklamasını koy; kitapta yoksa boş bırak.
6. **JSON'u scratchpad'e yaz.** Biçim `scripts/soru-ekle.ts` başındaki yorumda.
   - **Kaynağı, dersi ve bölümleri PDF'ten kendin çıkar** (kapak, iç kapak, sayfa başlıkları,
     içindekiler). Kullanıcıya sorma; yalnızca PDF'ten gerçekten anlaşılmıyorsa sor. Kullanıcıya
     verdiğin özette ne olarak tanıdığını yaz ki yanlışsa düzeltebilsin.
   - **Düzen ders → kaynak → bölüm.** Her yeni sette `kaynak` zorunlu (kitap/seri adı, aynı seride
     hep aynı yaz: `"Tüm TUS Soruları"`, `"Meditus"` ...). `ders` setin dersi (yoksa soruların en
     sık dersi alınır), `bolum_no` kitap içindeki sıra. Bölüm bölüm gelen kitapta her bölüm ayrı set.
   - Set adı `"<Kısa kaynak> <Ders> · NN Bölüm adı"` (örn. `"Meditus Farmakoloji · 03 Otonom"`);
     arayüz `·` sonrasını bölüm adı olarak gösterir, deneme geçmişinde tam ad görünür.
   - **Deneme sınavı PDF'leri** için JSON'a `"tur": "deneme"` ekle: sonuçlar ve açıklamalar test
     bitince açılır. Belirtilmezse set **soru bankası** olur: her cevap anında kontrol edilir,
     yanlışta açıklama otomatik açılır.
   - `aciklama` alanına kitabın o sorunun altındaki açıklamasını aktar (soru bankası modunda
     gösterilir); varyant kutularını ("şöyle de sorulabilirdi") alma.
   - **Açıklama görüntüsü de üret** (`scripts/ocr/README.md` adım 7): kullanıcı açıklamayı
     önce kitaptaki görüntüsüyle görür (tablo ve şekiller metne dökülemiyor, OCR hatalı olabiliyor);
     metin hâli ikinci planda. `sorular.aciklama_gorsel` = `aciklamalar` deposunda `<soru_id>.webp`.
7. **SQL'i üret ve çalıştır:**

   ```bash
   node --experimental-strip-types --no-warnings scripts/soru-ekle.ts \
        <girdi.json> <kullanici_id> > istek.json             # yeni set
   # büyük kitabın sonraki parçaları aynı sete:
   node --experimental-strip-types --no-warnings scripts/soru-ekle.ts \
        <parca2.json> <kullanici_id> --set <set_id> > istek.json
   ```

   Araç müfredat dışı etiketi, geçersiz şıkkı ve tekrar eden numarayı reddeder (hata verirse
   JSON'u düzelt). `--set` modunda aynı numaralı soru atlanır, yani tekrar çalıştırmak güvenlidir.
   Yanıt `set_id` ve `eklenen_soru` döndürür.
8. **Kullanıcıya özet ver:** eklenen soru sayısı, ders/konu dağılımı, anahtarsız ya da atlanan
   sorular. Panelde set "hazır" olarak görünür.

## Konu başlıkları: Şampiyonların Notu

Kullanıcı tekrarlarını TUSDATA **Şampiyonların Notu** kitaplarından yapıyor. Her dersin konu listesi
(`src/lib/mufredat.ts`) o dersin Şampiyonların Notu **içindekiler** sayfasına göre yazılır: başlıklar
kitaptaki sırayla ve yazımla, ana bölümler (`bolumler`, örn. Viroloji, Parazitoloji) korunur,
`kaynak: "Şampiyonların Notu"` işaretlenir. Kullanıcı kitapları zamanla edinip içindekiler
fotoğrafını gönderecek; gönderdiğinde:

1. `mufredat.ts`'te o dersin bloğunu yeni başlıklarla değiştir (Mikrobiyoloji bloğu örnek).
2. O dersteki mevcut soruları yeni başlıklara taşı: eski konu → yeni başlık bire bir eşleme,
   bölünen konularda anahtar kelime (kök, sonra doğru şık), kalanları tek tek okuyup elle ata.
   Kaldırılan geniş konu adı anlamlıysa `alt_konu`'da kalsın. Hepsini tek `update` ile yaz.
3. Ders sayfası konu listesini bölüm bölüm gösterir; soru düşmeyen başlıklar "soru yok" görünür.

Durum: **Mikrobiyoloji** güncel (6 bölüm, 73 başlık). Diğer 10 ders henüz genel liste.

## Yeni baskı geldiğinde (örn. TTS Mikrobiyoloji yeni baskı)

İlk aktarımın dersleri. Eski baskıyı yeniden tarama; yeni baskıyı şöyle al:

1. **PDF'i yokla:** `pdffonts` / `pdftotext -f 10 -l 10` ile metin katmanı var mı bak. Varsa OCR yok:
   metin ve konum `pdftotext -bbox-layout` ile birebir gelir, Türkçe karakter hatası olmaz.
   Taranmışsa `scripts/ocr/` hattı (tek geçiş: `ocr_tsv.sh` TSV'si hem metin hem konum verir,
   ayrı .txt OCR'ı gereksiz; `OMP_THREAD_LIMIT=1`). Sayfa düzeni değiştiyse kırpma koordinatlarını
   bir sayfa görüntüsünden yeniden ölç.
2. **İçindekiler → `bolumler.py`:** PDF'teki içindekiler sayfasından (ya da kullanıcının fotoğrafından).
   Kitap sayfası ↔ PDF sayfası kaymasını birkaç sayfa numarasından hesapla.
3. **Eski baskıyla eşleştir (asıl kazanç):** yeni sorunun kökünü eski 1492 soruyla benzerlikle eşle
   (aynı bölüm, `difflib` ≥ 0,85). Eşleşen soru: konu/alt_konu eski etiketten, doğruluk eski metinle
   kıyaslanır; yalnızca eşleşmeyen (yeni eklenen sınav soruları) ve cevabı farklı çıkanlar gözle
   kontrol edilir. İlk seferki tek tek görüntü doğrulaması böylece büyük ölçüde gereksiz.
4. **Yerinde güncelle, geçmişi koru:** eşleşen soruların `sorular` satırını (aynı id) yeni metin,
   açıklama ve görüntüyle güncelle ve yeni bölüm setine taşı; yeni sorular eklenir; yeni baskıda
   olmayan eski sorular silinmez, kullanıcıya sorulur. Böylece cevaplar, Yanlışlarım ve
   "emin değilim" kaybolmaz; görüntüler aynı `<soru_id>.webp` üzerine yazıldığı için depolama
   ikiye katlanmaz. Bunu yapmadan önce kullanıcıdan onay al.
5. **Açıklama görüntüleri aynı geçişte:** `aciklama_gorsel.py` + `gorsel_yukle.py`.

## Analiz ("analizimi yap")

Sorgular `v_konu_performans` üzerinde çalışır. Deneme modunda bitirilmiş denemelerin tüm cevapları
(işaretsiz = boş); soru bankası (anlık) modunda yalnızca cevaplanan sorular ve işaretlenmeden
açıklamasına bakılanlar (`aciklama_bakildi`, boş sayılır) ve bitirilen turda son cevaplanan sorudan
önce boş bırakılıp geçilenler (`bos_gecildi`, boş sayılır). Son cevaplanandan sonrakiler (hiç
ulaşılmamış) sayılmaz.

```sql
-- dönem özeti (son 7 gün; 30 gün için 29)
select sum(toplam) as soru, sum(dogru) as dogru, sum(yanlis) as yanlis, sum(bos) as bos,
       round(100.0 * sum(dogru) / nullif(sum(toplam), 0), 1) as oran
from v_konu_performans where gun >= current_date - 6;

-- en çok soru kaybedilen konular
select ders, konu, sum(toplam) as soru, sum(dogru) as dogru, sum(yanlis) as yanlis, sum(bos) as bos,
       round(100.0 * sum(dogru) / nullif(sum(toplam), 0)) as oran
from v_konu_performans where gun >= current_date - 29
group by ders, konu order by sum(yanlis) + sum(bos) desc limit 15;

-- haftalık trend, ders bazında
select date_trunc('week', gun)::date as hafta, ders, sum(toplam) as soru,
       round(100.0 * sum(dogru) / nullif(sum(toplam), 0)) as oran
from v_konu_performans group by 1, 2 order by 1, 2;

-- yanlışların alt konu dağılımı
select s.ders, s.konu, s.alt_konu, count(*) as yanlis
from cevaplar c join sorular s on s.id = c.soru_id join denemeler d on d.id = c.deneme_id
where d.bitti_at is not null and c.dogru is false
group by 1, 2, 3 order by 4 desc limit 20;

-- havuzdaki soru dağılımı
select ders, konu, count(*) as soru, count(*) filter (where dogru_cevap is null) as anahtarsiz
from sorular group by 1, 2 order by 1, 3 desc;
```

Raporlarken:
- Sırala: oran değil, **kaybedilen soru sayısı** (yanlış + boş). 2 soruda %0, 20 soruda %40'tan daha az önemlidir.
- 5 sorudan az veriyle hesaplanan oranı "henüz az veri" diye işaretle.
- Bantlar uygulamayla aynı: %70 ve üzeri iyi, %50-69 geliştirilmeli, %50 altı eksik.
- Boş ağırlıklıysa konu eksiği (tekrar et), yanlış ağırlıklıysa yanlış bilgi/çeldirici (soru çöz, çözümleri oku).
- Önceki dönemle kıyasla, somut bir sonraki adım öner.
- Konu önerisi için `v_konu_oncelik` (ustalık, açık hata, vadesi gelen, öncelik) ve tekrar yükü için
  `v_tekrar_vadesi` / `v_soru_durum` kullan; tek bir doğruyu "öğrenildi" diye yorumlama.

## Mevcut durum (her oturumda buradan devam et)

- **Canlı adres:** https://analiz-uygulama.vercel.app — Vercel projesi `prj_BgWUXNUwRwInDqCATPVq2fvcs9re`,
  GitHub `mehmeurek33-coder/Analiz-uygulama`, üretim dalı `claude/question-practice-analyzer-9xu016`.
  Bu dala push otomatik yayınlanır. Fonksiyon bölgesi `vercel.json` ile Dublin (`dub1`), veritabanına yakın.
- **Kullanıcının adresi: https://tusanaliz.mehmeurek33.workers.dev** — Türk operatörü `*.vercel.app`'i
  engelledi (21.11.2026, mobil veride ERR_CONNECTION_CLOSED; VPN ile açılıyor). Cloudflare Worker `tusanaliz`
  (kodu `cloudflare/worker.js`) istekleri Vercel'e iletir, yönlendirmelerdeki adresi geri yazar. Güncellemek için
  API anahtarı ortamda kayıtlı (api.cloudflare.com, "Edit Cloudflare Workers"):
  `PUT /client/v4/accounts/<id>/workers/scripts/tusanaliz` (multipart, `main_module`). workers.dev de engellenirse
  kalıcı çözüm kendi alan adı (Cloudflare'den alınıp Vercel'e bağlanır). Kullanıcıya link verirken bu adresi kullan.
- **Yüklü kitap:** TUSDATA Tüm TUS Soruları – Mikrobiyoloji, **36. baskıya güncellendi** (35. baskı
  soruları yerinde güncellendi, id'ler aynı; 33 yeni 2025 sorusu eklendi, `numara` boş): 72 bölüm, 1525 soru,
  1471'inde açıklama, 1430'unda blok açıklama (`aciklama_bloklar`). İlk eşleştirmede bulunamayan 66 eski
  sorunun 49'u yeni baskıda var (bölüm ilk soruları, şekilli kökler, bozuk eski kökler); 25'inin açıklaması yeni baskıdan
  güncellendi. 17'si kullanıcının yüklediği 36. baskı PDF'inde **eksik taranan sayfalarda** (kitap s. 61-62, 77-78 (76→79 atlıyor),
  109-110; bölüm 9 soru 15-19 ve 62-67, bölüm 13 soru 4-9): silinmedi, eski baskı metniyle duruyor. İlk aktarımdan
  kalan ~230 kesik/bozuk kök yeni baskı OCR'ından düzeltildi (eski metinler scratchpad `deney/kok_duzelt_son.json`,
  `kuyruk_geri.json`). Eşleştirme çıktıları scratchpad'de (`yeni/yapi.json`), araçlar `scripts/ocr/yeni_baski.py`,
  `aciklama_blok.py`.
- **Meditus Mikrobiyoloji** (6. baskı, "Tamamı Açıklamalı 1000 Güncel Soru", kitapta İmmünoloji 83 yok):
  6 set `Meditus Mikrobiyoloji · 0N <Bölüm>` (Temel Mikrobiyoloji, İmmünoloji, Bakteriyoloji, Mikoloji,
  Viroloji, Parazitoloji), 999 soru, 994'ünde blok açıklama (B2 klasörü `meditus-mikrobiyoloji/`).
  Metin OCR'dan (taranmış kitap): küçük yazım hataları olabilir, kitaptaki görüntü açıklamada var.
  Konular otomatik (TTS'ten en yakın komşu) + düşük güvenliler elle; kullanıcı yanlış etiket görürse düzelt.
  Akış: `scripts/ocr/README.md` "Soru kitabı" bölümü. Set adları `TTS Mikrobiyoloji · NN Bölüm adı`; ders `Mikrobiyoloji`, kaynak `Tüm TUS Soruları`.
  Yedek tablo `public.aktarim_bekleyen` (RLS açık, yetki yok); silinebilir ama zararı yok.
- **Düzen:** Panel = 11 ders kartı + tüm dersler için genel deneme (rastgele / öncelikli konular /
  yanlışlarım). `/ders/<Ders>` = o dersin istatistikleri, derse özel denemeler, kaynaklar (her kaynak
  ayrı katlanır liste, bölüm bölüm ilerleme) ve konu listesi (konu konu deneme). Setin yeri
  `soru_setleri.ders`, `kaynak`, `bolum_no` kolonlarından gelir.
- **Yanlışlarım (tekrar listesi, aralıklı tekrar):** hata yapılan sorular + doğru olsa da "emin değilim"
  işaretlenenler (`cevaplar.emin_degil`) + işaretlemeden açıklamasına bakılanlar
  (`cevaplar.aciklama_bakildi`, `/api/aciklama-bak`; soru kilitlenir) + test bitince boş bırakılıp
  geçilenler (`cevaplar.bos_gecildi`, bitir rotası yazar: deneme modunda tüm işaretsizler, soru
  bankasında son cevaplanandan öncekiler). Bir kez doğru yapmak soruyu düşürmez (aşağıda algoritma).
- **Tekrar ve öncelik algoritması** (göç 10-11, `src/lib/oncelik.ts`):
  - `v_cevap_olay`: sayılan her cevap; başarı 1 = emin doğru, 0,5 = doğru ama emin değil, 0 = yanlış/boş/bakıldı.
  - `v_soru_durum`: hiç hatası olmayan soru `bilinen`. Hatalı soru kutu 0; son hatadan sonraki emin
    doğrular FARKLI günlerde sayılır ve aralarında zaman geçmeli (kutu 3 için ≥4,5 gün, kutu 4 için ≥15 gün).
    Tekrar: kutu 0 hemen, 1 → 2 gün, 2 → 7 gün, 3 → 21 gün; kutu 4 öğrenildi. `acik_hata` = hatalı ve kutu < 4.
  - `v_tekrar_vadesi`: tekrar zamanı gelen açık hatalar → "Yanlışlarım" denemesi (düşük kutu önce).
  - `v_konu_oncelik` (göç 12): ustalık = (2 + Σw·başarı)/(4 + Σw), w = e^(−gün/30); önem = ln(1+konu sorusu)/
    ln(1+derste en büyük konu); güven = kanıt/(kanıt+4); öncelik = [önem·(1−ustalık)·(0,25+0,75·güven)
    + 0,10·√açık hata (≤0,3) + 0,08·√vadesi gelen (≤0,25)] / (1 + son 36 saatteki cevap/20)
    (+0,15·önem hiç çalışılmamışsa). Tek yanlış konuyu takıntı yapmasın diye: az kanıtta eksiklik
    küçük sayılır, hata katkısı karekökle azalır, yeni çok çalışılan konu geri çekilir ve denemede az
    çalışılmış konu en fazla max(3, 1,5×çözülen) soru alır. "Öncelikli konular" denemesi: çalışılmış en öncelikli 6 konu, soru payı
    öncelikle orantılı (`payDagit`); konu içinde sıra: vadesi gelen → hiç çözülmemiş → en eski bilinen.
    Hiç çözülmemişler kaynaklar arasında sırayla karışır (TTS, Meditus, ...).
    Konu denemesi ("Çöz") de aynı sırayla seçer. Panel ve ders sayfası bu listeyi ve ustalığı gösterir.
- **Tekrar çözüm:** `v_set_ilerleme` son tura ek olarak en çok soru çözülen bitmiş turu
  (`son_bitis_*`, `bitis_sayisi`) verir; tekrar turu yarıda kalsa da "Tamamlandı" görünür.
  Hiç soru çözülmeden bitirilen anlık tur kaydedilmez (bitir rotası siler, `silindi: true`).
- **Yedek:** Vercel cron (`vercel.json`, 3 günde bir 03:17 TR) → `GET /api/yedek` (`CRON_SECRET`) →
  `src/lib/yedek.ts`: her tablo `yedekler/<YYYY-MM-DD_HHmm>/<tablo>.json.gz` (gizli depo, son 10).
  `/yedek` sayfasında (üst menüde "Yedek") liste, indirme, "Şimdi yedekle". Geri yükleme: kullanıcı dosyaları gönderir,
  Claude JSON'dan `insert ... on conflict (id) do nothing` (ya da `do update`) SQL'i üretip çalıştırır;
  sıra: kullanici_profil, soru_setleri, sorular, denemeler, cevaplar.
- **İki mod** (`soru_setleri.tur`, `denemeler.anlik`):
  - Soru bankası (`calisma`, varsayılan): her şık anında kontrol edilir, cevap kilitlenir, yanlışta açıklama
    açılır. Anahtar ve açıklama sayfayla önceden gelir (anında geri bildirim), kayıt arka planda yapılır.
    Bölüm yarıda bırakılırsa "Devam et" aynı oturumu açar.
  - Deneme (`deneme`): sonuçlar ve açıklamalar "Bitir"den sonra; anahtar tarayıcıya hiç gönderilmez.
  - Hızlı denemeler (rastgele / öncelikli konular / yanlışlarım / konu) her zaman soru bankası modundadır.
- **Görünümler:** `v_konu_performans` (analiz, gün kırılımlı), `v_konu_toplam` (ders/konu tüm zamanlar),
  `v_konu_havuz` (ders/konu soru sayısı, en az bir kez çözülen, anahtarsız), `v_set_ilerleme` (her setin
  son oturumu: cevaplanan, doğru, bitti mi → "%x çözüldü" / "Tamamlandı").
- **Yetkiler:** Yeni tablo veya görünüm eklersen `authenticated` rolüne `grant` vermeyi unutma (bu projede
  otomatik verilmiyor; vermeyince panel boş görünür).
- **OCR hattı:** `scripts/ocr/` (yalnızca kod; README'de kurulum ve akış). Taranmış kitaplarda önce
  bunu kullan: sayfaları tek tek okumaktan çok daha az kota harcar. Metin katmanı olan PDF'lerde gerek yok.
- **Satır sınırı:** PostgREST bir istekte en fazla 1000 satır döndürür. Analiz için ham
  `v_konu_performans` çekme; `perf_konu(bas, son)` / `perf_gun(bas, son)` RPC'lerini kullan.
  Listeleri ders/set ile filtrele (`v_set_ilerleme.ders`, `v_ders_kaynak`, `v_son_cevap`).
- **Açıklama görüntüleri:** artık **Backblaze B2** (`GORSEL_DEPO=b2`, kova `tus-analiz`, `src/lib/b2.ts`);
  yükleme `POST /api/gorsel-yukle?yol=<ad>` (`x-yukleme-anahtari` başlığı = `YUKLEME_ANAHTARI`, değeri
  scratchpad'de `yukleme_anahtari`; araç `b2_yukle.py`), kaynak PDF'ler `GET /api/kaynak`. Açıklama blokları:
  `{t:"m",x}` metin + `{t:"g",yol,w,h,tur}` yalnızca kendisi kadar kırpılmış şekil/tablo; `aciklama_gorsel` tam
  hâli ("Kitaptaki hâlini göster"). **Kalite düşürülmez** (kullanıcı isteği, yer var): görseller
  `GORSEL_YUKSEK=1 aciklama_blok.py` ile tam çözünürlük + tam gri ton WebP q88 (~200 KB/parça; JSON'daki w/h
  ekran boyutu için eski ölçekte kalır). TTS + Meditus ≈ 650 MB, B2 ücretsiz 10 GB. B2 dolarsa Cloudflare R2
  (S3 uyumlu, 10 GB ücretsiz, çıkış ücretsiz) `src/lib/b2.ts` yanına ikinci depo olarak eklenebilir: yol
  önekine göre depo seçimi (ör. `r2:` önekli yollar R2'den imzalanır). Supabase `aciklamalar` deposundaki eski görüntüler silindi (21.11.2026, 1324 dosya; tüm
  yollar B2'de doğrulandı). Eski not: Yeni varsayılan
  4 gri ton kayıpsız: kitap başına ~40 MB. Metin katmanlı PDF'lerde metin zaten doğru: görüntüyü
  yalnızca tablo/şekil içeren açıklamalara üret. Böylece 33 kitap 1 GB'a sığar. Sığmazsa seçenekler:
  Cloudflare R2 / Backblaze B2 (10 GB ücretsiz) ya da Supabase Pro. Soru çözümü Claude kotası harcamaz.
- **Kapasite:** Supabase Free (500 MB veritabanı, 1 GB depolama, dosya başına 50 MB; 7 gün hiç
  kullanılmazsa proje duraklar, panelden "Restore" ile geri gelir; Supabase'in kendi yedeği yok, bizim
  yedeğimiz var). Soru başına ~2,5 KB. `sorular.json.gz` 50 MB'a yaklaşırsa yedeği parçala.

## Kurallar

- **Kullanıcıya bir sitede yapacağı adımları anlatırken her adıma doğrudan link ver** (ör. Vercel ortam
  değişkenleri: https://vercel.com/ben-6a2b/analiz-uygulama/settings/environment-variables).
  Kullanıcı mobilde, menü menü aramak zor.

- **PDF'leri ve çıkarılan soru metinlerini repoya commit etme.** Repo herkese açık, soru kitapları telif kapsamında. Geçici dosyalar scratchpad'e.
- Anahtar, şifre veya token yazdırma; `.env` dosyalarını commit etme.
- Uygulama kodunda yapılan değişiklikten sonra `npx tsc --noEmit` ve `npm run build` çalıştır.
  `scripts/` Next'in tip denetiminin dışında; aracı değiştirirsen ayrıca dene.
