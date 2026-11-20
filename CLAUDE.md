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
   - **Deneme sınavı PDF'leri** için JSON'a `"tur": "deneme"` ekle: sonuçlar ve açıklamalar test
     bitince açılır. Belirtilmezse set **soru bankası** olur: her cevap anında kontrol edilir,
     yanlışta açıklama otomatik açılır.
   - `aciklama` alanına kitabın o sorunun altındaki açıklamasını aktar (soru bankası modunda
     gösterilir); varyant kutularını ("şöyle de sorulabilirdi") alma.
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

## Analiz ("analizimi yap")

Sorgular `v_konu_performans` üzerinde çalışır. Yalnızca bitirilmiş denemeler sayılır.

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

## Kurallar

- **PDF'leri ve çıkarılan soru metinlerini repoya commit etme.** Repo herkese açık, soru kitapları telif kapsamında. Geçici dosyalar scratchpad'e.
- Anahtar, şifre veya token yazdırma; `.env` dosyalarını commit etme.
- Uygulama kodunda yapılan değişiklikten sonra `npx tsc --noEmit` ve `npm run build` çalıştır.
  `scripts/` Next'in tip denetiminin dışında; aracı değiştirirsen ayrıca dene.
