-- Optional people attached to one account. Reports remain owned by the account;
-- person_id only identifies whose report it is within that family.
create table if not exists public.family_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 100),
  relationship text not null default 'family member',
  birth_year integer check (birth_year is null or birth_year between 1900 and extract(year from now())::integer),
  created_at timestamptz not null default now(),
  unique(user_id, display_name)
);
alter table public.documents add column if not exists person_id uuid;
create unique index if not exists family_profiles_id_user_unique on public.family_profiles(id, user_id);
alter table public.documents drop constraint if exists documents_person_owner_fk;
alter table public.documents add constraint documents_person_owner_fk foreign key (person_id, user_id) references public.family_profiles(id, user_id) on delete set null (person_id) not valid;
create index if not exists family_profiles_user_created on public.family_profiles(user_id, created_at);
alter table public.family_profiles enable row level security;
alter table public.family_profiles force row level security;
drop policy if exists family_profiles_select_own on public.family_profiles;
drop policy if exists family_profiles_insert_own on public.family_profiles;
drop policy if exists family_profiles_update_own on public.family_profiles;
drop policy if exists family_profiles_delete_own on public.family_profiles;
create policy family_profiles_select_own on public.family_profiles for select using (auth.uid() = user_id);
create policy family_profiles_insert_own on public.family_profiles for insert with check (auth.uid() = user_id);
create policy family_profiles_update_own on public.family_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy family_profiles_delete_own on public.family_profiles for delete using (auth.uid() = user_id);
grant select, insert, update, delete on public.family_profiles to authenticated;
revoke all on public.family_profiles from anon;
