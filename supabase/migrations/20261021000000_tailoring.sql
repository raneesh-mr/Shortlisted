-- Phase 2: job description analysis, match, gap decisions and proposed CV changes
-- live with the application. jd_analysis already exists from the initial schema.

alter table public.applications
  add column base_cv_id uuid references public.cvs (id) on delete set null,
  add column match jsonb,
  add column gaps jsonb not null default '{}'::jsonb,
  add column tailor jsonb;

-- Extend the ownership checks to the new reference (ALTER, so no rule is ever missing).
alter policy applications_insert_own on public.applications
  with check (
    (select auth.uid()) = user_id
    and (cv_id is null or public.owns_cv(cv_id))
    and (base_cv_id is null or public.owns_cv(base_cv_id))
    and (email_id is null or public.owns_email(email_id))
  );
alter policy applications_update_own on public.applications
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (cv_id is null or public.owns_cv(cv_id))
    and (base_cv_id is null or public.owns_cv(base_cv_id))
    and (email_id is null or public.owns_email(email_id))
  );
