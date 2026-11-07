-- VertexStealth: account dashboard + partner sign-in with a normal account.
-- Safe to run more than once. Adds only new functions (no table is changed).

-- 1) What is this signed-in person's relationship to the partner program?
--    Returns { status: none | pending | declined | active | suspended, code, name }.
--    Only answers for accounts whose email is CONFIRMED (Google sign-in is always confirmed).
create or replace function public.my_partner()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text; v_confirmed timestamptz; p public.partners; a public.partner_applications;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select lower(btrim(email)), coalesce(email_confirmed_at, confirmed_at) into v_email, v_confirmed
    from auth.users where id = auth.uid();
  if v_email is null or v_confirmed is null then return jsonb_build_object('status', 'none'); end if;

  select * into p from public.partners where lower(email) = v_email limit 1;
  if found then
    return jsonb_build_object('status', p.status, 'code', p.code, 'name', p.name);
  end if;

  select * into a from public.partner_applications where lower(email) = v_email order by created_at desc limit 1;
  if found then
    return jsonb_build_object('status', case a.status when 'approved' then 'pending' else a.status end);
  end if;
  return jsonb_build_object('status', 'none');
end $$;

-- 2) Create a partner-portal session for a partner whose email matches a verified account.
--    Only the Edge Function (service role) can call this; it has already verified the account's login token.
create or replace function public.partner_session_for_user(p_email text, p_session_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  select id into v_id from public.partners
   where lower(email) = lower(btrim(coalesce(p_email, ''))) and status = 'active';
  if v_id is null then return false; end if;
  delete from public.partner_sessions where expires_at < now();
  insert into public.partner_sessions (token_hash, partner_id, expires_at)
  values (p_session_hash, v_id, now() + interval '7 days');
  return true;
end $$;

-- 3) A short list of the devices tied to this account (for the dashboard). IDs are shortened.
create or replace function public.my_devices()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', right(device_id, 6), 'status', status, 'claimed_at', claimed_at) order by claimed_at desc nulls last)
      from public.devices where user_id = auth.uid()
  ), '[]'::jsonb);
end $$;

-- Permissions
revoke all on function public.my_partner() from public, anon;
grant execute on function public.my_partner() to authenticated, service_role;
revoke all on function public.my_devices() from public, anon;
grant execute on function public.my_devices() to authenticated, service_role;
revoke all on function public.partner_session_for_user(text, text) from public, anon, authenticated;
grant execute on function public.partner_session_for_user(text, text) to service_role;
