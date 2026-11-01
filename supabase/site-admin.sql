-- VertexStealth website admin panel: NEW tables only. Safe to run more than once.
-- Run this in the Supabase SQL Editor (same project as the desktop app). It does not change any existing table.
-- All tables are locked with row level security and NO policies: only the server (service role key, used by the
-- Vercel functions in /api) can read or write them. The browser can never touch them.

create table if not exists public.site_events (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  event         text not null default 'pageview',      -- pageview | signin | app_launch
  path          text,
  referrer_host text,
  country       text,                                  -- 2-letter code from the Vercel edge. No IP address is stored.
  region        text,
  city          text,
  device        text,                                  -- desktop | mobile | tablet | app
  user_id       uuid,
  app_version   text
);
create index if not exists site_events_created_idx on public.site_events (created_at desc);
create index if not exists site_events_country_idx on public.site_events (country);

create table if not exists public.user_locations (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  country    text,
  region     text,
  city       text,
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);

create table if not exists public.admin_audit_log (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  admin_id     uuid,
  admin_email  text,
  action       text not null,
  target_id    uuid,
  target_email text,
  details      jsonb
);
create index if not exists admin_audit_created_idx on public.admin_audit_log (created_at desc);

create table if not exists public.email_campaigns (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  sent_by       uuid,
  sent_by_email text,
  template_id   text,
  category      text,                                  -- service | marketing
  subject       text,
  audience      jsonb,
  recipients    int,
  sent          int,
  failed        int,
  status        text
);

create table if not exists public.email_optouts (
  email      text primary key,
  created_at timestamptz not null default now()
);

alter table public.site_events      enable row level security;
alter table public.user_locations   enable row level security;
alter table public.admin_audit_log  enable row level security;
alter table public.email_campaigns  enable row level security;
alter table public.email_optouts    enable row level security;

revoke all on public.site_events, public.user_locations, public.admin_audit_log, public.email_campaigns, public.email_optouts from anon, authenticated;

-- Keep analytics lean: delete page events older than 180 days (run by hand, or schedule with pg_cron).
create or replace function public.purge_old_site_events() returns void
language sql security definer set search_path = public as $$
  delete from public.site_events where created_at < now() - interval '180 days';
$$;
revoke all on function public.purge_old_site_events() from public, anon, authenticated;

-- 07: settings the admin panel can change at runtime (currently the download link). Run once in the Supabase SQL Editor.
create table if not exists public.site_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.site_settings enable row level security;
revoke all on public.site_settings from anon, authenticated;
