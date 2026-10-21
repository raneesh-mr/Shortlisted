-- Foreign keys are checked without RLS, so a user could otherwise point a row at
-- someone else's id (they still couldn't read it). These policies require every
-- reference to point at the user's own rows.
--
-- The ownership checks are SECURITY DEFINER functions: a policy on `cvs` that
-- queried `cvs` directly would recurse into its own policy. Each function only
-- answers "does the current user own this id?", so it reveals nothing else.
--
-- Policies are tightened with ALTER POLICY (not drop + create), so no rule is
-- ever missing, even for a moment.

create or replace function public.owns_cv(cv uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.cvs where id = cv and user_id = auth.uid());
$$;

create or replace function public.owns_application(app uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.applications where id = app and user_id = auth.uid());
$$;

create or replace function public.owns_email(email uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.emails where id = email and user_id = auth.uid());
$$;

revoke all on function public.owns_cv(uuid), public.owns_application(uuid), public.owns_email(uuid) from public, anon;
grant execute on function public.owns_cv(uuid), public.owns_application(uuid), public.owns_email(uuid) to authenticated;

alter policy emails_insert_own on public.emails
  with check ((select auth.uid()) = user_id and (application_id is null or public.owns_application(application_id)));
alter policy emails_update_own on public.emails
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and (application_id is null or public.owns_application(application_id)));

alter policy applications_insert_own on public.applications
  with check (
    (select auth.uid()) = user_id
    and (cv_id is null or public.owns_cv(cv_id))
    and (email_id is null or public.owns_email(email_id))
  );
alter policy applications_update_own on public.applications
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (cv_id is null or public.owns_cv(cv_id))
    and (email_id is null or public.owns_email(email_id))
  );

alter policy cv_versions_insert_own on public.cv_versions
  with check ((select auth.uid()) = user_id and public.owns_cv(cv_id));
alter policy cv_versions_update_own on public.cv_versions
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and public.owns_cv(cv_id));

alter policy cvs_insert_own on public.cvs
  with check ((select auth.uid()) = user_id and (base_cv_id is null or public.owns_cv(base_cv_id)));
alter policy cvs_update_own on public.cvs
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and (base_cv_id is null or public.owns_cv(base_cv_id)));
