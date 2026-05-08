create extension if not exists pgcrypto;

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  device_key text unique not null,
  user_id uuid,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  app_version text,
  platform text,
  theme text
);

alter table public.devices add column if not exists user_id uuid;

create table if not exists public.ai_interactions (
  id uuid primary key default gen_random_uuid(),
  device_key text not null,
  created_at timestamptz not null default now(),
  round_number int,
  question text,
  user_answer text,
  result_type text,
  next_question text,
  meditation_script text,
  error text,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists ai_interactions_created_at_idx on public.ai_interactions (created_at desc);
create index if not exists ai_interactions_device_key_idx on public.ai_interactions (device_key);
create index if not exists devices_user_id_idx on public.devices (user_id);

create table if not exists public.app_events (
  id uuid primary key default gen_random_uuid(),
  device_key text not null,
  created_at timestamptz not null default now(),
  event_name text not null,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists app_events_created_at_idx on public.app_events (created_at desc);
create index if not exists app_events_device_key_idx on public.app_events (device_key);

alter table public.devices enable row level security;
alter table public.ai_interactions enable row level security;
alter table public.app_events enable row level security;

drop policy if exists devices_anon_upsert on public.devices;
create policy devices_anon_upsert
on public.devices
for all
to anon
using (true)
with check (true);

drop policy if exists devices_admin_read on public.devices;
create policy devices_admin_read
on public.devices
for select
to authenticated
using (true);

drop policy if exists ai_anon_insert on public.ai_interactions;
create policy ai_anon_insert
on public.ai_interactions
for insert
to anon
with check (true);

drop policy if exists ai_admin_read on public.ai_interactions;
create policy ai_admin_read
on public.ai_interactions
for select
to authenticated
using (true);

drop policy if exists events_anon_insert on public.app_events;
create policy events_anon_insert
on public.app_events
for insert
to anon
with check (true);

drop policy if exists events_admin_read on public.app_events;
create policy events_admin_read
on public.app_events
for select
to authenticated
using (true);

create table if not exists public.plans (
  id text primary key,
  product_type text not null,
  platform text not null,
  title text not null,
  price_cents int not null,
  currency text not null default 'USD',
  trial_days int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

create table if not exists public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  plan_id text not null references public.plans(id),
  status text not null,
  current_period_end timestamptz,
  source text not null,
  device_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_event jsonb not null default '{}'::jsonb
);

create index if not exists entitlements_user_id_idx on public.entitlements (user_id);
create unique index if not exists entitlements_user_plan_uidx on public.entitlements (user_id, plan_id);
create index if not exists entitlements_status_idx on public.entitlements (status);
create index if not exists entitlements_updated_at_idx on public.entitlements (updated_at desc);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  plan_id text references public.plans(id),
  provider text not null,
  provider_tx_id text not null,
  purchased_at timestamptz not null default now(),
  expires_at timestamptz,
  amount_cents int,
  currency text,
  status text not null,
  raw jsonb not null default '{}'::jsonb
);

create unique index if not exists purchases_provider_tx_id_uidx on public.purchases (provider, provider_tx_id);
create index if not exists purchases_user_id_idx on public.purchases (user_id);
create index if not exists purchases_purchased_at_idx on public.purchases (purchased_at desc);

alter table public.plans enable row level security;
alter table public.entitlements enable row level security;
alter table public.purchases enable row level security;

drop policy if exists plans_public_read on public.plans;
create policy plans_public_read
on public.plans
for select
to anon, authenticated
using (is_active = true);

drop policy if exists plans_admin_manage on public.plans;
create policy plans_admin_manage
on public.plans
for all
to authenticated
using ((auth.jwt() ->> 'email') = '1931118560@qq.com')
with check ((auth.jwt() ->> 'email') = '1931118560@qq.com');

drop policy if exists entitlements_user_read on public.entitlements;
create policy entitlements_user_read
on public.entitlements
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists entitlements_admin_manage on public.entitlements;
create policy entitlements_admin_manage
on public.entitlements
for all
to authenticated
using ((auth.jwt() ->> 'email') = '1931118560@qq.com')
with check ((auth.jwt() ->> 'email') = '1931118560@qq.com');

drop policy if exists purchases_user_read on public.purchases;
create policy purchases_user_read
on public.purchases
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists purchases_admin_manage on public.purchases;
create policy purchases_admin_manage
on public.purchases
for all
to authenticated
using ((auth.jwt() ->> 'email') = '1931118560@qq.com')
with check ((auth.jwt() ->> 'email') = '1931118560@qq.com');

insert into public.plans (id, product_type, platform, title, price_cents, currency, trial_days, is_active, meta)
values
  ('pro_monthly', 'subscription', 'ios', 'MindPlan Pro Monthly', 799, 'USD', 7, true, '{"revenuecat_entitlement":"pro_access"}'::jsonb)
on conflict (id) do update set
  product_type = excluded.product_type,
  platform = excluded.platform,
  title = excluded.title,
  price_cents = excluded.price_cents,
  currency = excluded.currency,
  trial_days = excluded.trial_days,
  is_active = excluded.is_active,
  meta = excluded.meta,
  updated_at = now();

create or replace function public.admin_upsert_entitlement(
  p_user_id uuid,
  p_plan_id text,
  p_status text,
  p_current_period_end timestamptz
)
returns void
language plpgsql
security definer
as $$
begin
  if (auth.jwt() ->> 'email') is distinct from '1931118560@qq.com' then
    raise exception 'not_allowed';
  end if;

  insert into public.entitlements (user_id, plan_id, status, current_period_end, source, updated_at)
  values (p_user_id, p_plan_id, p_status, p_current_period_end, 'admin', now())
  on conflict (user_id, plan_id) do update set
    status = excluded.status,
    current_period_end = excluded.current_period_end,
    source = excluded.source,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.admin_upsert_entitlement(uuid, text, text, timestamptz) from public;
grant execute on function public.admin_upsert_entitlement(uuid, text, text, timestamptz) to authenticated;
