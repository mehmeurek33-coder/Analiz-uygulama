# Soru Analiz

Soru PDF'lerini yükle → Claude soruları tek tek ayırıp **ders/konu** etiketler → işaretleyerek çöz
(doğru-yanlış test bitene kadar gizli) → **günlük / haftalık / aylık** analizde hangi dersin hangi
konusunda eksik olduğunu gör.

**Tek kişilik uygulama.** İlk açılışta kendi hesabını oluşturursun; sonrasında kayıt kalıcı
olarak kapanır. API maliyeti yalnızca senin yüklediğin PDF'ler kadar olur.

Müfredat **TUSDATA'nın 11 branş yapısına** göre hazır gelir:

| Temel Bilimler (6 branş) | Klinik Bilimler (5 branş) |
|---|---|
| Anatomi, Fizyoloji, Biyokimya, Mikrobiyoloji, Patoloji, Farmakoloji | Dahiliye, Pediatri, Genel Cerrahi, Kadın Doğum, Küçük Stajlar |

Toplam 191 konu başlığı. Histoloji-embriyoloji Anatomi'nin, tıbbi genetik ve moleküler
biyoloji Biyokimya'nın, immünoloji Mikrobiyoloji'nin altında konu olarak yer alır; Nöroloji,
Psikiyatri, Dermatoloji, Göz, KBB, Ortopedi, Üroloji gibi branşlar **Küçük Stajlar**ın konularıdır
(TUSDATA'nın kendi ayrımı). Claude bir soruyu "Nöroloji" dersi diye etiketlemeye kalkarsa
otomatik olarak Küçük Stajlar → Nöroloji'ye çekilir, kaybolan başlık alt konu olarak saklanır.

Değiştirmek istersen tek dosya: `src/lib/mufredat.ts`.

---

## Soruları ekleme: iki yol

**1. Claude ile (varsayılan, API anahtarı gerekmez).** Soru PDF'ini Claude Code oturumuna
gönderirsin; Claude soruları birebir çıkarır, TUSDATA müfredatına göre etiketler ve
`scripts/soru-ekle.ts` ile doğrudan veritabanına ekler. Ayrıştırma Claude aboneliğinden gider,
API faturası çıkmaz. Yöntemin tamamı ve analiz sorguları `CLAUDE.md` içinde; yeni bir oturum da
aynı kuralları uygular.

**2. Uygulama içinden (isteğe bağlı).** `ANTHROPIC_API_KEY` tanımlarsan menüde "PDF Yükle"
çıkar ve PDF'i kendin yüklersin. Kullandıkça ödersin (aşağıda maliyet). Anahtar yoksa bu ekran
gizlenir.

Çözme, sonuç ve analiz ekranları iki yolda da aynıdır ve hiç token harcamaz.

## Uygulama içi yükleme nasıl çalışır?

| Adım | Ne olur |
|---|---|
| 1. PDF yükle | PDF, Supabase Storage'a özel (private) olarak yüklenir. |
| 2. Cevap anahtarı | Elle yapıştırabilirsin; yapıştırmazsan PDF'in **son 2 sayfasından** otomatik okunmaya çalışılır. |
| 3. Ayrıştırma | PDF **4 sayfalık parçalara** bölünüp Claude'a gönderilir. Her parça ayrı istek olduğu için uzun PDF'ler sunucu zaman aşımına takılmaz, ekranda ilerleme çubuğu görünür. |
| 4. Çözme | Sorular tek tek gelir, şıkka tıklarsın. **Doğru cevap, sen "Testi bitir" diyene kadar tarayıcıya hiç gönderilmez** (sunucu sorguları `dogru_cevap` alanını bilerek seçmez). |
| 5. Sonuç | Doğru/yanlış/boş, net, konu dağılımı ve soru soru inceleme. |
| 6. Analiz | Gün/hafta/ay filtreli trend grafiği, ders ve konu kırılımı, "eksik olduğun konular" listesi. O konulardan tek tuşla yeni deneme başlatılır. |

## Analiz ekranında ne var?

- **Dönem karşılaştırması** — "%60 doğru · ▲ +11 puan geçen haftaya göre"
- **Önce şunlara çalış** — en çok soru kaybettiğin 3 konu, her biri için duruma göre somut
  tavsiye (boş bıraktıysan "önce tekrar et", çeldiriciye düştüysen "yanlışlarının çözümünü oku")
  ve o konudan tek tuşla 20 soruluk deneme
- **Günlere göre doğru oranı** — üzerine gelince gün gün değer veren çizgi grafik, tablo görünümü de var
- **Çalışma takvimi** — son 12 haftanın yoğunluk haritası (GitHub katkı grafiği gibi)
- **Derslere / konulara göre** — renk + simge + sayı birlikte, renk körlüğünde de okunur
- **En çok vakit alan konular** — soru başına ortalama süre
- **Etiket düzeltme** — Claude bir soruyu yanlış derse koyduysa ya da cevap anahtarı eksikse
  sonuç ekranından düzeltirsin; anahtar değişirse geçmiş cevaplar **yeniden puanlanır**

---

## Kurulum

### 1) Supabase projesi aç

1. [supabase.com](https://supabase.com) → **New project**
2. İsim: `soru-analiz`, bölge: **Frankfurt (eu-central-1)**, veritabanı şifresini bir yere kaydet.
3. Proje açılınca sol menüden **SQL Editor** → **New query** → `supabase/schema.sql` dosyasının
   tamamını yapıştır → **Run**. (Tabloları, güvenlik kurallarını, PDF kovasını ve analiz
   görünümünü kurar. Tekrar çalıştırmak zararsızdır.)
4. **Authentication → Sign In / Providers**:
   - **"Confirm email" KAPALI** olsun → doğrulama maili beklemeden hesabın anında açılır.
   - **"Allow new users to sign up" KAPALI** olsun → bu önemli: `anon` anahtarı tarayıcıya
     gittiği için, açık bırakılırsa biri doğrudan Supabase'e kayıt olup uygulamaya girebilir
     ve senin API kredinle PDF ayrıştırabilir. Kapalıyken tek hesap, uygulamanın ilk kurulum
     ekranından (`/api/kayit`, yalnızca hiç hesap yokken çalışır) açılır.
5. **Project Settings → API** sayfasından şunları kopyala:
   - `Project URL`
   - `anon public` anahtarı
   - `service_role` anahtarı (**gizli**, sadece sunucuda kullanılır)

### 2) (İsteğe bağlı) Anthropic API anahtarı

Yalnızca uygulama içinden PDF yüklemek istersen gerekir; soruları Claude ile ekliyorsan bu adımı
atla. Claude aboneliği ile API faturası **ayrıdır**:

1. [console.anthropic.com](https://console.anthropic.com) → hesabınla giriş yap
2. **Billing** → kredi kartı ekle / kredi yükle (başlangıç için 5-10 $ fazlasıyla yeter)
3. **API Keys** → **Create Key** → anahtarı kopyala (`sk-ant-...`), bir daha gösterilmez

**Maliyet:** varsayılan model `claude-opus-5-5` ($4 / 1M girdi, $20 / 1M çıktı token).
Kabaca sayfa başına 2-3 sent; 40 sayfalık bir kitapçık yaklaşık **1-1,5 $** tutar. Ucuzlatmak istersen
`ANTHROPIC_MODEL=claude-sonnet-5-5` yazman yeterli (yaklaşık yarı fiyat).
Ayrıştırma **bir kez** yapılır; çözme ve analiz hiç token harcamaz.

### 3) Çalıştır

```bash
cp .env.example .env.local     # ve içini doldur
npm install
npm run dev                    # http://localhost:3000
```

`.env.local` içeriği:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SAHIP_EPOSTA=sen@ornek.com
# ANTHROPIC_API_KEY=sk-ant-...   (isteğe bağlı: uygulama içi PDF yükleme)
```

`SAHIP_EPOSTA` isteğe bağlıdır. Yazarsan, ilk kurulumda hesap **yalnızca o adresle** açılabilir;
yayına aldığın an ile hesabını oluşturduğun an arasında başkasının araya girmesini önler.

### İlk giriş

Uygulamayı ilk açtığında giriş ekranı yerine **"İlk kurulum: kendi hesabını oluştur"** formu
gelir. Hesabını oluşturduktan sonra bu form bir daha görünmez, `/api/kayit` ucu da kalıcı
olarak kapanır. Oturum tarayıcıda hatırlanır, sık sık şifre girmen gerekmez.

### 4) Yayına al (Vercel)

1. [vercel.com](https://vercel.com) → **Add New → Project** → bu GitHub reposunu seç
2. **Environment Variables** bölümüne yukarıdaki değişkenleri ekle
3. **Deploy**, ardından hemen siteyi açıp hesabını oluştur

Telefondan açıp **ana ekrana ekle** dersen uygulama gibi tam ekran açılır (PWA olarak kuruldu:
ikon, tema rengi ve manifest hazır). Arayüz mobil öncelikli tasarlandı; bilgisayarda çözerken
**A-E tuşlarıyla şık işaretleyip ok tuşlarıyla** soru değiştirebilirsin.

---

## Dosya düzeni

```
supabase/schema.sql          veritabanı + güvenlik kuralları + analiz görünümü
src/lib/mufredat.ts          TUS ders/konu ağacı  ← konu eklemek için burayı düzenle
src/lib/anthropic.ts         Claude çağrıları (soru çıkarma + cevap anahtarı okuma)
src/lib/analiz.ts            gün/ders/konu özetleri, oran bantları
src/app/api/setler           PDF kaydı, sayfa sayısı, cevap anahtarı tespiti
src/app/api/ayristir         tek parçayı işler (istemci sırayla çağırır)
src/app/api/deneme           deneme oluşturma (tümü / rastgele / zayıf konu / yanlışlarım)
src/app/api/deneme/[id]/bitir  puanlama — doğru cevaplar sadece burada açılır
src/app/deneme/[id]          çözme ekranı
src/app/sonuc/[id]           sonuç ve soru soru inceleme
src/app/analiz               günlük / haftalık / aylık analiz
scripts/soru-ekle.ts         Claude'un çıkardığı soruları veritabanına ekleyen araç
CLAUDE.md                    Claude için yöntem: PDF aktarma kuralları, analiz sorguları
```

## Güvenlik

- Her tablo **RLS** ile korunur: veriler hesaba bağlıdır, oturum açmadan hiçbir şey okunamaz.
- PDF kovası özeldir; dosyalar `<kullanıcı-id>/...` klasörüne yazılır, başkası okuyamaz.
- `service_role` anahtarı yalnızca sunucu tarafında kullanılır, tarayıcıya hiç gitmez.
- Supabase'de genel kayıt kapalıdır; tek hesap ilk kurulumda açılır, sonra `/api/kayit`
  kalıcı olarak 403 döner.

## Bilinen sınırlar

- Taranmış (görüntü) PDF'lerde metin kalitesi Claude'un okumasına bağlıdır; çok bozuk taramalarda
  soru atlanabilir. Panelde set durumundan kaç soru çıktığını görürsün.
- Cevap anahtarı bulunamayan sorular çözülebilir ama orana katılmaz; sonuç ekranında uyarı çıkar.
- Vercel ücretsiz planda sunucu fonksiyonu 60 saniye ile sınırlıdır; bu yüzden PDF parça parça
  işlenir. Çok uzun PDF'lerde sayfadan ayrılma.
