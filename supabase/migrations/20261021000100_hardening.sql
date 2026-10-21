-- Hardening after Supabase's security and performance advisors (no data changes).

-- 1. The signup trigger function must never be callable through the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 2. Ownership helpers are only for RLS policies: keep them out of the exposed
--    "public" API schema. Policies reference functions by identity, so they
--    keep working after the move.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
alter function public.owns_cv(uuid) set schema private;
alter function public.owns_application(uuid) set schema private;
alter function public.owns_email(uuid) set schema private;

-- 3. Cover foreign keys with indexes (faster cascades and lookups).
create index if not exists applications_cv_id_idx on public.applications (cv_id);
create index if not exists applications_base_cv_id_idx on public.applications (base_cv_id);
create index if not exists applications_email_id_idx on public.applications (email_id);
create index if not exists cvs_base_cv_id_idx on public.cvs (base_cv_id);
create index if not exists audit_user_id_idx on public.audit (user_id);
create index if not exists cv_versions_user_id_idx on public.cv_versions (user_id);
create index if not exists emails_user_id_idx on public.emails (user_id);
