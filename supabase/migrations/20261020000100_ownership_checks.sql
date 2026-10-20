-- Foreign keys are checked without RLS, so a user could otherwise point a row at
-- someone else's id (they still couldn't read it). These policies require every
-- reference to point at the user's own rows.
--
-- The ownership checks are SECURITY DEFINER functions: a policy on `cvs` that
-- queried `cvs` directly would recurse into its own policy. Each function only
-- answers "does the current user own this id?", so it reveals nothing else.

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

drop policy emails_insert_own on public.emails;
drop policy emails_update_own on public.emails;
create policy emails_insert_own on public.emails for insert to authenticated
  with check ((select auth.uid()) = user_id and (application_id is null or public.owns_application(application_id)));
create policy emails_update_own on public.emails for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and (application_id is null or public.owns_application(application_id)));

drop policy applications_insert_own on public.applications;
drop policy applications_update_own on public.applications;
create policy applications_insert_own on public.applications for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (cv_id is null or public.owns_cv(cv_id))
    and (email_id is null or public.owns_email(email_id))
  );
create policy applications_update_own on public.applications for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (cv_id is null or public.owns_cv(cv_id))
    and (email_id is null or public.owns_email(email_id))
  );

drop policy cv_versions_insert_own on public.cv_versions;
drop policy cv_versions_update_own on public.cv_versions;
create policy cv_versions_insert_own on public.cv_versions for insert to authenticated
  with check ((select auth.uid()) = user_id and public.owns_cv(cv_id));
create policy cv_versions_update_own on public.cv_versions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and public.owns_cv(cv_id));

drop policy cvs_insert_own on public.cvs;
drop policy cvs_update_own on public.cvs;
create policy cvs_insert_own on public.cvs for insert to authenticated
  with check ((select auth.uid()) = user_id and (base_cv_id is null or public.owns_cv(base_cv_id)));
create policy cvs_update_own on public.cvs for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and (base_cv_id is null or public.owns_cv(base_cv_id)));
