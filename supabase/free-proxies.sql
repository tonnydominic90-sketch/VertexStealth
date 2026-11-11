-- VertexStealth free proxy list: NEW tables only. Safe to run more than once.
-- Run this once in the Supabase SQL Editor (same project as the app and the site). It does not change any existing table
-- except that it uses public.site_settings, which supabase/site-admin.sql already created.
-- Like the other admin tables, these are locked with row level security and NO policies: only the server
-- (service role key, used by the Vercel functions in /api) can read or write them.

-- 1) The source links an admin adds in Admin > Free proxies.
create table if not exists public.proxy_sources (
  id              bigint generated always as identity primary key,
  name            text not null,
  url             text not null,
  protocol        text not null default 'http' check (protocol in ('http', 'https', 'socks4', 'socks5', 'mixed')),
  enabled_site    boolean not null default true,    -- show the proxies from this source on the website
  enabled_app     boolean not null default true,    -- offer the proxies from this source in the desktop app
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid,
  last_fetched_at timestamptz,
  last_status     text,                             -- ok | error
  last_error      text,
  last_found      int not null default 0            -- valid ip:port entries found in the list at the last fetch
);
create unique index if not exists proxy_sources_url_uidx on public.proxy_sources (lower(url));

-- 2) The proxies we found in those lists and checked ourselves.
create table if not exists public.free_proxies (
  id            bigint generated always as identity primary key,
  ip            text not null,
  port          int not null check (port between 1 and 65535),
  protocol      text not null check (protocol in ('http', 'socks4', 'socks5')),
  https         boolean not null default false,     -- an HTTP proxy that also tunnels HTTPS (CONNECT works)
  country       text,                               -- 2-letter code
  latency_ms    int,                                -- time to open a test tunnel, measured from our server
  alive         boolean not null default false,
  checks        int not null default 0,
  successes     int not null default 0,
  fail_streak   int not null default 0,
  source_ids    bigint[] not null default '{}',     -- which sources list this proxy
  first_seen    timestamptz not null default now(),
  last_seen     timestamptz not null default now(), -- last time any enabled source listed it
  last_checked  timestamptz,
  last_alive_at timestamptz,
  unique (ip, port)
);
create index if not exists free_proxies_alive_idx   on public.free_proxies (alive, latency_ms);
create index if not exists free_proxies_sources_idx on public.free_proxies using gin (source_ids);
create index if not exists free_proxies_seen_idx    on public.free_proxies (last_seen);

alter table public.proxy_sources enable row level security;
alter table public.free_proxies  enable row level security;
revoke all on public.proxy_sources, public.free_proxies from anon, authenticated;

-- 3) A tiny lock so two visitors (or the daily cron and an admin) never start a refresh at the same moment.
-- Returns true when the caller may refresh now, false when a refresh started less than min_gap_seconds ago.
create or replace function public.claim_proxy_refresh(min_gap_seconds int) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.site_settings (key, value, updated_at)
  values ('proxy_refresh', jsonb_build_object('startedAt', now()), now())
  on conflict (key) do nothing;
  get diagnostics n = row_count;
  if n = 1 then return true; end if;
  update public.site_settings
     set value = jsonb_set(coalesce(value, '{}'::jsonb), '{startedAt}', to_jsonb(now())), updated_at = now()
   where key = 'proxy_refresh'
     and coalesce((value ->> 'startedAt')::timestamptz, 'epoch'::timestamptz) < now() - make_interval(secs => min_gap_seconds);
  get diagnostics n = row_count;
  return n = 1;
end;
$$;
revoke all on function public.claim_proxy_refresh(int) from public, anon, authenticated;
grant execute on function public.claim_proxy_refresh(int) to service_role;
