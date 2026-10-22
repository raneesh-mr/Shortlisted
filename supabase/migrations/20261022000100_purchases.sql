-- Paid CV downloads (Razorpay). Rows are written only by the server with the
-- service role; users can read their own. Purchase records are kept for tax
-- (GST) when an account is deleted, but the link to the person is removed.

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  cv_id uuid references public.cvs (id) on delete set null,
  sku text not null check (sku in ('cv_download')),
  amount integer not null check (amount > 0),
  currency text not null default 'INR',
  provider text not null default 'razorpay',
  order_id text not null unique,
  payment_id text unique,
  status text not null default 'created' check (status in ('created', 'paid', 'failed', 'refunded')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index purchases_user_cv_idx on public.purchases (user_id, cv_id, status);
create index purchases_cv_idx on public.purchases (cv_id);
create trigger purchases_updated before update on public.purchases for each row execute function public.set_updated_at();

alter table public.purchases enable row level security;
create policy purchases_select_own on public.purchases for select to authenticated using ((select auth.uid()) = user_id);
-- No insert/update/delete policies: only the server (service role) writes purchases.

-- Quick flow state (imported fact ids, which ones need a check) lives with the application.
alter table public.applications add column quick jsonb;
