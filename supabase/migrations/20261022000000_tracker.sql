-- Phase 4: tracker. applied_at and next_action_at already exist from the initial schema.
-- Reminder state is per application: pending, done or dismissed for day 7 and day 14.

alter table public.applications
  add column reminders jsonb not null default '{"day7":"pending","day14":"pending"}'::jsonb;

create index applications_status_idx on public.applications (user_id, status, next_action_at);
