-- minimal stand-ins for what Supabase provides (test only)
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text, created_at timestamptz not null default now());
-- same logic Supabase's auth.uid() uses: legacy per-claim setting, else the JSON claims PostgREST sets
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
create table if not exists public.profiles (id uuid primary key references auth.users(id) on delete cascade, email text, is_admin boolean not null default false);
create or replace function public.is_admin() returns boolean language sql stable security definer as $$ select coalesce((select is_admin from public.profiles where id = auth.uid()), false) $$;
grant usage on schema public, auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to public;
