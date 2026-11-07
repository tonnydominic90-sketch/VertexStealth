-- VertexStealth: cancel subscription, export / delete data, delete account (self-service from /account).
-- Safe to run more than once. Run AFTER supabase/account-dashboard.sql. Nothing here deletes existing data.

-- 0) A deleted customer must not break the partner books: keep the referral row, just un-link the user.
do $$
declare r record;
begin
  for r in select conname from pg_constraint
            where conrelid = 'public.referrals'::regclass and contype = 'f' and confrelid = 'auth.users'::regclass
  loop execute format('alter table public.referrals drop constraint %I', r.conname); end loop;
  alter table public.referrals alter column referred_user_id drop not null;
  alter table public.referrals add constraint referrals_referred_user_id_fkey
    foreign key (referred_user_id) references auth.users(id) on delete set null;
end $$;

-- 1) Scheduled cancellations. The payment webhook (when payments go live) must NOT renew a user whose row here is 'scheduled'.
create table if not exists public.subscription_cancellations (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  plan         text,
  ends_at      timestamptz,
  reason       text,
  status       text not null default 'scheduled' check (status in ('scheduled', 'resumed'))
);
alter table public.subscription_cancellations enable row level security;  -- no policies: only the functions below can use it

-- 2) Minimal log of deleted accounts (no email, no name): for support statistics and billing follow-up.
create table if not exists public.account_deletions (
  id              bigint generated always as identity primary key,
  deleted_at      timestamptz not null default now(),
  plan            text,
  plan_expires_at timestamptz,
  reason          text
);
alter table public.account_deletions enable row level security;

-- ---------------------------------------------------------------------------------------------------------
create or replace function public.my_billing()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c public.subscription_cancellations;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into c from public.subscription_cancellations where user_id = auth.uid() and status = 'scheduled';
  if not found then return jsonb_build_object('cancel_scheduled', false); end if;
  return jsonb_build_object('cancel_scheduled', true, 'requested_at', c.requested_at, 'ends_at', c.ends_at);
end $$;

create or replace function public.cancel_my_subscription(p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ent jsonb; eff text; pl text; ends timestamptz;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  ent := public.my_entitlement();
  eff := coalesce(ent->>'effective', 'free');
  if eff in ('free', 'trial') then raise exception 'no_active_subscription'; end if;
  pl := ent->>'plan'; ends := nullif(ent->>'plan_expires_at', '')::timestamptz;
  insert into public.subscription_cancellations (user_id, plan, ends_at, reason, status)
  values (auth.uid(), pl, ends, left(nullif(btrim(coalesce(p_reason, '')), ''), 300), 'scheduled')
  on conflict (user_id) do update
    set requested_at = now(), plan = excluded.plan, ends_at = excluded.ends_at, reason = excluded.reason, status = 'scheduled';
  return jsonb_build_object('ok', true, 'ends_at', ends);
end $$;

create or replace function public.resume_my_subscription()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.subscription_cancellations set status = 'resumed' where user_id = auth.uid() and status = 'scheduled';
  return jsonb_build_object('ok', true);
end $$;

-- Everything we hold about the signed-in person, as one JSON document ("download my data").
create or replace function public.export_my_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_email text; v_created timestamptz; v_providers jsonb;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select email, created_at, coalesce(raw_app_meta_data->'providers', '[]'::jsonb) into v_email, v_created, v_providers from auth.users where id = uid;
  return jsonb_build_object(
    'exported_at', now(),
    'account', jsonb_build_object('id', uid, 'email', v_email, 'created_at', v_created, 'sign_in_methods', v_providers),
    'profile', (select to_jsonb(p) - 'id' - 'is_admin' from public.profiles p where p.id = uid),
    'browser_profile_registry', coalesce((select jsonb_agg(jsonb_build_object('profile_id', profile_id, 'device_id', device_id, 'created_at', created_at) order by created_at) from public.browser_profiles where user_id = uid), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(jsonb_build_object('device_id', device_id, 'status', status, 'claimed_at', claimed_at, 'trial_started_at', trial_started_at)) from public.devices where user_id = uid), '[]'::jsonb),
    'locations', coalesce((select jsonb_agg(to_jsonb(l) - 'user_id') from public.user_locations l where l.user_id = uid), '[]'::jsonb),
    'website_activity', coalesce((select jsonb_agg(jsonb_build_object('at', created_at, 'event', event, 'path', path, 'country', country, 'region', region, 'city', city, 'device', device, 'app_version', app_version) order by created_at desc) from (select * from public.site_events where user_id = uid order by created_at desc limit 5000) e), '[]'::jsonb),
    'crash_reports', coalesce((select jsonb_agg(jsonb_build_object('at', created_at, 'app_version', app_version, 'os', os, 'kind', kind, 'message', message) order by created_at desc) from (select * from public.crash_reports where user_id = uid order by created_at desc limit 500) c), '[]'::jsonb),
    'referral_claim', coalesce((select jsonb_agg(jsonb_build_object('code_used', code_used, 'source', source, 'status', status, 'created_at', created_at, 'upgraded_at', upgraded_at)) from public.referrals where referred_user_id = uid), '[]'::jsonb),
    'subscription_cancellation', (select to_jsonb(s) - 'user_id' from public.subscription_cancellations s where s.user_id = uid)
  );
end $$;

-- Erase the personal data tied to this account but KEEP the account (email, plan, terms acceptance, device ids).
create or replace function public.delete_my_data()
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n_bp int; n_cr int; n_ev int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  delete from public.browser_profiles where user_id = uid;  get diagnostics n_bp = row_count;
  delete from public.crash_reports   where user_id = uid;  get diagnostics n_cr = row_count;
  delete from public.site_events     where user_id = uid;  get diagnostics n_ev = row_count;
  delete from public.user_locations  where user_id = uid;
  update public.profiles set use_case = null, team_or_solo = null, account_scale = null, fingerprint_familiarity = null, referral_source = null where id = uid;
  update public.admin_audit_log set target_email = null where target_id = uid;
  return jsonb_build_object('ok', true, 'browser_profiles', n_bp, 'crash_reports', n_cr, 'website_events', n_ev);
end $$;

-- Permanently delete the account and its data. p_confirm must equal the account's email address.
create or replace function public.delete_my_account(p_confirm text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_email text; prof public.profiles; part public.partners;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select lower(btrim(email)) into v_email from auth.users where id = uid;
  if v_email is null then raise exception 'not_authenticated'; end if;
  if lower(btrim(coalesce(p_confirm, ''))) <> v_email then raise exception 'confirm_mismatch'; end if;
  select * into prof from public.profiles where id = uid;
  if found and prof.is_admin then raise exception 'admin_account'; end if;

  -- partner program: refuse while money is still owed either way; otherwise erase / anonymise the partner record
  select * into part from public.partners where lower(email) = v_email limit 1;
  if found then
    if exists (select 1 from public.partner_commissions c where c.partner_id = part.id and (c.status in ('pending', 'approved') or (c.status = 'reversed' and not c.recovered))) then
      raise exception 'partner_balance';
    end if;
    if exists (select 1 from public.partner_commissions where partner_id = part.id)
       or exists (select 1 from public.partner_payouts where partner_id = part.id)
       or exists (select 1 from public.referrals where partner_id = part.id) then
      update public.partners set name = 'Deleted partner', email = 'deleted-' || id::text || '@deleted.invalid', country = '-',
             status = 'suspended', payout_method = null, payout_details = null where id = part.id;
    else
      delete from public.partners where id = part.id;
    end if;
  end if;
  update public.partner_applications set name = 'Deleted', email = 'deleted-' || id::text || '@deleted.invalid', channel_url = null,
         promotion_plan = '[deleted]', ip_hash = null where lower(email) = v_email;
  delete from public.partner_applications a where a.email like 'deleted-%@deleted.invalid'
         and not exists (select 1 from public.partners p where p.application_id = a.id);

  -- personal data
  delete from public.site_events where user_id = uid;
  delete from public.crash_reports where user_id = uid;
  update public.admin_audit_log set target_email = null where target_id = uid;
  insert into public.account_deletions (plan, plan_expires_at, reason)
  values (prof.plan, prof.plan_expires_at, left(nullif(btrim(coalesce(p_reason, '')), ''), 300));

  -- the account itself. Cascades: profile, browser registry, locations, cancellation row; devices keep their row with user_id = null
  -- (so a deleted account cannot simply restart a free trial on the same computer); referrals keep partner history with user_id = null.
  delete from auth.users where id = uid;
  return jsonb_build_object('ok', true);
end $$;

-- Permissions: signed-in users only
do $$
declare f text;
begin
  foreach f in array array['my_billing()', 'cancel_my_subscription(text)', 'resume_my_subscription()', 'export_my_data()', 'delete_my_data()', 'delete_my_account(text, text)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
