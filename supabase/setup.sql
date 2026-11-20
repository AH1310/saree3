-- سريع | مخطط Supabase للموقع
-- الصق هذا الملف كاملًا في Supabase > SQL Editor > New query > Run.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  first_name text not null default '',
  last_name text not null default '',
  role text not null default 'buyer' check (role in ('buyer','seller')),
  country_code text,
  country text,
  whatsapp text,
  bio text not null default '',
  avatar_path text,
  created_at timestamptz not null default now()
);
create table if not exists public.account_details (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone text
);
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  category text not null,
  description text not null,
  price numeric(12,2) not null default 0 check (price >= 0),
  cover_path text,
  is_featured boolean not null default false,
  featured_until timestamptz,
  created_at timestamptz not null default now()
);
alter table public.services add column if not exists is_featured boolean not null default false;
alter table public.services add column if not exists featured_until timestamptz;
create table if not exists public.portfolio (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null default '',
  link text,
  image_path text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.site_feedback (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references auth.users(id) on delete set null,
  name text,
  phone text,
  email text,
  subject text not null check (char_length(subject) between 2 and 160),
  message text not null check (char_length(message) between 10 and 5000),
  status text not null default 'new' check (status in ('new','in_progress','resolved','closed')),
  admin_note text,
  created_at timestamptz not null default now()
);
create table if not exists public.site_notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  audience text not null default 'all' check (audience in ('all','users')),
  target_user_ids uuid[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.site_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> recipient_id)
);
create index if not exists site_messages_sender_created_idx on public.site_messages(sender_id, created_at desc);
create index if not exists site_messages_recipient_created_idx on public.site_messages(recipient_id, created_at desc);
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.admin_users where user_id = (select auth.uid()));
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, username, first_name, last_name, role, country_code, whatsapp)
  values (
    new.id,
    nullif(lower(new.raw_user_meta_data ->> 'username'),''),
    coalesce(new.raw_user_meta_data ->> 'first_name',''),
    coalesce(new.raw_user_meta_data ->> 'last_name',''),
    case when new.raw_user_meta_data ->> 'role' = 'seller' then 'seller' else 'buyer' end,
    new.raw_user_meta_data ->> 'country_code',
    new.raw_user_meta_data ->> 'whatsapp'
  ) on conflict(id) do nothing;
  insert into public.account_details(user_id, phone)
  values(new.id, new.raw_user_meta_data ->> 'phone') on conflict(user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.account_details enable row level security;
alter table public.services enable row level security;
alter table public.portfolio enable row level security;
alter table public.site_feedback enable row level security;
alter table public.site_messages enable row level security;
alter table public.site_notifications enable row level security;
alter table public.admin_users enable row level security;

do $$ declare p record; begin
  for p in select schemaname, tablename, policyname from pg_policies where schemaname in ('public','storage') and policyname like 'saree3 %' loop
    execute format('drop policy if exists %I on %I.%I',p.policyname,p.schemaname,p.tablename);
  end loop;
end $$;

grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.services, public.portfolio to anon, authenticated;
grant update on public.profiles to authenticated;
grant select, insert, update on public.account_details to authenticated;
grant insert, update, delete on public.services, public.portfolio to authenticated;
grant insert on public.site_feedback to anon, authenticated;
grant select, update, delete on public.site_feedback to authenticated;
grant select on public.site_notifications to anon;
grant select, insert, update, delete on public.site_notifications to authenticated;
grant select on public.admin_users to authenticated;
grant select, insert on public.site_messages to authenticated;
grant update (read_at) on public.site_messages to authenticated;

create policy "saree3 profiles public read" on public.profiles for select to anon, authenticated using (true);
create policy "saree3 profiles owner update" on public.profiles for update to authenticated using (id=(select auth.uid()) or public.is_admin()) with check (id=(select auth.uid()) or public.is_admin());
create policy "saree3 account owner read" on public.account_details for select to authenticated using (user_id=(select auth.uid()) or public.is_admin());
create policy "saree3 account owner insert" on public.account_details for insert to authenticated with check (user_id=(select auth.uid()) or public.is_admin());
create policy "saree3 account owner update" on public.account_details for update to authenticated using (user_id=(select auth.uid()) or public.is_admin()) with check (user_id=(select auth.uid()) or public.is_admin());
create policy "saree3 services public read" on public.services for select to anon, authenticated using (true);
create policy "saree3 services owner insert" on public.services for insert to authenticated with check (seller_id=(select auth.uid()));
create policy "saree3 services owner update" on public.services for update to authenticated using (seller_id=(select auth.uid()) or public.is_admin()) with check (seller_id=(select auth.uid()) or public.is_admin());
create policy "saree3 services owner delete" on public.services for delete to authenticated using (seller_id=(select auth.uid()) or public.is_admin());
create policy "saree3 portfolio public read" on public.portfolio for select to anon, authenticated using (true);
create policy "saree3 portfolio owner insert" on public.portfolio for insert to authenticated with check (seller_id=(select auth.uid()));
create policy "saree3 portfolio owner update" on public.portfolio for update to authenticated using (seller_id=(select auth.uid()) or public.is_admin()) with check (seller_id=(select auth.uid()) or public.is_admin());
create policy "saree3 portfolio owner delete" on public.portfolio for delete to authenticated using (seller_id=(select auth.uid()) or public.is_admin());
create policy "saree3 feedback submit" on public.site_feedback for insert to anon, authenticated with check (true);
create policy "saree3 feedback admin read" on public.site_feedback for select to authenticated using (public.is_admin());
create policy "saree3 feedback admin update" on public.site_feedback for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "saree3 feedback admin delete" on public.site_feedback for delete to authenticated using (public.is_admin());
create policy "saree3 notifications recipients read" on public.site_notifications for select to anon, authenticated using (audience='all' or (auth.uid() is not null and (select auth.uid())=any(target_user_ids)) or (auth.uid() is not null and public.is_admin()));
create policy "saree3 notifications admin insert" on public.site_notifications for insert to authenticated with check (public.is_admin());
create policy "saree3 notifications admin update" on public.site_notifications for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "saree3 notifications admin delete" on public.site_notifications for delete to authenticated using (public.is_admin());
create policy "saree3 messages participants read" on public.site_messages for select to authenticated using ((select auth.uid())=sender_id or (select auth.uid())=recipient_id);
create policy "saree3 messages sender insert" on public.site_messages for insert to authenticated with check (sender_id=(select auth.uid()) and recipient_id<>sender_id);
create policy "saree3 messages recipient mark read" on public.site_messages for update to authenticated using (recipient_id=(select auth.uid())) with check (recipient_id=(select auth.uid()));
create policy "saree3 admin list read" on public.admin_users for select to authenticated using (public.is_admin());

insert into storage.buckets(id,name,public) values('market-images','market-images',true)
on conflict(id) do update set public=true;
create policy "saree3 images public read" on storage.objects for select to anon,authenticated using(bucket_id='market-images');
create policy "saree3 images upload own folder" on storage.objects for insert to authenticated with check(bucket_id='market-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "saree3 images update own folder" on storage.objects for update to authenticated using(bucket_id='market-images' and ((storage.foldername(name))[1]=(select auth.uid())::text or public.is_admin())) with check(bucket_id='market-images' and ((storage.foldername(name))[1]=(select auth.uid())::text or public.is_admin()));
create policy "saree3 images delete own folder" on storage.objects for delete to authenticated using(bucket_id='market-images' and ((storage.foldername(name))[1]=(select auth.uid())::text or public.is_admin()));

-- منح الإدارة فقط للحساب الذي يطابق البريد والمعرف كليهما.
insert into public.admin_users(user_id)
select id from auth.users
where id='4d5aa877-61d8-486e-9dda-4e30c8d04d29'::uuid
  and lower(email)='ah10med2013@gmail.com'
on conflict(user_id) do nothing;

-- الموقع لا يفرض مراجعة أدمن قبل ظهور الخدمة؛ الخدمات تقرأها الواجهة مباشرة.
