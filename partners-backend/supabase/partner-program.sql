-- =====================================================================
-- VertexStealth Partner Program - database migration (idempotent)
-- Run once in the Supabase SQL Editor, after your main schema.sql.
-- Needs: public.is_admin() (already in your schema) and auth.users.
-- =====================================================================

do $$ begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'public.is_admin() not found - run the main schema.sql first';
  end if;
end $$;

-- ---------- settings (edit values here, no redeploy needed) ----------
create table if not exists public.partner_settings (
  key   text primary key,
  value numeric not null
);
insert into public.partner_settings (key, value) values
  ('default_percent', 20),            -- commission % for new partners
  ('hold_days', 14),                  -- pending -> approved after this many days (refund window)
  ('min_payout', 50),                 -- USD, minimum approved balance for a payout
  ('attribution_days', 30),           -- how long a link click stays valid (website side)
  ('claim_window_hours', 72),         -- a new account can claim a referral code for this long
  ('applications_per_ip_per_day', 5)  -- anti-spam on the public application form
on conflict (key) do nothing;

create or replace function public._ps(k text) returns numeric
language sql stable security definer set search_path = public as
$$ select value from public.partner_settings where key = k $$;

-- ---------- tables ----------
create table if not exists public.partner_applications (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 2 and 120),
  email          text not null check (char_length(email) <= 160 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  country        text not null check (char_length(country) between 2 and 80),
  channel_url    text check (channel_url is null or (char_length(channel_url) <= 300 and channel_url ~* '^https?://')),
  promotion_plan text not null check (char_length(promotion_plan) between 30 and 1500),
  status         text not null default 'pending' check (status in ('pending','approved','declined')),
  decline_reason text check (decline_reason is null or char_length(decline_reason) <= 500),
  reviewed_by    uuid,
  reviewed_at    timestamptz,
  ip_hash        text,
  created_at     timestamptz not null default now()
);
create unique index if not exists partner_applications_open_email
  on public.partner_applications (lower(email)) where status in ('pending','approved');
create index if not exists partner_applications_ip_time
  on public.partner_applications (ip_hash, created_at);

create table if not exists public.partners (
  id                 uuid primary key default gen_random_uuid(),
  application_id     uuid unique references public.partner_applications(id),
  name               text not null,
  email              text not null,
  country            text not null,
  code               text not null unique check (code ~ '^[A-Z0-9]{8}$'),
  status             text not null default 'active' check (status in ('active','suspended')),
  commission_percent numeric(5,2) not null default 20 check (commission_percent between 0 and 100),
  payout_method      text check (payout_method is null or payout_method in ('paypal','usdt','bank','other')),
  payout_details     text check (payout_details is null or char_length(payout_details) <= 500),
  created_at         timestamptz not null default now()
);
create unique index if not exists partners_email_key on public.partners (lower(email));

create table if not exists public.partner_click_daily (
  partner_id uuid not null references public.partners(id) on delete cascade,
  day        date not null,
  clicks     integer not null default 0,
  primary key (partner_id, day)
);

create table if not exists public.referrals (
  id               uuid primary key default gen_random_uuid(),
  partner_id       uuid not null references public.partners(id),
  referred_user_id uuid not null unique references auth.users(id) on delete cascade,
  code_used        text not null,
  source           text not null default 'code' check (source in ('link','code')),
  status           text not null default 'signed_up' check (status in ('signed_up','upgraded')),
  created_at       timestamptz not null default now(),
  upgraded_at      timestamptz
);
create index if not exists referrals_partner on public.referrals (partner_id, created_at desc);

create table if not exists public.partner_payouts (
  id         uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id),
  amount     numeric(12,2) not null check (amount > 0),
  deductions numeric(12,2) not null default 0,
  method     text,
  details    text,
  reference  text check (reference is null or char_length(reference) <= 200),
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.partner_commissions (
  id                 uuid primary key default gen_random_uuid(),
  partner_id         uuid not null references public.partners(id),
  referral_id        uuid not null unique references public.referrals(id),   -- one commission per referred customer
  provider           text not null check (provider in ('creem','binance','manual')),
  payment_id         text not null,
  currency           text not null default 'USD',
  amount_paid        numeric(12,2) not null check (amount_paid > 0),
  commission_percent numeric(5,2) not null,
  commission_amount  numeric(12,2) not null check (commission_amount >= 0),
  status             text not null default 'pending' check (status in ('pending','approved','paid','cancelled','reversed')),
  eligible_at        timestamptz not null,
  approved_at        timestamptz,
  paid_at            timestamptz,
  payout_id          uuid references public.partner_payouts(id),
  cancel_reason      text,
  recovered          boolean not null default false,      -- reversed-after-paid amount already deducted from a later payout
  created_at         timestamptz not null default now(),
  unique (provider, payment_id)
);
create index if not exists partner_commissions_partner on public.partner_commissions (partner_id, status);

create table if not exists public.partner_login_tokens (
  token_hash text primary key,
  partner_id uuid not null references public.partners(id) on delete cascade,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.partner_sessions (
  token_hash text primary key,
  partner_id uuid not null references public.partners(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- ---------- lock the tables down: only the functions below touch them ----------
do $$
declare t text;
begin
  foreach t in array array['partner_settings','partner_applications','partners','partner_click_daily','referrals',
                           'partner_payouts','partner_commissions','partner_login_tokens','partner_sessions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---------- helpers ----------
create or replace function public._partner_require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

create or replace function public._approve_due_commissions() returns void
language sql volatile security definer set search_path = public as $$
  update public.partner_commissions
     set status = 'approved', approved_at = now()
   where status = 'pending' and eligible_at <= now();
$$;

create or replace function public._gen_partner_code() returns text
language plpgsql volatile security definer set search_path = public as $$
declare alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; i int;
begin
  loop
    c := '';
    for i in 1..8 loop c := c || substr(alphabet, 1 + floor(random() * 32)::int, 1); end loop;
    exit when not exists (select 1 from public.partners where code = c);
  end loop;
  return c;
end $$;

-- =====================================================================
-- PUBLIC FORM  (called by the partner-apply Edge Function, service role only)
-- =====================================================================
create or replace function public.submit_partner_application(
  p_name text, p_email text, p_country text, p_channel text, p_plan text, p_ip_hash text
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid; v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if p_ip_hash is not null and (
       select count(*) from public.partner_applications
        where ip_hash = p_ip_hash and created_at > now() - interval '24 hours'
     ) >= public._ps('applications_per_ip_per_day') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  if exists (select 1 from public.partners where lower(email) = v_email)
     or exists (select 1 from public.partner_applications
                 where lower(email) = v_email and status in ('pending','approved')) then
    return jsonb_build_object('status', 'duplicate');
  end if;

  insert into public.partner_applications (name, email, country, channel_url, promotion_plan, ip_hash)
  values (btrim(coalesce(p_name,'')), v_email, btrim(coalesce(p_country,'')),
          nullif(btrim(coalesce(p_channel,'')), ''), btrim(coalesce(p_plan,'')), p_ip_hash)
  returning id into v_id;
  return jsonb_build_object('status', 'created', 'id', v_id);
exception
  when check_violation then return jsonb_build_object('status', 'invalid');
  when unique_violation then return jsonb_build_object('status', 'duplicate');
end $$;

-- =====================================================================
-- ADMIN  (called by a signed-in admin; every function re-checks is_admin())
-- =====================================================================
create or replace function public.admin_partner_applications(p_status text default null)
returns table (id uuid, name text, email text, country text, channel_url text, promotion_plan text,
               status text, decline_reason text, reviewed_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._partner_require_admin();
  return query
    select a.id, a.name, a.email, a.country, a.channel_url, a.promotion_plan,
           a.status, a.decline_reason, a.reviewed_at, a.created_at
      from public.partner_applications a
     where p_status is null or a.status = p_status
     order by (a.status = 'pending') desc, a.created_at desc
     limit 500;
end $$;

create or replace function public.admin_review_partner_application(
  p_id uuid, p_action text, p_reason text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare a public.partner_applications; v_code text;
begin
  perform public._partner_require_admin();
  select * into a from public.partner_applications where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if a.status <> 'pending' then raise exception 'already_reviewed'; end if;

  if p_action = 'approve' then
    v_code := public._gen_partner_code();
    insert into public.partners (application_id, name, email, country, code, commission_percent)
    values (a.id, a.name, a.email, a.country, v_code, public._ps('default_percent'));
    update public.partner_applications
       set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() where id = a.id;
    return jsonb_build_object('action','approve','name',a.name,'email',a.email,'code',v_code);
  elsif p_action = 'decline' then
    update public.partner_applications
       set status = 'declined', reviewed_by = auth.uid(), reviewed_at = now(),
           decline_reason = nullif(left(btrim(coalesce(p_reason,'')), 500), '')
     where id = a.id;
    return jsonb_build_object('action','decline','name',a.name,'email',a.email,
                              'reason', nullif(left(btrim(coalesce(p_reason,'')), 500), ''));
  else
    raise exception 'bad_action';
  end if;
end $$;

create or replace function public.admin_list_partners()
returns table (id uuid, name text, email text, country text, code text, status text,
               commission_percent numeric, payout_method text, payout_details text, created_at timestamptz,
               clicks bigint, signups bigint, upgrades bigint,
               pending numeric, approved numeric, paid numeric, owed_back numeric)
language plpgsql volatile security definer set search_path = public as $$
begin
  perform public._partner_require_admin();
  perform public._approve_due_commissions();
  return query
    select p.id, p.name, p.email, p.country, p.code, p.status, p.commission_percent,
           p.payout_method, p.payout_details, p.created_at,
           coalesce((select sum(c.clicks) from public.partner_click_daily c where c.partner_id = p.id), 0)::bigint,
           (select count(*) from public.referrals r where r.partner_id = p.id),
           (select count(*) from public.referrals r where r.partner_id = p.id and r.status = 'upgraded'),
           coalesce((select sum(m.commission_amount) from public.partner_commissions m where m.partner_id = p.id and m.status = 'pending'), 0),
           coalesce((select sum(m.commission_amount) from public.partner_commissions m where m.partner_id = p.id and m.status = 'approved'), 0),
           coalesce((select sum(m.commission_amount) from public.partner_commissions m where m.partner_id = p.id and m.status = 'paid'), 0),
           coalesce((select sum(m.commission_amount) from public.partner_commissions m where m.partner_id = p.id and m.status = 'reversed' and not m.recovered), 0)
      from public.partners p
     order by p.created_at desc;
end $$;

create or replace function public.admin_set_partner(p_id uuid, p_status text default null, p_percent numeric default null)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform public._partner_require_admin();
  if p_status is not null and p_status not in ('active','suspended') then raise exception 'bad_status'; end if;
  if p_percent is not null and (p_percent < 0 or p_percent > 100) then raise exception 'bad_percent'; end if;
  update public.partners
     set status = coalesce(p_status, status), commission_percent = coalesce(p_percent, commission_percent)
   where id = p_id;
  if not found then raise exception 'not_found'; end if;
end $$;

create or replace function public.admin_partner_commissions(p_status text default null)
returns table (id uuid, partner_id uuid, partner_name text, partner_code text, referral_ref text,
               provider text, amount_paid numeric, commission_percent numeric, commission_amount numeric,
               status text, eligible_at timestamptz, created_at timestamptz, cancel_reason text, recovered boolean)
language plpgsql volatile security definer set search_path = public as $$
begin
  perform public._partner_require_admin();
  perform public._approve_due_commissions();
  return query
    select m.id, m.partner_id, p.name, p.code, 'R-' || upper(substr(replace(m.referral_id::text,'-',''), 1, 6)),
           m.provider, m.amount_paid, m.commission_percent, m.commission_amount,
           m.status, m.eligible_at, m.created_at, m.cancel_reason, m.recovered
      from public.partner_commissions m join public.partners p on p.id = m.partner_id
     where p_status is null or m.status = p_status
     order by m.created_at desc limit 500;
end $$;

create or replace function public.admin_cancel_commission(p_id uuid, p_reason text default null)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare m public.partner_commissions; v_new text;
begin
  perform public._partner_require_admin();
  select * into m from public.partner_commissions where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if m.status in ('cancelled','reversed') then raise exception 'already_closed'; end if;
  v_new := case when m.status = 'paid' then 'reversed' else 'cancelled' end;
  update public.partner_commissions
     set status = v_new, cancel_reason = nullif(left(btrim(coalesce(p_reason,'')), 300), '')
   where id = p_id;
  return v_new;
end $$;

create or replace function public.admin_record_partner_payout(p_partner uuid, p_reference text default null, p_force boolean default false)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare p public.partners; v_gross numeric; v_ded numeric; v_net numeric; v_id uuid; v_n int;
begin
  perform public._partner_require_admin();
  select * into p from public.partners where id = p_partner for update;
  if not found then raise exception 'not_found'; end if;
  perform public._approve_due_commissions();

  select coalesce(sum(commission_amount), 0), count(*) into v_gross, v_n
    from public.partner_commissions where partner_id = p.id and status = 'approved';
  select coalesce(sum(commission_amount), 0) into v_ded
    from public.partner_commissions where partner_id = p.id and status = 'reversed' and not recovered;
  v_net := v_gross - v_ded;

  if v_n = 0 or v_net <= 0 then raise exception 'nothing_to_pay'; end if;
  if v_net < public._ps('min_payout') and not p_force then raise exception 'below_minimum'; end if;

  insert into public.partner_payouts (partner_id, amount, deductions, method, details, reference, created_by)
  values (p.id, v_net, v_ded, p.payout_method, p.payout_details, nullif(left(btrim(coalesce(p_reference,'')), 200), ''), auth.uid())
  returning id into v_id;

  update public.partner_commissions
     set status = 'paid', paid_at = now(), payout_id = v_id
   where partner_id = p.id and status = 'approved';
  update public.partner_commissions set recovered = true
   where partner_id = p.id and status = 'reversed' and not recovered;

  return jsonb_build_object('payout_id', v_id, 'amount', v_net, 'deductions', v_ded, 'commissions', v_n,
                            'method', p.payout_method, 'details', p.payout_details);
end $$;

create or replace function public.admin_list_partner_payouts(p_partner uuid default null)
returns table (id uuid, partner_id uuid, partner_name text, amount numeric, deductions numeric,
               method text, details text, reference text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._partner_require_admin();
  return query
    select o.id, o.partner_id, p.name, o.amount, o.deductions, o.method, o.details, o.reference, o.created_at
      from public.partner_payouts o join public.partners p on p.id = o.partner_id
     where p_partner is null or o.partner_id = p_partner
     order by o.created_at desc limit 300;
end $$;

-- =====================================================================
-- APP  (a signed-in VertexStealth user claims a referral code)
-- =====================================================================
create or replace function public.claim_referral(p_code text, p_source text default 'code')
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_code text := upper(btrim(coalesce(p_code, '')));
        p public.partners; u_email text; u_created timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_source not in ('link','code') then p_source := 'code'; end if;
  if v_code !~ '^[A-Z0-9]{8}$' then return jsonb_build_object('status','invalid_code'); end if;

  select * into p from public.partners where code = v_code and status = 'active';
  if not found then return jsonb_build_object('status','invalid_code'); end if;

  if exists (select 1 from public.referrals where referred_user_id = v_uid) then
    return jsonb_build_object('status','already_referred');
  end if;

  select lower(email), created_at into u_email, u_created from auth.users where id = v_uid;
  if u_created is null or u_created < now() - make_interval(hours => public._ps('claim_window_hours')::int) then
    return jsonb_build_object('status','too_late');
  end if;
  if u_email is not null and u_email = lower(p.email) then
    return jsonb_build_object('status','self_referral');
  end if;

  insert into public.referrals (partner_id, referred_user_id, code_used, source)
  values (p.id, v_uid, v_code, p_source);
  return jsonb_build_object('status','ok');
exception when unique_violation then
  return jsonb_build_object('status','already_referred');
end $$;

-- =====================================================================
-- PAYMENT HOOKS  (called from the Creem / Binance webhook functions, service role only)
-- =====================================================================
create or replace function public.record_partner_commission(
  p_user_id uuid, p_provider text, p_payment_id text, p_amount numeric, p_currency text default 'USD'
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare r public.referrals; p public.partners; v_comm numeric; v_id uuid;
begin
  if p_amount is null or p_amount <= 0 then return jsonb_build_object('status','bad_amount'); end if;
  if upper(coalesce(p_currency,'')) <> 'USD' then return jsonb_build_object('status','unsupported_currency'); end if;

  select * into r from public.referrals where referred_user_id = p_user_id for update;
  if not found then return jsonb_build_object('status','no_referral'); end if;
  select * into p from public.partners where id = r.partner_id;
  if p.status <> 'active' then return jsonb_build_object('status','partner_suspended'); end if;

  if exists (select 1 from public.partner_commissions where referral_id = r.id) then
    return jsonb_build_object('status','already_commissioned');
  end if;

  v_comm := round(p_amount * p.commission_percent / 100, 2);
  insert into public.partner_commissions
    (partner_id, referral_id, provider, payment_id, currency, amount_paid, commission_percent, commission_amount, eligible_at)
  values (p.id, r.id, p_provider, p_payment_id, 'USD', round(p_amount, 2), p.commission_percent, v_comm,
          now() + make_interval(days => public._ps('hold_days')::int))
  returning id into v_id;
  update public.referrals set status = 'upgraded', upgraded_at = now() where id = r.id;
  return jsonb_build_object('status','created','commission_id', v_id, 'commission', v_comm);
exception when unique_violation then
  return jsonb_build_object('status','duplicate');
end $$;

create or replace function public.cancel_partner_commission_for_payment(p_provider text, p_payment_id text, p_reason text default 'refunded')
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare m public.partner_commissions; v_new text;
begin
  select * into m from public.partner_commissions where provider = p_provider and payment_id = p_payment_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if m.status in ('cancelled','reversed') then return jsonb_build_object('status','already_closed'); end if;
  v_new := case when m.status = 'paid' then 'reversed' else 'cancelled' end;
  update public.partner_commissions set status = v_new, cancel_reason = left(coalesce(p_reason,'refunded'), 300) where id = m.id;
  return jsonb_build_object('status', v_new);
end $$;

-- =====================================================================
-- WEBSITE  (referral link clicks + partner portal), service role only
-- =====================================================================
create or replace function public.partner_record_click(p_code text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.partners where code = upper(btrim(coalesce(p_code,''))) and status = 'active';
  if v_id is null then return false; end if;
  insert into public.partner_click_daily (partner_id, day, clicks) values (v_id, current_date, 1)
  on conflict (partner_id, day) do update set clicks = public.partner_click_daily.clicks + 1;
  return true;
end $$;

create or replace function public.partner_login_request(p_email text, p_token_hash text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare p public.partners;
begin
  delete from public.partner_login_tokens where expires_at < now() - interval '1 day';
  delete from public.partner_sessions where expires_at < now();
  select * into p from public.partners where lower(email) = lower(btrim(coalesce(p_email,''))) and status = 'active';
  if not found then return jsonb_build_object('sent', false, 'reason', 'unknown'); end if;
  if (select count(*) from public.partner_login_tokens where partner_id = p.id and created_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('sent', false, 'reason', 'rate');
  end if;
  insert into public.partner_login_tokens (token_hash, partner_id, expires_at)
  values (p_token_hash, p.id, now() + interval '20 minutes');
  return jsonb_build_object('sent', true, 'name', p.name, 'email', p.email);
end $$;

create or replace function public.partner_login_exchange(p_token_hash text, p_session_hash text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare t public.partner_login_tokens;
begin
  select * into t from public.partner_login_tokens
   where token_hash = p_token_hash and used_at is null and expires_at > now() for update;
  if not found then return false; end if;
  if not exists (select 1 from public.partners where id = t.partner_id and status = 'active') then return false; end if;
  update public.partner_login_tokens set used_at = now() where token_hash = t.token_hash;
  insert into public.partner_sessions (token_hash, partner_id, expires_at)
  values (p_session_hash, t.partner_id, now() + interval '7 days');
  return true;
end $$;

create or replace function public.partner_session_partner(p_session_hash text) returns uuid
language sql stable security definer set search_path = public as $$
  select s.partner_id from public.partner_sessions s join public.partners p on p.id = s.partner_id
   where s.token_hash = p_session_hash and s.expires_at > now() and p.status = 'active'
$$;

create or replace function public.partner_logout(p_session_hash text) returns void
language sql volatile security definer set search_path = public as $$
  delete from public.partner_sessions where token_hash = p_session_hash
$$;

create or replace function public.partner_save_payout(p_partner_id uuid, p_method text, p_details text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if p_method not in ('paypal','usdt','bank','other') then raise exception 'bad_method'; end if;
  if char_length(btrim(coalesce(p_details,''))) not between 3 and 500 then raise exception 'bad_details'; end if;
  update public.partners set payout_method = p_method, payout_details = btrim(p_details) where id = p_partner_id;
end $$;

create or replace function public.partner_portal_summary(p_partner_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare p public.partners; res jsonb;
begin
  select * into p from public.partners where id = p_partner_id;
  if not found then return null; end if;
  perform public._approve_due_commissions();
  res := jsonb_build_object(
    'partner', jsonb_build_object('name', p.name, 'email', p.email, 'code', p.code, 'status', p.status,
                'commission_percent', p.commission_percent, 'payout_method', p.payout_method, 'payout_details', p.payout_details),
    'settings', jsonb_build_object('hold_days', public._ps('hold_days'), 'min_payout', public._ps('min_payout'),
                'attribution_days', public._ps('attribution_days')),
    'stats', jsonb_build_object(
      'clicks_30d', coalesce((select sum(clicks) from public.partner_click_daily where partner_id = p.id and day > current_date - 30), 0),
      'clicks_total', coalesce((select sum(clicks) from public.partner_click_daily where partner_id = p.id), 0),
      'signups', (select count(*) from public.referrals where partner_id = p.id),
      'upgrades', (select count(*) from public.referrals where partner_id = p.id and status = 'upgraded')),
    'balances', jsonb_build_object(
      'pending',  coalesce((select sum(commission_amount) from public.partner_commissions where partner_id = p.id and status = 'pending'), 0),
      'approved', coalesce((select sum(commission_amount) from public.partner_commissions where partner_id = p.id and status = 'approved'), 0),
      'paid',     coalesce((select sum(commission_amount) from public.partner_commissions where partner_id = p.id and status = 'paid'), 0),
      'owed_back',coalesce((select sum(commission_amount) from public.partner_commissions where partner_id = p.id and status = 'reversed' and not recovered), 0)),
    'referrals', coalesce((select jsonb_agg(x order by x->>'created_at' desc) from (
        select jsonb_build_object('ref', 'R-' || upper(substr(replace(id::text,'-',''),1,6)), 'source', source,
                                  'status', status, 'created_at', created_at) x
          from public.referrals where partner_id = p.id order by created_at desc limit 50) q), '[]'::jsonb),
    'commissions', coalesce((select jsonb_agg(x order by x->>'created_at' desc) from (
        select jsonb_build_object('amount_paid', amount_paid, 'commission_amount', commission_amount, 'status', status,
                                  'eligible_at', eligible_at, 'created_at', created_at) x
          from public.partner_commissions where partner_id = p.id order by created_at desc limit 50) q), '[]'::jsonb),
    'payouts', coalesce((select jsonb_agg(x order by x->>'created_at' desc) from (
        select jsonb_build_object('amount', amount, 'method', method, 'reference', reference, 'created_at', created_at) x
          from public.partner_payouts where partner_id = p.id order by created_at desc limit 20) q), '[]'::jsonb)
  );
  return res;
end $$;

-- ---------- permissions ----------
do $$
declare f text;
begin
  -- service-role-only functions
  foreach f in array array[
    'submit_partner_application(text,text,text,text,text,text)',
    'record_partner_commission(uuid,text,text,numeric,text)',
    'cancel_partner_commission_for_payment(text,text,text)',
    'partner_record_click(text)', 'partner_login_request(text,text)', 'partner_login_exchange(text,text)',
    'partner_session_partner(text)', 'partner_logout(text)', 'partner_save_payout(uuid,text,text)',
    'partner_portal_summary(uuid)',
    '_approve_due_commissions()', '_gen_partner_code()', '_ps(text)', '_partner_require_admin()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  -- signed-in users: admin RPCs (they re-check is_admin) and claim_referral
  foreach f in array array[
    'admin_partner_applications(text)', 'admin_review_partner_application(uuid,text,text)', 'admin_list_partners()',
    'admin_set_partner(uuid,text,numeric)', 'admin_partner_commissions(text)', 'admin_cancel_commission(uuid,text)',
    'admin_record_partner_payout(uuid,text,boolean)', 'admin_list_partner_payouts(uuid)', 'claim_referral(text,text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
