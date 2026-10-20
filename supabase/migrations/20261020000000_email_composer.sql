-- Phase 3: application email composer.
-- The composer inputs (recipient, how the role was found, tone…) live with the application,
-- and each email keeps its subject options and how it was made.

alter table public.applications
  add column compose jsonb not null default '{}'::jsonb;

alter table public.applications
  alter column role set default '',
  alter column company set default '',
  alter column jd_text set default '';

alter table public.emails
  add column recipient text,
  add column meta jsonb not null default '{}'::jsonb;

create index applications_user_idx on public.applications (user_id, updated_at desc);
create index emails_application_idx on public.emails (application_id, created_at desc);
