-- Shortlisted: initial schema. Every table has RLS; users can only touch their own rows.
-- Deleting the auth user cascades to every personal row.
-- gen_random_uuid() is built into Postgres 13+, so no extension is needed.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- profiles ----------
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  home_country text check (home_country ~ '^[A-Z]{2}$'),
  target_country text check (target_country ~ '^[A-Z]{2}$'),
  detected_country text check (detected_country ~ '^[A-Z]{2}$'),
  spelling text check (spelling in ('en-US', 'en-GB', 'en-AU', 'en-CA', 'en-IN')),
  locale text not null default 'en',
  voice_profile jsonb,
  guest_migrated boolean not null default false,
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- facts: the user's confirmed truth ----------
create table public.facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('contact', 'work', 'achievement', 'education', 'skill', 'language', 'cert')),
  data jsonb not null,
  confirmed boolean not null default false,
  source text not null default 'user' check (source in ('user', 'import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index facts_user_idx on public.facts (user_id, type);

-- ---------- cvs ----------
create table public.cvs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  region_id text not null,
  template_id text not null,
  base_cv_id uuid references public.cvs (id) on delete set null,
  content jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'final', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cvs_user_idx on public.cvs (user_id, updated_at desc);

-- ---------- cv_versions: last 10 per CV ----------
create table public.cv_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cv_id uuid not null references public.cvs (id) on delete cascade,
  title text not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cv_versions_cv_idx on public.cv_versions (cv_id, created_at desc);

create or replace function public.prune_cv_versions()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.cv_versions
  where cv_id = new.cv_id
    and id not in (
      select id from public.cv_versions
      where cv_id = new.cv_id
      order by created_at desc
      limit 10
    );
  return null;
end;
$$;

-- ---------- applications (used from Phase 2) ----------
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text,
  company text,
  jd_text text,
  jd_analysis jsonb,
  cv_id uuid references public.cvs (id) on delete set null,
  email_id uuid,
  status text not null default 'saved' check (status in ('saved', 'applied', 'interview', 'offer', 'closed')),
  applied_at timestamptz,
  next_action_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- emails (used from Phase 3) ----------
create table public.emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  application_id uuid references public.applications (id) on delete cascade,
  variant text not null,
  subject text,
  body text,
  lint_report jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.applications
  add constraint applications_email_fk foreign key (email_id) references public.emails (id) on delete set null;

-- ---------- consents: append-only log ----------
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  purpose text not null check (purpose in ('core', 'email_updates', 'whatsapp')),
  text_version text not null,
  granted boolean not null,
  granted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index consents_user_idx on public.consents (user_id, purpose, granted_at desc);

-- ---------- audit: events only, never personal content ----------
create table public.audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users (id) on delete cascade,
  event text not null check (event ~ '^[a-z_.]+$'),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- triggers ----------
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger facts_updated before update on public.facts for each row execute function public.set_updated_at();
create trigger cvs_updated before update on public.cvs for each row execute function public.set_updated_at();
create trigger applications_updated before update on public.applications for each row execute function public.set_updated_at();
create trigger emails_updated before update on public.emails for each row execute function public.set_updated_at();
create trigger cv_versions_prune after insert on public.cv_versions for each row execute function public.prune_cv_versions();

-- Create an empty profile row when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.facts enable row level security;
alter table public.cvs enable row level security;
alter table public.cv_versions enable row level security;
alter table public.applications enable row level security;
alter table public.emails enable row level security;
alter table public.consents enable row level security;
alter table public.audit enable row level security;

-- Full CRUD on own rows for user-content tables.
do $$
declare t text;
begin
  foreach t in array array['profiles', 'facts', 'cvs', 'cv_versions', 'applications', 'emails'] loop
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t || '_delete_own', t);
  end loop;
end;
$$;

-- Consents and audit are append-only for users: read and insert, never edit history.
create policy consents_select_own on public.consents for select to authenticated using ((select auth.uid()) = user_id);
create policy consents_insert_own on public.consents for insert to authenticated with check ((select auth.uid()) = user_id);
create policy audit_select_own on public.audit for select to authenticated using ((select auth.uid()) = user_id);
create policy audit_insert_own on public.audit for insert to authenticated with check ((select auth.uid()) = user_id);

-- ---------- storage: private bucket, one folder per user ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('user-files', 'user-files', false, 10485760)
on conflict (id) do nothing;

create policy user_files_select_own on storage.objects for select to authenticated
  using (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy user_files_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy user_files_update_own on storage.objects for update to authenticated
  using (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy user_files_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
