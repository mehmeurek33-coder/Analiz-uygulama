# Soru Analiz — kendi kurulumun (bu dosyayı Claude Code'a yapıştır)

> **Kullanıcıya:** Bu dosyanın tamamını Claude Code oturumuna yapıştır ve "kurulumu yap" de. Senden yalnızca
> hesap açmanı, birkaç anahtarı güvenli formlara girmeni ve birkaç düğmeye basmanı isteyecek; her adım için
> doğrudan link verecek.

---

## Claude için: görev ve kurallar

Sen bu kullanıcı için **Soru Analiz** uygulamasının bağımsız bir kopyasını kuracaksın: TUS soru kitaplarından
soruları ayıklayıp veritabanına ekleyen, kullanıcının çözdüğü, konu konu analiz eden tek kişilik bir uygulama
(Next.js + Supabase + Vercel + Backblaze B2 + Cloudflare Worker). Kod hazır; altyapıyı kullanıcının kendi
hesaplarında kuracak, sonra kitaplarını işleyeceksin.

**Önemli:** Repodaki `CLAUDE.md` orijinal sahibinin kurulumuna göre yazıldı. Oradaki Supabase proje kimliği
(`lbprozrznswlyqwybenw`), adresler (`analiz-uygulama.vercel.app`, `tusanaliz...workers.dev`), Vercel proje
kimliği, B2 kova adı ve "Yüklü kitap" notları **başkasına ait — onlara asla istek atma**. Çalışma yöntemi,
kurallar, OCR hattı ve hata protokolleri ise aynen geçerli. Kurulumun sonunda (adım 9) `CLAUDE.md`'yi bu
kullanıcının değerleriyle güncelleyeceksin.

Kurallar (CLAUDE.md'deki gibi):
- Kullanıcı büyük olasılıkla telefondan bakıyor: bir sitede yapacağı her adım için **doğrudan link** ver, kısa yaz.
- **Anahtar, şifre, token yazdırma; sohbete yapıştırmasını isteme.** Ağ anahtarları için `request_credential`
  formunu, Vercel/Cloudflare'e girilecek değerler için ilgili sitenin ayar sayfasını kullan.
- **PDF'leri ve çıkarılan soru metinlerini repoya commit etme** (telif; repo herkese açık olabilir). Geçici her şey scratchpad'de.
- Kod değiştirirsen `npx tsc --noEmit` ve `npm run build`.
- Cevap anahtarını **kitaptan** al; soruyu kendin çözüp anahtar yazma.

---

## 1. Hesaplar (kullanıcı açar, hepsi ücretsiz planda yeterli)

Kullanıcıya sırayla, linkleriyle ver; her birinde ne yapacağını tek cümleyle söyle:

1. **GitHub** — repoyu kendi hesabına kopyalasın (fork): https://github.com/mehmeurek33-coder/Analiz-uygulama/fork
   Sonra bu oturuma kendi fork'unu ekle (`add_repo`, push erişimiyle). Çalışma dalını sen seç (ör. `main`).
2. **Supabase** — yeni proje: https://supabase.com/dashboard/new
   Bölge **West EU (Ireland) / eu-west-1** olsun (Vercel fonksiyonları `vercel.json`'da Dublin `dub1`; aynı
   bölge gecikmeyi düşürür). Veritabanı şifresini bir yere not etsin (sana söylemesin).
3. **Vercel** — https://vercel.com/new → GitHub fork'unu içe aktar (Framework: Next.js). Ortam değişkenlerini
   adım 4'te gireceğiz; ilk derleme hata verirse sorun değil.
4. **Backblaze B2** — https://www.backblaze.com/sign-up/cloud-storage
   - Kova: https://secure.backblaze.com/b2_buckets.htm → "Create a Bucket", **Private**, ad ör. `tus-<isim>`.
   - Uygulama anahtarı: https://secure.backblaze.com/app_keys.htm → "Add a New Application Key", yalnızca bu
     kovaya, Read and Write. `keyID` ve `applicationKey` bir kez gösterilir; adım 4'te Vercel'e girecek.
5. **Cloudflare** (yalnızca Türkiye'de mobil hatlar `*.vercel.app`'i engellediği için ara adres) —
   https://dash.cloudflare.com/sign-up → giriş yaptıktan sonra Workers & Pages'i bir kez açsın (workers.dev alt
   alan adı seçtirir): https://dash.cloudflare.com/?to=/:account/workers-and-pages
6. **Claude** — Claude Code için ücretli plan gerekli (Pro yeterli). Kurulum ve kitap işleme bittikten sonra
   plan kapatılsa da uygulama çalışmaya devam eder (adım 12).

---

## 2. Bu oturumun ağ erişimi ve anahtarları

`get_environment` ile ortamı oku. Gerekenler:
- **api.supabase.com** için Supabase kişisel erişim anahtarı (SQL çalıştırmak için yönetim API'si):
  kullanıcı https://supabase.com/dashboard/account/tokens adresinde "Generate new token" der;
  sen `request_credential` ile (host `api.supabase.com`, Bearer) formu açarsın. Anahtarı asla görmezsin, proxy ekler.
- **api.cloudflare.com** için Cloudflare API anahtarı: https://dash.cloudflare.com/profile/api-tokens →
  "Create Token" → "Edit Cloudflare Workers" şablonu. Yine `request_credential` (host `api.cloudflare.com`).
- İzinli ağ adresleri (gerekirse `update_environment` ile ekle): `<ref>.supabase.co`, `<proje>.vercel.app`,
  `<isim>.workers.dev`. Paket kayıtları (npm, PyPI, apt) varsayılan açıktır.
- OCR için: `apt-get install -y tesseract-ocr tesseract-ocr-tur poppler-utils` ve `pip install numpy pillow`.
  Bunları ortamın kurulum betiğine kaydetmeyi öner (her yeni oturumda tekrar kurulmasın).

Supabase proje kimliğini (`ref`) kullanıcıdan iste ya da `GET https://api.supabase.com/v1/projects` ile bul.

---

## 3. Veritabanı

1. `supabase/schema.sql` dosyasını yönetim API'siyle çalıştır:
   `POST https://api.supabase.com/v1/projects/<ref>/database/query` gövde `{"query": "..."}`.
   Dosya göç göç yazılmıştır ve tekrar çalıştırılabilir (`if not exists`); tek istekte hata verirse
   `-- ----` göç başlıklarından bölerek sırayla gönder. Sorguyu JSON'a Python ile yaz (kabukta `$$` ve tırnak sorun çıkarır).
2. Doğrula: tablolar (`kullanici_profil, soru_setleri, sorular, denemeler, cevaplar, soru_bildirimleri`),
   görünümler (`v_konu_performans, v_konu_oncelik, v_soru_durum, v_tekrar_vadesi, v_set_ilerleme` ...),
   depolar (`yedekler` gizli). **Her tablo/görünümde `authenticated` rolüne `grant` olmalı** — bu projede
   otomatik verilmiyor; eksikse panel boş görünür.
3. API anahtarlarını kullanıcı Vercel'e girecek: https://supabase.com/dashboard/project/<ref>/settings/api-keys
   (Project URL, anon/publishable, service_role/secret).

---

## 4. Vercel ortam değişkenleri

Kullanıcıya şu sayfayı ver: `https://vercel.com/<takım>/<proje>/settings/environment-variables` (takım/proje
adını sor ya da Vercel panelinden bulmasını iste). Girecekleri (Production + Preview):

| Değişken | Değer |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/publishable anahtarı |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role/secret anahtarı (yalnızca sunucuda kullanılır) |
| `SAHIP_EPOSTA` | Kullanıcının e-postası — ilk hesap yalnızca bununla açılabilir |
| `GORSEL_DEPO` | `b2` |
| `B2_KEY_ID`, `B2_APPLICATION_KEY` | Backblaze uygulama anahtarı |
| `B2_BUCKET` | Kova adı |
| `YUKLEME_ANAHTARI` | Rastgele uzun dize — görselleri uygulama üzerinden B2'ye yükleyen araçların parolası |
| `CRON_SECRET` | Rastgele uzun dize — 3 günde bir otomatik yedek için |
| `ANTHROPIC_API_KEY` | **İsteğe bağlı.** Uygulama içi "Yükle" sayfası (API ile otomatik ayrıştırma, ücretli). Boşsa kapalı. |

`YUKLEME_ANAHTARI` ve `CRON_SECRET` değerlerini sen üret, **sohbete yazma**:
`python3 -c "import secrets;print(secrets.token_hex(32))" > <scratchpad>/yukleme_anahtari` (CRON için ayrı dosya).
Kullanıcı scratchpad dosyalarını Claude uygulamasında açabilir: dosyanın tam yolunu ver, içeriğini kopyalayıp
Vercel'e yapıştırsın. Yükleme araçları (`b2_yukle.py`) anahtarı aynı dosyadan okur. Scratchpad oturum bitince
silinebilir; değeri kaybedersen yenisini üretip Vercel'de de güncelle.

Vercel → Settings → Git'te **Production Branch**'i senin push ettiğin dal yap; her push otomatik yayınlanır.
Değişkenlerden sonra yeniden dağıtım (Redeploy) gerekir.

---

## 5. Cloudflare Worker (ara adres)

`cloudflare/worker.js` istekleri Vercel'e iletir ve yönlendirme adreslerini geri yazar. Hedef adres Worker
ortam değişkeni `HEDEF`'ten okunur.
1. Hesap kimliği: `GET https://api.cloudflare.com/client/v4/accounts`.
2. Yükle: `PUT /client/v4/accounts/<id>/workers/scripts/<ad>` (multipart: `metadata` =
   `{"main_module":"worker.js","bindings":[{"type":"plain_text","name":"HEDEF","text":"https://<proje>.vercel.app"}],"compatibility_date":"2024-09-01"}`,
   `worker.js` = dosya, tür `application/javascript+module`).
3. workers.dev'de aç: `POST /client/v4/accounts/<id>/workers/scripts/<ad>/subdomain` `{"enabled":true}`.
4. Test: `https://<ad>.<altalan>.workers.dev/giris` 200 dönmeli; ikon ve `manifest.webmanifest` de 200
   (middleware bunları girişe yönlendirmiyor). Kullanıcıya **her zaman bu adresi** ver.

---

## 6. İlk hesap ve ana ekran

Kullanıcı `https://<ad>...workers.dev/giris` adresini açar, "İlk kurulum" ile `SAHIP_EPOSTA` adresiyle hesabını
açar (ilk hesaptan sonra kayıt kalıcı kapanır). Telefonda tarayıcı menüsünden "Ana ekrana ekle".
Doğrula: `select id from auth.users;` tek satır.

---

## 7. Yedek ve son kontrol

- Uygulamada üst menü **Yedek** → "Şimdi yedekle" çalışmalı (`yedekler/<tarih>/<tablo>.json.gz`).
- Vercel cron (`vercel.json`) 3 günde bir `GET /api/yedek` çağırır; `CRON_SECRET` gerekli.
- `npm ci && npx tsc --noEmit && npm run build` temiz geçmeli.

---

## 8. Kaynaklardan soru aktarma — dikkat edilecek her şey

Asıl iş burada. Genel protokol `CLAUDE.md` → "PDF geldiğinde: önce denetim" ve "PDF → soru aktarma";
araçlar `scripts/ocr/` (`README.md`'de akış). Hepsini oku. Aşağıdakiler bu kaynaklarda **gerçekten yaşanmış**
hatalardan çıkarıldı (ayrıntı: `docs/HATALAR.md`, her satırda neden ve önlem var).

### 8.1 Her PDF'te sıra (atlamadan)

1. **Sayfa denetimi** `pdf_denetim.py sayfa <pdf> <dizin>`: kaynak/ders tahmini, metin katmanı var mı, her sayfanın
   kitap numarası → **eksik / çift / boş / ters sayfa**. Taranmış kitaplarda sayfa atlanması sık (bir TTS taramasında
   3 aralık eksikti, açıklama başka sorunun cevabıyla karıştı). Eksik varsa kullanıcıya hemen söyle, fotoğrafını iste.
2. **Düzen ölçümü:** bir sayfa görüntüsüne bak; sütun arası (`KOLON_ARALIK`), kenar sekmesi (`KENAR_BEYAZ`),
   başlık şeridi. Kırpıntı kenarında mürekkep varsa metin kesilmiştir → ayarı düzelt.
3. **OCR** (`ocr_kolon.py` / `ocr_tsv.sh`, `OMP_THREAD_LIMIT=1`), **yapı** (`meditus_yapi.py` / `yeni_baski.py`),
   **soru denetimi** `pdf_denetim.py yapi <D>`: numara boşlukları, cevapsız, aynı numara, açıklaması eksik sayfayı aşan.
   Kitabın kapağındaki/içindekilerdeki toplam soru sayısıyla karşılaştır.
4. **Metin denetimi** `pdf_denetim.py metin <girdi.json>` — rapor boşalmadan ekleme. Yakaladıkları:
   bozuk +/- işaretleri, OCR artıkları, bitişik kelimeler, kutu/açıklama sızıntısı, aşırı uzun şık, kesik kök,
   bozuk Romen şıkları, aynı iki şık, harf karışıklıkları, %/°C/µm bozulmaları.
5. **Rakam kontrolü:** taranmış tek kaynakta `rakam_ikinci.py` (soru bölgesini 2× büyütüp ikinci OCR; farkları
   görüntüyle çöz). İki baskı varsa kökteki sayıları iki baskı arasında karşılaştır. Bulunan gerçek hatalar:
   "52 yaş"→32, "50 yaş üzeri"→30, HBIG "0.06 mL/kg"→0.006, "IL-1β"→"IL-18", "B19"→819, "H3N8"→H3NB.
6. **Açıklama görselleri** `GORSEL_YUKSEK=1 aciklama_blok.py` (tam çözünürlük, kalite düşürme), sonra
   **`bolunmus_sekil.py <blok_dizini>`**: sütun sonunda ikiye kesilmiş şekiller — aynı şekilse **tam sayfa
   görüntüsünden tek parça** kırp (iki parçayı yapıştırma, hiza bozuluyor). Kökte şekil/grafik varsa `soru_gorsel.py`.
7. **Anahtar:** "Doğru cevap: X" satırı; bozuk harfler (G/c/©/6→C, 8→B, 0/O→D, €/£/&→E) görüntüyle; açıklamadaki
   "Soruda X tanımlanmaktadır" ile anahtar uyumu (`anahtar_denetim.py`).
8. Ekle (`scripts/soru-ekle.ts`), sonra DB'de: set başına soru sayısı, anahtarsız 0, şık 5, boş şık 0, aynı iki şık,
   konu müfredatta. Görselleri `UYGULAMA_URL=https://<proje>.vercel.app b2_yukle.py` ile yükle; aynı adla tekrar
   yüklediysen `POST /api/b2-bakim {"islem":"eski_surumler"}` (B2 eski sürümleri saklar, yer kaplar).

### 8.2 OCR'ın bu kitaplarda HER ZAMAN bozduğu yerler (görüntüyle yaz)

- **Seroloji işaretleri:** "(+)" → (4) (\*) (1) (t); "(-)" → (9) (5) (<). Hepatit B sorularında anlam tamamen değişir.
- **"%"** → "96/95/90/92" + sayı ("eozinofil 9625" = %25, "966.5 NaCl" = %6.5); **"°C"** → "“C", "\*C", "9C";
  "+4 °C" → "\*4"; **µ/µm** → "u/um"; **mm³** → "mm3/mm9/mm“"; **BOS** → "8OS"; **CO₂** → "COJ"; "H₁N₁" → "H,N,".
- **Romen rakamları** (öncüller I.–V., "I ve III" şıkları, "MHC sınıf I/II", "Tip III"): "Il", "IN", "ili", "|", "LU", "Ni".
  **Asla tahminle yazma** — bir keresinde "MHC |" tahminle "II" yapıldı, kitapta "I" idi.
- **Altı çizili/vurgulu kelimeler:** tek "o", "Oo", "(" artığı, "oKelime" yapışması; "**değildir**" → "eğildir".
- **Bitişik kelimeler** ("Diyaresiolanvedışkiyaymasında"), **ortası düşen kökler** ("savunmasından ka sahiptir?").
- **Kök kesik kalır** ("... aşağıdakilerden i (Sonbahar 2001)"): kök "?" ya da sınav etiketiyle bitmeli.
- **Son şık + açıklama karışması:** son şıkka açıklamanın büyük harfli başlığı ya da ilk cümlesi yapışır
  ("Oseltamivir KIRIM-KONGO HEMORAJİK ATEŞİ \* Etken:"). Şık uzunluğu diğerlerinin ~2 katını aşıyorsa bak.
- **Alt satıra taşan son şık** kesilir; **iki sütunlu eşleştirme şıkları** (Etken — Tedavi) birbirine karışır;
  sütun başlığı kaybolur → şıkları "X — Y" yaz, başlığı köke "(Protozoon — Helmint)" diye ekle.
- **Şık işaretleri:** "A)" → "AJ/Aji", "C)" → "G)", "E)" → "€)/EY". İki şıklık satırlarda "B) ... GC) ..." tek şıkta kalır.
- **Harf karışıklıkları:** l/t/i/f, e/c, r/n ("Btastomyces", "Chfamydia", "Sirepfococcus", "tenfadenopati").
  Ama ö/o, ü/u, r/n farkı yazım varyantı ya da ek olabilir — kör değiştirme. İlaç kombinasyonlarında "\*" → "+".
- **Soru numarası:** tarama kenarı kesikse ilk hane kaybolur ("8." = 18); açıklamadaki numaralı liste
  ("1. Ökaryot 2. Prokaryot") soru başı sanılır. Gerçek soru ya cevap satırından sonra ya da sütun başında gelir.
- **Kitabın kendi hataları korunur:** aynı iki şık, "II ve IIII", "ilişkilimoleküler" gibi yazımlar (yalnızca boşluk
  düzeltilir). Düzeltmeden önce görüntüye bak: hata OCR'ın mı kitabın mı?

### 8.3 TUSDATA "Tüm TUS Soruları" (TTS)

- İki sütun, dış kenarda bölüm sekmesi. Sıra: soru numarası → kök → sınav etiketi → gri **"(DUS'ta sorulmaya uygun)"**
  kutusu → şıklar → açıklama → **"Doğru cevap: X"**. Gri kutu metni köke girmez.
- Sınav etiketleri: "(İlkbahar 2019 Orijinal)", "(Sonbahar 2017 BENZERİ)", "(Eylül-91)", birden çok sınav virgülle.
  OCR'da "rijinal", "dikbahar 2001", "(l 98", "İ 2018" olur; etiket bazen tümüyle düşer → görüntüden tamamla.
- **"Bu soru, başka bir hoca tarafından şöyle de sorulabilirdi:"** varyant kutusu: kendi şıkları ve **kendi "Doğru cevap"
  satırı** var — asıl soruya karıştırma, alma. (Bir soruda varyantın cevabı asıl soruya yazılmıştı.)
- "Doğru cevap" satırı OCR'da "Joğru/ığru/'oğru cevap" olur; bulunamazsa açıklama sonraki soruya taşar.
- Her bölümde numara 1'den başlar; her bölüm uygulamada ayrı set: `"TTS <Ders> · NN Bölüm adı"`,
  kaynak `"Tüm TUS Soruları"`. İçindekiler → `bolumler.py` (örnek: `bolumler_ornek_tts_mikro.py`). Kitap sayfası ↔
  PDF sayfası kaymasını birkaç sayfadan hesapla; kayma değişiyorsa sayfa eksik/çifttir.
- Yeni baskıda en yeni sınav soruları eklenir; eski baskı da işlenmişse eşleştir (CLAUDE.md "Yeni baskı geldiğinde").
- Konu etiketi: TTS bölümleri Şampiyonların Notu başlıklarına neredeyse bire bir denk gelir (örnek eşleme dosyada).
- Açıklamalarda tablo ve şemalar çok: blok açıklama (metin + yalnızca kendisi kadar kırpılmış şekil/tablo) şart.

### 8.4 Meditus ("Tamamı Açıklamalı ... Soru")

- İki sütun; sayfa numarası altta çizgili **"—— 26 ——"** biçiminde (`pdf_denetim.py` tanır). OCR ayarı ölç:
  300 dpi'da `KOLON_ARALIK=820,945`, `KENAR_BEYAZ=100,1690` iyi çalıştı; sütun arası 24 yatay bantta boş pencereden bulunur.
- Bölümler: Temel Mikrobiyoloji, İmmünoloji, Bakteriyoloji, Mikoloji, Viroloji, Parazitoloji; numara bölüm içinde.
  Kitapta bazı numaralar gerçekten yok olabilir (boşluğu görüntüyle teyit et, uydurma).
- Sıra: soru → şıklar → açıklama → "Doğru cevap: C". Açıklamada **"Soruda X tanımlanmaktadır"** cümlesi anahtarı
  doğrular. "sorulabilecek" geçen cümleler varyant kutusu **değil**.
- "Şekil Soru NN" başlıklı görsel kutular ve sütun sonuna denk gelen şekiller → `bolunmus_sekil.py`.
- Kitapta konu başlığı yok: önce TTS'i etiketli işle, sonra `konu_tahmin.py` (en yakın komşu, ~%83). Düşük güvenlileri
  kök + doğru şıktan elle kontrol et; ayrıca **ikinci görüş**: doğru şıktaki cins adının (Staphylococcus, Candida...)
  TTS'teki konu dağılımı ve setin bölümü. Uyuşmazlıkları elle karar ver ("hangi virüsün aşısı yoktur" →
  "Sterilizasyon" etiketi almıştı).

### 8.5 TUSDATA vaka soruları

- Birden çok sorunun paylaştığı vaka metni `sorular.vaka_metni`'ne; **aynı vakanın her sorusuna aynı metin**.
  Çözüm ekranı art arda aynı vakayı bir kez açık gösterir, karışık denemede aynı vakanın soruları art arda dizilir.
- Vakadaki grafi/tablo → `soru_gorsel` (B2 yolu), yüksek kalite, yalnızca şekil kadar kırpılmış.

### 8.6 Şampiyonların Notu (konu kitabı)

- Soru kitabı değil; **içindekiler** sayfası dersin konu listesidir (`src/lib/mufredat.ts`, Mikrobiyoloji örnek).
  Kullanıcı içindekiler fotoğrafı gönderince o dersin bloğunu yeniden yaz ve mevcut soruları yeni başlıklara taşı
  (CLAUDE.md "Konu başlıkları").

---

## 9. CLAUDE.md'yi bu kullanıcıya uyarla (kurulum bitince)

- "Veritabanı erişimi": kendi `ref`'i ve bölgesi.
- "Mevcut durum": canlı adres, Vercel proje/takım, GitHub fork ve dal, Worker adresi, B2 kova adı, Vercel ortam
  değişkenleri sayfasının doğrudan linki.
- Orijinal sahibin kitap notlarını ("Yüklü kitap", "Meditus Mikrobiyoloji" durum satırları, eksik sayfa listesi)
  sil; kendi işlediğin kitapları yaz. Genel yöntem ve kuralları koru.
- `docs/HATALAR.md`'yi koru, yeni hataları altına ekle. Commit + push.

---

## 10. Her oturumda

- Önce açık hata bildirimleri (`soru_bildirimleri`, CLAUDE.md'deki sorgu): kullanıcı çözerken "⚑ Hata bildir" ile
  not bırakır; görüntüyle kontrol et, düzelt, `cozuldu_at` yaz.
- "Analizimi yap" → CLAUDE.md'deki analiz sorguları (`v_konu_performans`, `v_konu_oncelik`).
- Büyük veri düzeltmesinden sonra güncel yedek al.

---

## 11. Bilinen altyapı tuzakları (önceden çözüldü, tekrar düşme)

- **`*.vercel.app` Türkiye'de mobil hatlarda engelli** → Worker adresi (adım 5). workers.dev de engellenirse kalıcı
  çözüm kendi alan adı (Cloudflare'den alınıp Vercel'e bağlanır).
- **Ana ekran simgesi kaybolursa:** `manifest.webmanifest` ve ikonlar middleware dışında olmalı (öyle; değiştirme).
- **PostgREST bir istekte en fazla 1000 satır** döndürür → sayfalı çek ya da RPC (`perf_konu`, `perf_gun`).
- **Yeni tablo/görünüm → `grant ... to authenticated`** yoksa panel boş.
- **`update ... from (values ...)`'ta aynı id iki kez** gelirse yalnız biri uygulanır → id başına tek satır.
- **Toplu regexp silmede `\S*`** önceki kelimeyi de yer; sonucu `returning` ile hemen oku. Her toplu düzeltmeden önce
  eski değerleri scratchpad'e JSON olarak kaydet (geri alma).
- **B2 eski sürümleri saklar** → yeniden yüklemeden sonra `/api/b2-bakim` temizliği.
- **Supabase ücretsiz planı 7 gün hiç kullanılmayan projeyi duraklatır** → panelden "Restore" (veri kaybolmaz).

---

## 12. Claude planı bitince

Uygulama Claude'a bağlı değil; Vercel, Supabase, B2 ve Cloudflare'in ücretsiz planlarında çalışmaya devam eder:
soru çözme, Yanlışlarım/aralıklı tekrar, öncelikli konular, istatistikler, otomatik yedek. Yapılamayanlar: yeni PDF
eklemek, hata bildirimlerini düzeltmek, sohbette analiz yorumu. Yeni kitap gerekince plan bir aylığına açılabilir ya da
`ANTHROPIC_API_KEY` ile uygulama içi "Yükle" sayfası kullanılabilir (kullandıkça ücretli, kalite daha düşük:
açıklama görüntüsü ve OCR denetimi yok). Kullanıcıya planı kapatmadan önce elindeki bütün PDF'leri işletmesini öner.
