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
