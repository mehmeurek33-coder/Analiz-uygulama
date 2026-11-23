-- =====================================================================
--  Soru Analiz  -  Supabase sema kurulumu
--  Kullanim: Supabase panelinde SQL Editor > New query > bu dosyayi
--  yapistir > Run.  Tekrar calistirilabilir (idempotent).
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- profil
create table if not exists public.kullanici_profil (
  id          uuid primary key references auth.users(id) on delete cascade,
  ad          text,
  created_at  timestamptz not null default now()
);

-- Yeni kullanici kayit olunca profil satiri olustur
create or replace function public.yeni_kullanici_profili()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.kullanici_profil (id, ad)
  values (new.id, coalesce(new.raw_user_meta_data->>'ad', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_yeni_kullanici on auth.users;
create trigger trg_yeni_kullanici
  after insert on auth.users
  for each row execute function public.yeni_kullanici_profili();

-- ------------------------------------------------------------ soru setleri
-- Yuklenen her PDF bir "soru seti"dir.
create table if not exists public.soru_setleri (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  ad             text not null,
  dosya_yolu     text,                      -- storage: pdfler/<user_id>/<...>.pdf
  sayfa_sayisi   int  not null default 0,
  parca_sayisi   int  not null default 0,   -- kac parcada islenecek
  islenen_parca  int  not null default 0,
  soru_sayisi    int  not null default 0,
  cevap_anahtari text,                      -- "1-A 2-C ..." serbest metin
  durum          text not null default 'kuyrukta'
                 check (durum in ('kuyrukta','isleniyor','hazir','hata')),
  hata           text,
  created_at     timestamptz not null default now()
);
create index if not exists soru_setleri_user_idx on public.soru_setleri(user_id, created_at desc);

-- ------------------------------------------------------------------ sorular
create table if not exists public.sorular (
  id           uuid primary key default gen_random_uuid(),
  set_id       uuid not null references public.soru_setleri(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  numara       int,                        -- PDF uzerindeki soru numarasi
  sira         int  not null default 0,    -- set icindeki sira
  metin        text not null,
  secenekler   jsonb not null default '{}'::jsonb,   -- {"A":"...","B":"..."}
  dogru_cevap  text,                       -- 'A'..'E'
  ders         text,
  konu         text,
  alt_konu     text,
  zorluk       text check (zorluk is null or zorluk in ('kolay','orta','zor')),
  aciklama     text,                       -- Claude'un kisa cozum notu
  created_at   timestamptz not null default now()
);
create index if not exists sorular_set_idx  on public.sorular(set_id, sira);
create index if not exists sorular_user_idx on public.sorular(user_id);
create index if not exists sorular_konu_idx on public.sorular(user_id, ders, konu);

-- ---------------------------------------------------------------- denemeler
create table if not exists public.denemeler (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  set_id      uuid references public.soru_setleri(id) on delete set null,
  ad          text not null,
  soru_sayisi int  not null default 0,
  basladi_at  timestamptz not null default now(),
  bitti_at    timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists denemeler_user_idx on public.denemeler(user_id, created_at desc);

-- ----------------------------------------------------------------- cevaplar
-- Deneme olusurken her soru icin bir satir acilir (isaretlenen = null).
create table if not exists public.cevaplar (
  id            uuid primary key default gen_random_uuid(),
  deneme_id     uuid not null references public.denemeler(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  soru_id       uuid not null references public.sorular(id) on delete cascade,
  sira          int  not null default 0,
  isaretlenen   text,                      -- 'A'..'E' veya null (bos)
  dogru         boolean,                   -- deneme bitince hesaplanir
  sure_sn       int  not null default 0,
  cevaplandi_at timestamptz,
  unique (deneme_id, soru_id)
);
create index if not exists cevaplar_deneme_idx on public.cevaplar(deneme_id, sira);
create index if not exists cevaplar_user_idx   on public.cevaplar(user_id, cevaplandi_at desc);

-- ====================================================================
--  RLS  -  herkes yalnizca kendi verisini gorur
-- ====================================================================
alter table public.kullanici_profil enable row level security;
alter table public.soru_setleri     enable row level security;
alter table public.sorular          enable row level security;
alter table public.denemeler        enable row level security;
alter table public.cevaplar         enable row level security;

do $$
declare
  t text;
  p text;
begin
  foreach t in array array['kullanici_profil','soru_setleri','sorular','denemeler','cevaplar']
  loop
    for p in
      select policyname from pg_policies where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', p, t);
    end loop;
  end loop;
end $$;

create policy "kendi profilini gorur" on public.kullanici_profil
  for select using (auth.uid() = id);
create policy "kendi profilini gunceller" on public.kullanici_profil
  for update using (auth.uid() = id);

create policy "kendi setleri" on public.soru_setleri
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "kendi sorulari" on public.sorular
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "kendi denemeleri" on public.denemeler
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "kendi cevaplari" on public.cevaplar
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Tablo yetkileri: yeni Supabase projeleri public semadaki yeni tablolara
-- anon/authenticated icin otomatik yetki vermiyor. RLS satirlari suzer,
-- ama once rolun tabloya erisim yetkisi olmali. anon'a bilerek yetki verilmez.
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete
  on public.soru_setleri, public.sorular, public.denemeler, public.cevaplar
  to authenticated;
grant select, update on public.kullanici_profil to authenticated;
grant all
  on public.soru_setleri, public.sorular, public.denemeler, public.cevaplar, public.kullanici_profil
  to service_role;

-- ====================================================================
--  Storage  -  PDF'ler icin ozel kova
-- ====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pdfler', 'pdfler', false, 33554432, array['application/pdf'])
on conflict (id) do update
  set file_size_limit = 33554432,
      allowed_mime_types = array['application/pdf'],
      public = false;

do $$
declare p text;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'pdfler %'
  loop
    execute format('drop policy %I on storage.objects', p);
  end loop;
end $$;

-- Dosya yolu her zaman <user_id>/... seklinde olmali
create policy "pdfler yukleme" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'pdfler' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "pdfler okuma" on storage.objects
  for select to authenticated
  using (bucket_id = 'pdfler' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "pdfler silme" on storage.objects
  for delete to authenticated
  using (bucket_id = 'pdfler' and (storage.foldername(name))[1] = auth.uid()::text);

-- ====================================================================
--  Calisma modu ve analiz gorunumu
-- ====================================================================
-- Calisma modu: soru bankasi (anlik geri bildirim) / deneme (sonuclar sonda)
alter table public.soru_setleri add column if not exists tur text not null default 'calisma';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'soru_setleri_tur_kontrol') then
    alter table public.soru_setleri add constraint soru_setleri_tur_kontrol check (tur in ('calisma', 'deneme'));
  end if;
end $$;
alter table public.denemeler add column if not exists anlik boolean not null default false;

-- Analiz: bitmis denemeler + anlik modda cevaplanmis sorular (deneme bitmese de sayilir)
create or replace view public.v_konu_performans
with (security_invoker = true) as
select
  c.user_id,
  d.id                                   as deneme_id,
  date_trunc('day', coalesce(case when d.anlik then c.cevaplandi_at end, d.bitti_at, d.basladi_at))::date as gun,
  coalesce(s.ders, 'Belirsiz')           as ders,
  coalesce(s.konu, 'Belirsiz')           as konu,
  s.alt_konu,
  count(*)                               as toplam,
  count(*) filter (where c.dogru is true)                        as dogru,
  count(*) filter (where c.dogru is false and c.isaretlenen is not null) as yanlis,
  count(*) filter (where c.isaretlenen is null)                  as bos,
  round(avg(c.sure_sn)::numeric, 1)      as ort_sure_sn
from public.cevaplar c
join public.denemeler d on d.id = c.deneme_id
join public.sorular   s on s.id = c.soru_id
where d.bitti_at is not null or (d.anlik and c.isaretlenen is not null)
group by 1,2,3,4,5,6;

grant select on public.v_konu_performans to authenticated, service_role;

-- Set basina ilerleme: her setin en son oturumu, cevaplanan ve dogru sayisi
create or replace view public.v_set_ilerleme
with (security_invoker = true) as
select distinct on (d.user_id, d.set_id)
  d.user_id,
  d.set_id,
  d.id            as deneme_id,
  d.soru_sayisi,
  d.bitti_at,
  (select count(*) from public.cevaplar c where c.deneme_id = d.id and c.isaretlenen is not null) as cevaplanan,
  (select count(*) from public.cevaplar c where c.deneme_id = d.id and c.dogru is true)           as dogru
from public.denemeler d
where d.set_id is not null
order by d.user_id, d.set_id, d.created_at desc;

grant select on public.v_set_ilerleme to authenticated, service_role;
-- ---------------------------------------------------------------- göç 3: ders / kaynak düzeni
alter table public.soru_setleri add column if not exists ders text;
alter table public.soru_setleri add column if not exists kaynak text;
alter table public.soru_setleri add column if not exists bolum_no int;
create index if not exists soru_setleri_ders_idx on public.soru_setleri(user_id, ders, kaynak, bolum_no);
create index if not exists cevaplar_soru_idx on public.cevaplar(soru_id);

-- Setin dersi boşsa sorularında en çok geçen ders
update public.soru_setleri st set ders = x.ders
from (
  select distinct on (set_id) set_id, ders from public.sorular
  where ders is not null group by set_id, ders order by set_id, count(*) desc
) x
where x.set_id = st.id and st.ders is null;

-- Ders ve konu bazında soru havuzu: kaç soru var, kaçı en az bir kez çözüldü
create or replace view public.v_konu_havuz with (security_invoker = true) as
select s.user_id, s.ders, s.konu,
       count(*) as soru,
       count(*) filter (where exists (
         select 1 from public.cevaplar c where c.soru_id = s.id and c.isaretlenen is not null)) as cozulen,
       count(*) filter (where s.dogru_cevap is null) as anahtarsiz
from public.sorular s
group by s.user_id, s.ders, s.konu;
grant select on public.v_konu_havuz to authenticated, service_role;

-- Ders ve konu bazında tüm zamanların toplamı (ders sayfası; satır sınırına takılmaz)
create or replace view public.v_konu_toplam with (security_invoker = true) as
select user_id, ders, konu,
       sum(toplam) as toplam, sum(dogru) as dogru, sum(yanlis) as yanlis, sum(bos) as bos
from public.v_konu_performans
group by user_id, ders, konu;
grant select on public.v_konu_toplam to authenticated, service_role;

-- ---------------------------------------------------------------- göç 4: ölçek
-- PostgREST bir istekte en fazla 1000 satır döndürür. Analiz ham satır yerine
-- veritabanında toplanmış özetleri çeker (konu başına / gün başına).
create or replace function public.perf_konu(bas date default null, son date default null)
returns table (ders text, konu text, toplam bigint, dogru bigint, yanlis bigint, bos bigint, ort_sure_sn numeric)
language sql stable security invoker set search_path = public as $$
  select ders, konu, sum(toplam), sum(dogru), sum(yanlis), sum(bos),
         round(sum(ort_sure_sn * toplam) / nullif(sum(toplam) filter (where ort_sure_sn is not null), 0), 1)
  from public.v_konu_performans
  where user_id = auth.uid()
    and (bas is null or gun >= bas) and (son is null or gun <= son)
  group by ders, konu;
$$;

create or replace function public.perf_gun(bas date default null, son date default null)
returns table (gun date, toplam bigint, dogru bigint, yanlis bigint, bos bigint)
language sql stable security invoker set search_path = public as $$
  select gun, sum(toplam), sum(dogru), sum(yanlis), sum(bos)
  from public.v_konu_performans
  where user_id = auth.uid()
    and (bas is null or gun >= bas) and (son is null or gun <= son)
  group by gun;
$$;
grant execute on function public.perf_konu(date, date), public.perf_gun(date, date) to authenticated, service_role;

-- Set ilerlemesine dersi ekle (ders sayfası yalnızca kendi setlerini çeker)
drop view if exists public.v_set_ilerleme;
create view public.v_set_ilerleme with (security_invoker = true) as
select distinct on (d.user_id, d.set_id)
  d.user_id, d.set_id, st.ders, d.id as deneme_id, d.soru_sayisi, d.bitti_at,
  (select count(*) from public.cevaplar c where c.deneme_id = d.id and c.isaretlenen is not null) as cevaplanan,
  (select count(*) from public.cevaplar c where c.deneme_id = d.id and c.dogru is true) as dogru
from public.denemeler d
join public.soru_setleri st on st.id = d.set_id
where d.set_id is not null
order by d.user_id, d.set_id, d.created_at desc;
grant select on public.v_set_ilerleme to authenticated, service_role;

-- Her dersin kaynakları (panel kartları; set listesinin tamamını çekmeye gerek yok)
create or replace view public.v_ders_kaynak with (security_invoker = true) as
select user_id, ders, kaynak, count(*) as set_sayisi, sum(soru_sayisi) as soru
from public.soru_setleri
where ders is not null and kaynak is not null
group by user_id, ders, kaynak;
grant select on public.v_ders_kaynak to authenticated, service_role;

-- Her sorunun son cevabı (Yanlışlarım: son cevabı yanlış olanlar)
create or replace view public.v_son_cevap with (security_invoker = true) as
select distinct on (c.user_id, c.soru_id)
  c.user_id, c.soru_id, s.ders, s.konu, c.dogru, c.cevaplandi_at
from public.cevaplar c
join public.sorular s on s.id = c.soru_id
where c.isaretlenen is not null and c.dogru is not null
order by c.user_id, c.soru_id, c.cevaplandi_at desc nulls last;
grant select on public.v_son_cevap to authenticated, service_role;
create index if not exists cevaplar_soru_zaman_idx on public.cevaplar(user_id, soru_id, cevaplandi_at desc);

-- ---------------------------------------------------------------- göç 5: emin değilim + yedek
alter table public.cevaplar add column if not exists emin_degil boolean not null default false;

-- Son cevap görünümüne emin_degil eklendi (yeni kolon sonda: create or replace yeterli)
create or replace view public.v_son_cevap with (security_invoker = true) as
select distinct on (c.user_id, c.soru_id)
  c.user_id, c.soru_id, s.ders, s.konu, c.dogru, c.cevaplandi_at, c.emin_degil
from public.cevaplar c
join public.sorular s on s.id = c.soru_id
where c.isaretlenen is not null and c.dogru is not null
order by c.user_id, c.soru_id, c.cevaplandi_at desc nulls last;
grant select on public.v_son_cevap to authenticated, service_role;

-- Yedekler: gizli depo. Yalnızca sunucu (service_role) erişir; politika yok = istemciden erişilemez.
insert into storage.buckets (id, name, public, file_size_limit)
values ('yedekler', 'yedekler', false, 52428800)
on conflict (id) do nothing;

-- ---------------------------------------------------------------- göç 6: açıklama görüntüsü
-- Kitaptaki açıklamanın sayfadan kesilmiş görüntüsü (tablo/şekil olduğu gibi). Gizli depo,
-- uygulama sunucusu kısa ömürlü imzalı bağlantı üretir. Yol: <soru_id>.webp
alter table public.sorular add column if not exists aciklama_gorsel text;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('aciklamalar', 'aciklamalar', false, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------- göç 7: tekrar çözüm, boş + açıklama
-- Soruyu işaretlemeden açıklamasına bakmak: soru boş sayılır, kilitlenir, tekrar listesine girer.
alter table public.cevaplar add column if not exists aciklama_bakildi boolean not null default false;

-- Tekrar listesi: açıklamasına boş bakılan soru da "yanlış" gibi listeye girer
create or replace view public.v_son_cevap with (security_invoker = true) as
select distinct on (c.user_id, c.soru_id)
  c.user_id, c.soru_id, s.ders, s.konu,
  case when c.isaretlenen is null then false else c.dogru end as dogru,
  c.cevaplandi_at, c.emin_degil
from public.cevaplar c
join public.sorular s on s.id = c.soru_id
where (c.isaretlenen is not null and c.dogru is not null) or c.aciklama_bakildi
order by c.user_id, c.soru_id, c.cevaplandi_at desc nulls last;
grant select on public.v_son_cevap to authenticated, service_role;

-- Set ilerlemesi: son oturuma ek olarak en son BİTMİŞ oturum (tekrar çözüm yarıda kalsa da
-- "daha önce tamamlandı" bilgisi kaybolmasın). Yeni kolonlar sonda.
create or replace view public.v_set_ilerleme with (security_invoker = true) as
select distinct on (d.user_id, d.set_id)
  d.user_id, d.set_id, st.ders, d.id as deneme_id, d.soru_sayisi, d.bitti_at,
  (select count(*) from public.cevaplar c where c.deneme_id = d.id and c.isaretlenen is not null) as cevaplanan,
  (select count(*) from public.cevaplar c where c.deneme_id = d.id and c.dogru is true) as dogru,
  b.bitti_at as son_bitis_at,
  b.soru_sayisi as son_bitis_soru,
  (select count(*) from public.cevaplar c where c.deneme_id = b.id and c.dogru is true) as son_bitis_dogru,
  (select count(*) from public.denemeler x where x.set_id = d.set_id and x.user_id = d.user_id and x.bitti_at is not null) as bitis_sayisi
from public.denemeler d
join public.soru_setleri st on st.id = d.set_id
left join lateral (
  select x.id, x.bitti_at, x.soru_sayisi from public.denemeler x
  where x.set_id = d.set_id and x.user_id = d.user_id and x.bitti_at is not null
  order by x.bitti_at desc limit 1
) b on true
where d.set_id is not null
order by d.user_id, d.set_id, d.created_at desc;
grant select on public.v_set_ilerleme to authenticated, service_role;

-- Soru bankası (anlık) modunda işaretlenmeyen soru "boş" sayılmaz: yalnızca çözülmemiştir.
-- Boş sayılan: deneme modunda bitince işaretsiz kalanlar + anlık modda açıklamasına boş bakılanlar.
create or replace view public.v_konu_performans
with (security_invoker = true) as
select
  c.user_id,
  d.id                                   as deneme_id,
  date_trunc('day', coalesce(case when d.anlik then c.cevaplandi_at end, d.bitti_at, d.basladi_at))::date as gun,
  coalesce(s.ders, 'Belirsiz')           as ders,
  coalesce(s.konu, 'Belirsiz')           as konu,
  s.alt_konu,
  count(*)                               as toplam,
  count(*) filter (where c.dogru is true)                        as dogru,
  count(*) filter (where c.dogru is false and c.isaretlenen is not null) as yanlis,
  count(*) filter (where c.isaretlenen is null)                  as bos,
  round(avg(c.sure_sn)::numeric, 1)      as ort_sure_sn
from public.cevaplar c
join public.denemeler d on d.id = c.deneme_id
join public.sorular   s on s.id = c.soru_id
where (not d.anlik and d.bitti_at is not null)
   or (d.anlik and (c.isaretlenen is not null or c.aciklama_bakildi))
group by 1,2,3,4,5,6;
grant select on public.v_konu_performans to authenticated, service_role;

-- "Tamamlandı" bilgisi en çok soru çözülen bitmiş turdan (boş bitirilen tur onu gölgelemesin)
create or replace view public.v_set_ilerleme with (security_invoker = true) as
select distinct on (d.user_id, d.set_id)
  d.user_id, d.set_id, st.ders, d.id as deneme_id, d.soru_sayisi, d.bitti_at,
  (select count(*) from public.cevaplar c where c.deneme_id = d.id and c.isaretlenen is not null) as cevaplanan,
  (select count(*) from public.cevaplar c where c.deneme_id = d.id and c.dogru is true) as dogru,
  b.bitti_at as son_bitis_at,
  b.soru_sayisi as son_bitis_soru,
  b.dogru as son_bitis_dogru,
  (select count(*) from public.denemeler x where x.set_id = d.set_id and x.user_id = d.user_id and x.bitti_at is not null) as bitis_sayisi,
  b.cevaplanan as son_bitis_cevaplanan
from public.denemeler d
join public.soru_setleri st on st.id = d.set_id
left join lateral (
  select x.id, x.bitti_at, x.soru_sayisi, y.cevaplanan, y.dogru
  from public.denemeler x
  cross join lateral (
    select count(*) filter (where c.isaretlenen is not null) as cevaplanan,
           count(*) filter (where c.dogru is true) as dogru
    from public.cevaplar c where c.deneme_id = x.id
  ) y
  where x.set_id = d.set_id and x.user_id = d.user_id and x.bitti_at is not null and y.cevaplanan > 0
  order by y.cevaplanan desc, x.bitti_at desc limit 1
) b on true
where d.set_id is not null
order by d.user_id, d.set_id, d.created_at desc;
grant select on public.v_set_ilerleme to authenticated, service_role;

-- ---------------------------------------------------------------- göç 8: atlanan boşlar
-- Test bitince boş bırakılıp geçilen soru: boş sayılır ve tekrar listesine girer.
--   Deneme modu: işaretsiz kalan bütün sorular.
--   Soru bankası: son cevaplanan sorudan ÖNCE kalan işaretsizler (atlanmış); sonrakiler
--   hiç ulaşılmamış sayılır, istatistiğe girmez.
alter table public.cevaplar add column if not exists bos_gecildi boolean not null default false;

create or replace view public.v_konu_performans
with (security_invoker = true) as
select
  c.user_id,
  d.id                                   as deneme_id,
  date_trunc('day', coalesce(case when d.anlik then c.cevaplandi_at end, d.bitti_at, d.basladi_at))::date as gun,
  coalesce(s.ders, 'Belirsiz')           as ders,
  coalesce(s.konu, 'Belirsiz')           as konu,
  s.alt_konu,
  count(*)                               as toplam,
  count(*) filter (where c.dogru is true)                        as dogru,
  count(*) filter (where c.dogru is false and c.isaretlenen is not null) as yanlis,
  count(*) filter (where c.isaretlenen is null)                  as bos,
  round(avg(c.sure_sn)::numeric, 1)      as ort_sure_sn
from public.cevaplar c
join public.denemeler d on d.id = c.deneme_id
join public.sorular   s on s.id = c.soru_id
where (not d.anlik and d.bitti_at is not null)
   or (d.anlik and (c.isaretlenen is not null or c.aciklama_bakildi or c.bos_gecildi))
group by 1,2,3,4,5,6;
grant select on public.v_konu_performans to authenticated, service_role;

create or replace view public.v_son_cevap with (security_invoker = true) as
select distinct on (c.user_id, c.soru_id)
  c.user_id, c.soru_id, s.ders, s.konu,
  case when c.isaretlenen is null then false else c.dogru end as dogru,
  c.cevaplandi_at, c.emin_degil
from public.cevaplar c
join public.sorular s on s.id = c.soru_id
where (c.isaretlenen is not null and c.dogru is not null) or c.aciklama_bakildi or c.bos_gecildi
order by c.user_id, c.soru_id, c.cevaplandi_at desc nulls last;
grant select on public.v_son_cevap to authenticated, service_role;
-- Geçmiş bitmiş testlere aynı kuralı uygula
with son as (
  select c.deneme_id, max(c.sira) filter (where c.isaretlenen is not null or c.aciklama_bakildi) as son_sira
  from public.cevaplar c group by c.deneme_id
)
update public.cevaplar c
   set bos_gecildi = true, cevaplandi_at = coalesce(c.cevaplandi_at, d.bitti_at)
  from public.denemeler d, son
 where d.id = c.deneme_id and son.deneme_id = c.deneme_id
   and d.bitti_at is not null and c.isaretlenen is null and not c.aciklama_bakildi
   and (not d.anlik or c.sira < son.son_sira)
returning c.id;

-- ---------------------------------------------------------------- göç 9: blok açıklama
-- Açıklama blokları: metin paragrafları + yalnızca kendisi kadar kırpılmış şekil/tablo görüntüleri.
-- [{"t":"m","x":"..."}, {"t":"g","yol":"<soru_id>-1.webp","w":705,"h":168,"tur":"sekil|tablo|genis"}]
-- aciklama_gorsel: açıklamanın tam görüntüsü ("Kitaptaki hâlini göster"). aciklama: düz metin (arama, yedek).
alter table public.sorular add column if not exists aciklama_bloklar jsonb;

-- ---------------------------------------------------------------- göç 10: tekrar ve öncelik algoritması
-- Her sayılan cevap bir "deneme" (attempt): başarı 1 = emin ve doğru, 0,5 = doğru ama "emin değilim",
-- 0 = yanlış / boş geçilen / açıklamasına boş bakılan. Sayılma kuralı v_konu_performans ile aynı.
create or replace view public.v_cevap_olay with (security_invoker = true) as
select
  c.user_id, c.soru_id, s.ders, s.konu,
  coalesce(c.cevaplandi_at, d.bitti_at, d.basladi_at) as zaman,
  case when c.dogru is true and not c.emin_degil then 1.0
       when c.dogru is true then 0.5
       else 0.0 end as basari
from public.cevaplar c
join public.denemeler d on d.id = c.deneme_id
join public.sorular s on s.id = c.soru_id
where ((not d.anlik and d.bitti_at is not null and c.dogru is not null)
       or (not d.anlik and d.bitti_at is not null and c.isaretlenen is null)
       or (d.anlik and ((c.isaretlenen is not null and c.dogru is not null) or c.aciklama_bakildi or c.bos_gecildi)));
grant select on public.v_cevap_olay to authenticated, service_role;

-- Soru durumu (aralıklı tekrar). Hiç hata yapılmamış soru "bilinen"dir, tekrar istemez.
-- Hata yapılmış soru kutu 0'dan başlar; FARKLI günlerde art arda emin doğrularla kutu yükselir:
--   kutu 0 → hemen, 1 → 2 gün, 2 → 7 gün, 3 → 21 gün sonra tekrar; kutu 4 = öğrenildi.
-- Araya giren her yanlış/boş/emin olmayan cevap kutuyu sıfırlar.
create or replace view public.v_soru_durum with (security_invoker = true) as
with sirali as (
  select o.*, row_number() over (partition by user_id, soru_id order by zaman desc) as rn
  from public.v_cevap_olay o
),
ozet as (
  select user_id, soru_id, max(ders) as ders, max(konu) as konu,
         count(*) as deneme_sayisi,
         bool_or(basari < 1) as hata_var,
         count(*) filter (where basari < 1) as hata_sayisi,
         max(zaman) as son_zaman,
         -- en son tam başarısızlık olmayan (basari < 1) andan sonraki ardışık emin doğrular
         min(rn) filter (where basari < 1) as ilk_hata_rn
  from sirali group by user_id, soru_id
),
seri as (
  select z.user_id, z.soru_id,
         count(distinct (s.zaman at time zone 'Europe/Istanbul')::date) as seri_gun
  from ozet z
  join sirali s on s.user_id = z.user_id and s.soru_id = z.soru_id
   and s.rn < coalesce(z.ilk_hata_rn, 1000000)
  group by z.user_id, z.soru_id
)
select z.user_id, z.soru_id, z.ders, z.konu, z.deneme_sayisi, z.hata_sayisi, z.son_zaman,
       case when not z.hata_var then 4 else least(coalesce(sr.seri_gun, 0), 4) end as kutu,
       not z.hata_var as bilinen,
       case when not z.hata_var then null
            when coalesce(sr.seri_gun, 0) = 0 then z.son_zaman
            when sr.seri_gun = 1 then z.son_zaman + interval '2 days'
            when sr.seri_gun = 2 then z.son_zaman + interval '7 days'
            when sr.seri_gun = 3 then z.son_zaman + interval '21 days'
            else null end as sonraki_tekrar,
       z.hata_var and coalesce(sr.seri_gun, 0) < 4 as acik_hata
from ozet z
left join seri sr on sr.user_id = z.user_id and sr.soru_id = z.soru_id;
grant select on public.v_soru_durum to authenticated, service_role;

-- Tekrar zamanı gelenler (Yanlışlarım'ın yerine): açık hata + tekrar tarihi geçmiş
create or replace view public.v_tekrar_vadesi with (security_invoker = true) as
select * from public.v_soru_durum
where acik_hata and sonraki_tekrar <= now();
grant select on public.v_tekrar_vadesi to authenticated, service_role;

-- Konu ustalığı ve öncelik.
--   ustalık = (2 + Σ w·başarı) / (4 + Σ w), w = exp(-yaş_gün / 30)  (yeni cevaplar ağır basar,
--             az veride %50'ye çekilir)
--   önem    = ln(1 + havuzdaki soru sayısı) / ln(1 + derste en kalabalık konunun soru sayısı)
--             (Tüm TUS Soruları tüm çıkmış soruları içerir: soru sayısı ~ sınavda sorulma sıklığı)
--   öncelik = önem × (1 - ustalık) + 0,04 × açık hata (en fazla 0,3) + 0,05 × vadesi gelen (en fazla 0,3)
--             + hiç çalışılmamış konuya 0,15 × önem
create or replace view public.v_konu_oncelik with (security_invoker = true) as
with havuz as (
  select user_id, ders, konu, count(*) as soru from public.sorular group by 1, 2, 3
),
ders_max as (
  select user_id, ders, max(soru) as en_cok from havuz group by 1, 2
),
agirlik as (
  select user_id, ders, konu,
         sum(exp(-extract(epoch from (now() - zaman)) / 86400.0 / 30.0)) as w,
         sum(exp(-extract(epoch from (now() - zaman)) / 86400.0 / 30.0) * basari) as wb,
         count(*) as deneme, count(distinct soru_id) as cozulen
  from public.v_cevap_olay group by 1, 2, 3
),
durum as (
  select user_id, ders, konu,
         count(*) filter (where acik_hata) as acik_hata,
         count(*) filter (where acik_hata and sonraki_tekrar <= now()) as vadesi_gelen,
         count(*) filter (where kutu >= 4 and not bilinen) as ogrenilen
  from public.v_soru_durum group by 1, 2, 3
)
select h.user_id, h.ders, h.konu, h.soru,
       coalesce(a.cozulen, 0) as cozulen, coalesce(a.deneme, 0) as deneme,
       round(((2 + coalesce(a.wb, 0)) / (4 + coalesce(a.w, 0)))::numeric, 3) as ustalik,
       round(coalesce(a.w, 0)::numeric, 2) as kanit,
       coalesce(d.acik_hata, 0) as acik_hata,
       coalesce(d.vadesi_gelen, 0) as vadesi_gelen,
       coalesce(d.ogrenilen, 0) as ogrenilen,
       round((ln(1 + h.soru) / nullif(ln(1 + m.en_cok), 0))::numeric, 3) as onem,
       round((
         (ln(1 + h.soru) / nullif(ln(1 + m.en_cok), 0)) * (1 - (2 + coalesce(a.wb, 0)) / (4 + coalesce(a.w, 0)))
         + least(0.04 * coalesce(d.acik_hata, 0), 0.3)
         + least(0.05 * coalesce(d.vadesi_gelen, 0), 0.3)
         + case when coalesce(a.deneme, 0) = 0 then 0.15 * (ln(1 + h.soru) / nullif(ln(1 + m.en_cok), 0)) else 0 end
       )::numeric, 3) as oncelik
from havuz h
join ders_max m on m.user_id = h.user_id and m.ders = h.ders
left join agirlik a on a.user_id = h.user_id and a.ders = h.ders and a.konu = h.konu
left join durum d on d.user_id = h.user_id and d.ders = h.ders and d.konu = h.konu;
grant select on public.v_konu_oncelik to authenticated, service_role;
-- ---------------------------------------------------------------- göç 11: erken tekrar kutu atlatmaz
-- Seri yalnızca farklı günleri saymakla kalmaz, tekrarlar arasında zaman da geçmiş olmalı: kutu 3 için
-- serinin ilk ve son emin doğrusu arasında en az 4,5 gün, kutu 4 için en az 15 gün (aralıkların yarısı
-- toplamı). Böylece aynı bölümü iki gün üst üste çözmek soruyu "öğrenildi" yapmaz.
create or replace view public.v_soru_durum with (security_invoker = true) as
with sirali as (
  select o.*, row_number() over (partition by user_id, soru_id order by zaman desc) as rn
  from public.v_cevap_olay o
),
ozet as (
  select user_id, soru_id, max(ders) as ders, max(konu) as konu,
         count(*) as deneme_sayisi,
         bool_or(basari < 1) as hata_var,
         count(*) filter (where basari < 1) as hata_sayisi,
         max(zaman) as son_zaman,
         min(rn) filter (where basari < 1) as ilk_hata_rn
  from sirali group by user_id, soru_id
),
seri as (
  select z.user_id, z.soru_id,
         count(distinct (s.zaman at time zone 'Europe/Istanbul')::date) as gun,
         extract(epoch from max(s.zaman) - min(s.zaman)) / 86400.0 as aralik
  from ozet z
  join sirali s on s.user_id = z.user_id and s.soru_id = z.soru_id
   and s.rn < coalesce(z.ilk_hata_rn, 1000000)
  group by z.user_id, z.soru_id
),
kutulu as (
  select z.*,
         case when not z.hata_var then 4
              else least(coalesce(sr.gun, 0), 4,
                         case when coalesce(sr.aralik, 0) >= 15 then 4
                              when coalesce(sr.aralik, 0) >= 4.5 then 3
                              else 2 end)
         end as kutu
  from ozet z
  left join seri sr on sr.user_id = z.user_id and sr.soru_id = z.soru_id
)
select user_id, soru_id, ders, konu, deneme_sayisi, hata_sayisi, son_zaman, kutu,
       not hata_var as bilinen,
       case when not hata_var then null
            when kutu = 0 then son_zaman
            when kutu = 1 then son_zaman + interval '2 days'
            when kutu = 2 then son_zaman + interval '7 days'
            when kutu = 3 then son_zaman + interval '21 days'
            else null end as sonraki_tekrar,
       hata_var and kutu < 4 as acik_hata
from kutulu;
grant select on public.v_soru_durum to authenticated, service_role;
-- ---------------------------------------------------------------- göç 12: takıntı freni
-- Tek bir yanlış bir konuyu listenin başına oturtmasın, yeni çalışılan konu art arda gelmesin:
--   güven     = kanıt / (kanıt + 4)              (kanıt = Σ w, son cevaplar ağır)
--   eksiklik  = önem × (1 − ustalık) × (0,25 + 0,75 × güven)   az veride eksiklik yarıdan az sayılır
--   hata      = 0,10 × √açık hata (≤ 0,30), vade = 0,08 × √vadesi gelen (≤ 0,25)   (azalan getiri)
--   doygunluk = 1 / (1 + son 36 saatteki cevap / 20)   bugün çok çalışılan konu biraz geri çekilir
--   öncelik   = (eksiklik + hata + vade) × doygunluk  (+ hiç çalışılmamışsa 0,15 × önem)
drop view if exists public.v_konu_oncelik;
create view public.v_konu_oncelik with (security_invoker = true) as
with havuz as (
  select user_id, ders, konu, count(*) as soru from public.sorular group by 1, 2, 3
),
ders_max as (
  select user_id, ders, max(soru) as en_cok from havuz group by 1, 2
),
agirlik as (
  select user_id, ders, konu,
         sum(exp(-extract(epoch from (now() - zaman)) / 86400.0 / 30.0)) as w,
         sum(exp(-extract(epoch from (now() - zaman)) / 86400.0 / 30.0) * basari) as wb,
         count(*) as deneme, count(distinct soru_id) as cozulen,
         count(*) filter (where zaman > now() - interval '36 hours') as son36
  from public.v_cevap_olay group by 1, 2, 3
),
durum as (
  select user_id, ders, konu,
         count(*) filter (where acik_hata) as acik_hata,
         count(*) filter (where acik_hata and sonraki_tekrar <= now()) as vadesi_gelen,
         count(*) filter (where kutu >= 4 and not bilinen) as ogrenilen
  from public.v_soru_durum group by 1, 2, 3
),
h as (
  select hv.user_id, hv.ders, hv.konu, hv.soru,
         coalesce(a.cozulen, 0) as cozulen, coalesce(a.deneme, 0) as deneme, coalesce(a.son36, 0) as son36,
         (2 + coalesce(a.wb, 0)) / (4 + coalesce(a.w, 0)) as ust,
         coalesce(a.w, 0) as w,
         coalesce(d.acik_hata, 0) as acik_hata, coalesce(d.vadesi_gelen, 0) as vadesi_gelen,
         coalesce(d.ogrenilen, 0) as ogrenilen,
         ln(1 + hv.soru) / nullif(ln(1 + m.en_cok), 0) as onem
  from havuz hv
  join ders_max m on m.user_id = hv.user_id and m.ders = hv.ders
  left join agirlik a on a.user_id = hv.user_id and a.ders = hv.ders and a.konu = hv.konu
  left join durum d on d.user_id = hv.user_id and d.ders = hv.ders and d.konu = hv.konu
)
select user_id, ders, konu, soru, cozulen, deneme, son36,
       round(ust::numeric, 3) as ustalik,
       round(w::numeric, 2) as kanit,
       acik_hata, vadesi_gelen, ogrenilen,
       round(onem::numeric, 3) as onem,
       round((
         (onem * (1 - ust) * (0.25 + 0.75 * w / (w + 4))
          + least(0.10 * sqrt(acik_hata), 0.30)
          + least(0.08 * sqrt(vadesi_gelen), 0.25)) / (1 + son36 / 20.0)
         + case when deneme = 0 then 0.15 * onem else 0 end
       )::numeric, 3) as oncelik
from h;
grant select on public.v_konu_oncelik to authenticated, service_role;
-- ---------------------------------------------------------------- göç 13: vaka soruları ve soru görseli
-- vaka_metni: birden çok sorunun paylaştığı vaka (TUSDATA vaka soruları); her soruda tekrarlanır, çözüm ekranı
-- art arda aynı vakayı bir kez açık gösterir. soru_gorsel: kökteki şekil/grafi/tablo görüntüsü (B2 yolu).
alter table public.sorular add column if not exists vaka_metni text;
alter table public.sorular add column if not exists soru_gorsel text;
-- ---------------------------------------------------------------- göç 14: soru hata bildirimi
-- Çözerken bozuk kök/şık/açıklama/anahtar görülürse kullanıcı not bırakır; Claude oturum başında
-- açık bildirimleri görüntüyle kontrol edip düzeltir ve `cozuldu_at` doldurur.
create table if not exists public.soru_bildirimleri (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  soru_id uuid not null references public.sorular(id) on delete cascade,
  tur text not null default 'metin' check (tur in ('metin', 'sik', 'anahtar', 'aciklama', 'gorsel', 'konu', 'diger')),
  notu text,
  olusturma_at timestamptz not null default now(),
  cozuldu_at timestamptz,
  cozum_notu text
);
create index if not exists soru_bildirimleri_acik on public.soru_bildirimleri (user_id) where cozuldu_at is null;
alter table public.soru_bildirimleri enable row level security;
drop policy if exists "kendi bildirimleri" on public.soru_bildirimleri;
create policy "kendi bildirimleri" on public.soru_bildirimleri
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.soru_bildirimleri to authenticated;
grant all on public.soru_bildirimleri to service_role;

-- ---------------------------------------------------------------- göç 15: yarıda bitirilen bölüm (tur zinciri)
-- Bölüm yarıda "Bitir"lenince "Tamamlandı" sayılmaz. "Devam et" yalnızca kalan (çözülmemiş) sorularla yeni
-- bir tur açar ve onu ilk tura bağlar (zincir_id = zincirin ilk turu). Zincirdeki turlar birlikte setin bütün
-- sorularını kapsayınca bölüm tamamlanmış olur; "Tekrar çöz" yeni zincir başlatır.
alter table public.denemeler add column if not exists zincir_id uuid references public.denemeler(id) on delete set null;
create index if not exists denemeler_zincir_idx on public.denemeler(zincir_id);

drop view if exists public.v_set_ilerleme;
create view public.v_set_ilerleme with (security_invoker = true) as
with zincir as (
  -- her (kullanıcı, set, zincir): kapsanan farklı soru, son cevaba göre doğru, bitti mi
  select d.user_id, d.set_id, coalesce(d.zincir_id, d.id) as zincir,
         min(d.created_at) as basladi, max(d.bitti_at) as bitti_at, bool_and(d.bitti_at is not null) as hepsi_bitti
  from public.denemeler d where d.set_id is not null
  group by 1, 2, 3
), kapsam as (
  select z.user_id, z.set_id, z.zincir, z.basladi, z.bitti_at, z.hepsi_bitti,
         count(distinct c.soru_id) filter (where c.isaretlenen is not null or c.aciklama_bakildi) as cevaplanan,
         count(distinct c.soru_id) filter (where c.dogru is true) as dogru
  from zincir z
  join public.denemeler d on d.set_id = z.set_id and d.user_id = z.user_id and coalesce(d.zincir_id, d.id) = z.zincir
  left join public.cevaplar c on c.deneme_id = d.id
  group by 1, 2, 3, 4, 5, 6
), boyut as (
  select set_id, count(*) as soru from public.sorular group by set_id
), tam as (
  select k.*, (k.hepsi_bitti and k.cevaplanan >= b.soru) as tamam from kapsam k join boyut b on b.set_id = k.set_id
)
select distinct on (d.user_id, d.set_id)
  d.user_id, d.set_id, st.ders, d.id as deneme_id,
  b.soru as soru_sayisi,                                   -- setin soru sayısı (tur boyu değil)
  case when sz.tamam then d.bitti_at end as bitti_at,      -- yalnızca zincir bütün soruları kapsayınca dolu
  d.bitti_at as tur_bitti_at,                              -- son turun kendisi bitti mi
  sz.cevaplanan, sz.dogru,
  sb.bitti_at as son_bitis_at, b.soru as son_bitis_soru, sb.dogru as son_bitis_dogru,
  (select count(*) from tam t where t.user_id = d.user_id and t.set_id = d.set_id and t.tamam) as bitis_sayisi,
  sb.cevaplanan as son_bitis_cevaplanan,
  coalesce(d.zincir_id, d.id) as zincir_id
from public.denemeler d
join public.soru_setleri st on st.id = d.set_id
join boyut b on b.set_id = d.set_id
join tam sz on sz.user_id = d.user_id and sz.set_id = d.set_id and sz.zincir = coalesce(d.zincir_id, d.id)
left join lateral (
  select t.bitti_at, t.cevaplanan, t.dogru from tam t
  where t.user_id = d.user_id and t.set_id = d.set_id and t.tamam
  order by t.bitti_at desc limit 1
) sb on true
where d.set_id is not null
order by d.user_id, d.set_id, d.created_at desc;
grant select on public.v_set_ilerleme to authenticated, service_role;

-- ---------------------------------------------------------------- göç 16: sorunun kitaptaki görüntüsü
-- Soru kitaptaki görüntüsünden çözülür (OCR metin hatası sıfır): kök + şekil + şıklar tek görüntü (B2 yolu,
-- scripts/ocr/soru_goruntu.py). Varsa çözüm ekranı görüntüyü ve A–E düğmelerini gösterir; metin isteğe bağlı.
alter table public.sorular add column if not exists soru_kitap_gorsel text;

-- ---------------------------------------------------------------- göç 17: açıklamanın kitaptaki görüntüsü (parça parça)
-- [{yol, w, h}]: açıklamanın kitaptaki hâli, sütun sütun ayrı görüntüler (scripts/ocr/soru_goruntu.py --aciklama).
-- Telif kutusu, sayfa üst bilgisi, bölüm bandı ve "şöyle de sorulabilirdi" kutusu atılmış; iki sütuna yayılan
-- tablo tek parça. Varsa açıklama bunlarla gösterilir; metin/blok hâli "Metin olarak göster" ile.
alter table public.sorular add column if not exists aciklama_kitap jsonb;

-- ---------------------------------------------------------------- göç 18: kitap görüntüsünün boyutu
-- Çözüm ekranı görüntü inmeden yerini ayırır (geç yükleme kaydırmayı oynatmasın): <img width height>.
alter table public.sorular add column if not exists soru_kitap_w integer, add column if not exists soru_kitap_h integer;
