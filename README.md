# Soru Analiz

Soru PDF'lerini yükle → Claude soruları tek tek ayırıp **ders/konu** etiketler → işaretleyerek çöz
(doğru-yanlış test bitene kadar gizli) → **günlük / haftalık / aylık** analizde hangi dersin hangi
konusunda eksik olduğunu gör.

TUS müfredatı hazır gelir (Anatomi, Fizyoloji, Farmakoloji, Dahiliye, Pediatri, Küçük Stajlar...).

---

## Nasıl çalışır?

| Adım | Ne olur |
|---|---|
| 1. PDF yükle | PDF, Supabase Storage'a özel (private) olarak yüklenir. |
| 2. Cevap anahtarı | Elle yapıştırabilirsin; yapıştırmazsan PDF'in **son 2 sayfasından** otomatik okunmaya çalışılır. |
| 3. Ayrıştırma | PDF **4 sayfalık parçalara** bölünüp Claude'a gönderilir. Her parça ayrı istek olduğu için uzun PDF'ler sunucu zaman aşımına takılmaz, ekranda ilerleme çubuğu görünür. |
| 4. Çözme | Sorular tek tek gelir, şıkka tıklarsın. **Doğru cevap, sen "Testi bitir" diyene kadar tarayıcıya hiç gönderilmez** (sunucu sorguları `dogru_cevap` alanını bilerek seçmez). |
| 5. Sonuç | Doğru/yanlış/boş, net, konu dağılımı ve soru soru inceleme. |
| 6. Analiz | Gün/hafta/ay filtreli trend grafiği, ders ve konu kırılımı, "eksik olduğun konular" listesi. O konulardan tek tuşla yeni deneme başlatılır. |

### Analiz ekranında ne var?

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
4. **Authentication → Sign In / Providers → Email** → **"Confirm email" seçeneğini KAPAT.**
   Böylece kimseye doğrulama maili gitmez, hesaplar anında açılır.
5. **Project Settings → API** sayfasından şunları kopyala:
   - `Project URL`
   - `anon public` anahtarı
   - `service_role` anahtarı (**gizli**, sadece sunucuda kullanılır)

### 2) Anthropic API anahtarı al

Claude aboneliği ile API faturası **ayrıdır**, bu yüzden ayrı bir anahtar gerekir:

1. [console.anthropic.com](https://console.anthropic.com) → hesabınla giriş yap
2. **Billing** → kredi kartı ekle / kredi yükle (başlangıç için 5-10 $ fazlasıyla yeter)
3. **API Keys** → **Create Key** → anahtarı kopyala (`sk-ant-...`), bir daha gösterilmez

**Maliyet:** varsayılan model `claude-opus-5-5` ($4 / 1M girdi, $20 / 1M çıktı token).
40 sayfalık bir soru kitapçığı yaklaşık **0,5-1 $** tutar. Ucuzlatmak istersen
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
ANTHROPIC_API_KEY=sk-ant-...
IZINLI_EPOSTALAR=sen@ornek.com,arkadas@ornek.com
```

`IZINLI_EPOSTALAR` boş bırakılırsa herkes kayıt olabilir; e-posta yazarsan **sadece o adresler**
hesap açabilir. (Kayıt, sunucu tarafında bu listeye bakılarak yapılır.)

### 4) Yayına al (Vercel)

1. [vercel.com](https://vercel.com) → **Add New → Project** → bu GitHub reposunu seç
2. **Environment Variables** bölümüne yukarıdaki 5 değişkeni ekle
3. **Deploy**

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
```

## Güvenlik

- Her tablo **RLS** ile korunur: herkes yalnızca kendi setini, sorusunu, cevabını görür.
- PDF kovası özeldir; dosyalar `<kullanıcı-id>/...` klasörüne yazılır, başkası okuyamaz.
- `service_role` anahtarı yalnızca sunucu tarafında kullanılır, tarayıcıya hiç gitmez.

## Bilinen sınırlar

- Taranmış (görüntü) PDF'lerde metin kalitesi Claude'un okumasına bağlıdır; çok bozuk taramalarda
  soru atlanabilir. Panelde set durumundan kaç soru çıktığını görürsün.
- Cevap anahtarı bulunamayan sorular çözülebilir ama orana katılmaz; sonuç ekranında uyarı çıkar.
- Vercel ücretsiz planda sunucu fonksiyonu 60 saniye ile sınırlıdır; bu yüzden PDF parça parça
  işlenir. Çok uzun PDF'lerde sayfadan ayrılma.
