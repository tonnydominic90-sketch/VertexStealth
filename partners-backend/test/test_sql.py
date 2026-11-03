import psycopg2, json, threading, uuid, sys, time
fails = []; n = 0
def check(name, cond, extra=''):
    global n; n += 1
    if not cond: fails.append(f'{name} {extra}'); print('FAIL', name, extra)
def conn():
    c = psycopg2.connect(host='localhost', user='postgres', password='pw', dbname='vs_test'); c.autocommit = True; return c
C = conn()
def call(role, uid, sql, args=(), c=None):
    c = c or C; cur = c.cursor()
    cur.execute('reset role'); cur.execute("select set_config('request.jwt.claim.sub', %s, false)", (uid or '',))
    if role: cur.execute(f'set role {role}')
    try:
        cur.execute(sql, args)
        return ('ok', cur.fetchall() if cur.description else None)
    except psycopg2.Error as e:
        return ('err', (e.pgerror or str(e)).strip().split('\n')[0])
    finally:
        cur.execute('reset role')
def su(sql, args=()):
    cur = C.cursor(); cur.execute('reset role'); cur.execute(sql, args)
    return cur.fetchall() if cur.description else None
def val(r): return r[1][0][0]

# ---- reset + fixtures
su("truncate partner_login_tokens, partner_sessions, partner_commissions, partner_payouts, referrals, partner_click_daily, partners, partner_applications restart identity cascade")
su("delete from auth.users")
def mkuser(email, days_old=0, admin=False):
    uid = str(uuid.uuid4())
    su("insert into auth.users(id,email,created_at) values (%s,%s, now() - make_interval(days => %s))", (uid, email, days_old))
    su("insert into profiles(id,email,is_admin) values (%s,%s,%s)", (uid, email, admin)); return uid
ADMIN = mkuser('admin@x.com', 30, True); U1 = mkuser('u1@x.com'); U2 = mkuser('u2@x.com'); U3 = mkuser('u3@x.com')
U4 = mkuser('u4@x.com'); OLD = mkuser('old@x.com', 10); SELF = mkuser('pat@creator.com')
PLAN = 'I will publish a YouTube tutorial and link it in the description for my browser tools audience.'
def apply(name, email, ip='iphash1', plan=PLAN, country='Kenya', channel=''):
    return val(call('service_role', None, 'select submit_partner_application(%s,%s,%s,%s,%s,%s)', (name, email, country, channel, plan, ip)))

# ---- 1. permissions
for role in ('anon', 'authenticated'):
    r = call(role, U1, 'select * from partners'); check(f'{role} cannot read partners', r[0] == 'err')
    r = call(role, U1, "select submit_partner_application('Aa','a@b.co','Kenya','', %s, 'x')", (PLAN,)); check(f'{role} cannot submit via rpc', r[0] == 'err')
    r = call(role, U1, "select record_partner_commission(%s,'creem','p',10,'USD')", (U1,)); check(f'{role} cannot record commission', r[0] == 'err')
    r = call(role, U1, "select partner_portal_summary(%s)", (U1,)); check(f'{role} cannot read portal summary', r[0] == 'err')
r = call('anon', None, "select admin_list_partners()"); check('anon cannot call admin rpc', r[0] == 'err')

# ---- 2. submit
a1 = apply('Pat Creator', 'Pat@Creator.com'); check('application created', a1['status'] == 'created', a1)
check('duplicate (case-insens)', apply('Pat Two', 'pat@creator.com')['status'] == 'duplicate')
check('invalid short plan', apply('Bob', 'bob@x.com', plan='too short')['status'] == 'invalid')
check('invalid email', apply('Bob', 'not-an-email')['status'] == 'invalid')
check('invalid channel url', apply('Bob', 'bob@x.com', channel='javascript:alert(1)')['status'] == 'invalid')
ids = {}
for i in range(4): ids[i] = apply(f'Name{i}', f'n{i}@x.com', ip='iphash2')
check('4 more from same ip ok', all(v['status'] == 'created' for v in ids.values()))
apply('Name9', 'n9@x.com', ip='iphash2')
r6 = apply('Name10', 'n10@x.com', ip='iphash2'); check('rate limited', r6['status'] == 'rate_limited', r6)
check('rows stored lowercase email', su("select email from partner_applications where id=%s", (a1['id'],))[0][0] == 'pat@creator.com')

# ---- 3. admin list / review
r = call('authenticated', U1, 'select * from admin_partner_applications()'); check('non-admin forbidden list', r[0] == 'err' and 'forbidden' in r[1], r)
r = call('authenticated', ADMIN, 'select id,status from admin_partner_applications()'); check('admin lists', r[0] == 'ok' and len(r[1]) >= 5, r)
r = call('authenticated', U1, "select admin_review_partner_application(%s,'approve')", (a1['id'],)); check('non-admin cannot approve', r[0] == 'err')
r = call('authenticated', ADMIN, "select admin_review_partner_application(%s,'approve')", (a1['id'],)); res = val(r)
check('approve returns code', r[0] == 'ok' and len(res['code']) == 8 and res['email'] == 'pat@creator.com', r)
CODE = res['code']; PID = su("select id from partners where code=%s", (CODE,))[0][0]
check('default percent 20', float(su("select commission_percent from partners where id=%s", (PID,))[0][0]) == 20)
r = call('authenticated', ADMIN, "select admin_review_partner_application(%s,'approve')", (a1['id'],)); check('double approve blocked', r[0] == 'err' and 'already_reviewed' in r[1], r)
r = call('authenticated', ADMIN, "select admin_review_partner_application(%s,'bogus')", (ids[0]['id'],)); check('bad action', r[0] == 'err')
r = call('authenticated', ADMIN, "select admin_review_partner_application(%s,'decline','Not a fit')", (ids[0]['id'],)); d = val(r)
check('decline stores reason', d['reason'] == 'Not a fit' and su("select status from partner_applications where id=%s", (ids[0]['id'],))[0][0] == 'declined')
check('declined can re-apply', apply('Name0', 'n0@x.com', ip='iphash3')['status'] == 'created')
check('approved cannot re-apply', apply('Pat', 'pat@creator.com', ip='iphash4')['status'] == 'duplicate')
r = call('authenticated', ADMIN, "select admin_review_partner_application(%s,'approve')", (str(uuid.uuid4()),)); check('not found', r[0] == 'err' and 'not_found' in r[1])
# second partner for later tests
r = call('authenticated', ADMIN, "select admin_review_partner_application(%s,'approve')", (ids[1]['id'],)); CODE2 = val(r)['code']
PID2 = su("select id from partners where code=%s", (CODE2,))[0][0]
check('codes differ', CODE != CODE2)

# ---- 4. claim_referral
def claim(uid, code, src='code'): return call('authenticated', uid, 'select claim_referral(%s,%s)', (code, src), )
r = claim(U1, CODE.lower()); check('claim ok (lowercase code)', val(r)['status'] == 'ok', r)
check('claim again -> already_referred', val(claim(U1, CODE))['status'] == 'already_referred')
check('invalid code', val(claim(U2, 'ZZZZZZZZ'))['status'] == 'invalid_code')
check('garbage code', val(claim(U2, "'; drop table partners;--"))['status'] == 'invalid_code')
check('old account too_late', val(claim(OLD, CODE))['status'] == 'too_late')
check('self referral blocked', val(claim(SELF, CODE))['status'] == 'self_referral')
r = call('authenticated', None, 'select claim_referral(%s)', (CODE,)); check('unauthenticated claim errors', r[0] == 'err')
r = call('anon', None, 'select claim_referral(%s)', (CODE,)); check('anon cannot claim', r[0] == 'err')
check('U2 claims partner 2', val(claim(U2, CODE2, 'link'))['status'] == 'ok')
check('referral source stored', su("select source from referrals where referred_user_id=%s", (U2,))[0][0] == 'link')
call('authenticated', ADMIN, "select admin_set_partner(%s,'suspended')", (PID2,))
check('suspended partner code invalid', val(claim(U3, CODE2))['status'] == 'invalid_code')
call('authenticated', ADMIN, "select admin_set_partner(%s,'active')", (PID2,))
check('window setting respected', val(claim(U3, CODE2))['status'] == 'ok')

# ---- 5. commissions
def rec(uid, pid, amt, cur='USD'): return val(call('service_role', None, 'select record_partner_commission(%s,%s,%s,%s,%s)', (uid, 'creem', pid, amt, cur)))
r = rec(U1, 'pay_1', 10); check('commission created 2.00', r['status'] == 'created' and float(r['commission']) == 2.00, r)
check('replay same payment', rec(U1, 'pay_1', 10)['status'] == 'already_commissioned')
check('renewal not commissioned', rec(U1, 'pay_2', 10)['status'] == 'already_commissioned')
check('no referral', rec(U4, 'pay_x', 10)['status'] == 'no_referral')
check('non-usd rejected', rec(U2, 'pay_e', 10, 'EUR')['status'] == 'unsupported_currency')
check('bad amount', rec(U2, 'pay_z', 0)['status'] == 'bad_amount')
r = rec(U2, 'pay_3', 89); check('yearly 17.80', float(r['commission']) == 17.80, r)
check('referral upgraded', su("select status from referrals where referred_user_id=%s", (U1,))[0][0] == 'upgraded')
su("update partners set commission_percent = 25 where id=%s", (PID,))
r = rec(U3, 'pay_4', 10); check('U3 (partner 2, 20%) commission', r['status'] == 'created' and float(r['commission']) == 2.00, r)
su("update partners set commission_percent = 20 where id=%s", (PID,))
check('commission pending with hold', su("select status from partner_commissions where payment_id='pay_1'")[0][0] == 'pending')
su("update partner_commissions set eligible_at = now() + interval '1 day'")
r = call('authenticated', ADMIN, "select status from admin_partner_commissions('approved')"); check('not approved before eligible', r[1] == [])
su("update partner_commissions set eligible_at = now() - interval '1 minute'")
r = call('authenticated', ADMIN, "select status from admin_partner_commissions('approved')"); check('approved after hold', len(r[1]) == 3, r)
r = call('authenticated', U1, "select * from admin_partner_commissions()"); check('non-admin forbidden commissions', r[0] == 'err')

# ---- 6. payouts
r = call('authenticated', ADMIN, "select admin_record_partner_payout(%s,'ref1')", (PID,)); check('below minimum blocked', r[0] == 'err' and 'below_minimum' in r[1], r)
r = call('authenticated', ADMIN, "select admin_record_partner_payout(%s,'ref1',true)", (PID,)); p = val(r)
check('forced payout 2.00', float(p['amount']) == 2.00 and p['commissions'] == 1, r)
check('commission marked paid', su("select status from partner_commissions where payment_id='pay_1'")[0][0] == 'paid')
r = call('authenticated', ADMIN, "select admin_record_partner_payout(%s,'ref2',true)", (PID,)); check('nothing left to pay', r[0] == 'err' and 'nothing_to_pay' in r[1])
r = call('authenticated', U1, "select admin_record_partner_payout(%s)", (PID,)); check('non-admin cannot pay', r[0] == 'err')

# ---- 7. refunds / reversal / deduction
check('cancel pending/approved -> cancelled', val(call('service_role', None, "select cancel_partner_commission_for_payment('creem','pay_3','refund')"))['status'] == 'cancelled')
check('cancel twice', val(call('service_role', None, "select cancel_partner_commission_for_payment('creem','pay_3','refund')"))['status'] == 'already_closed')
check('unknown payment', val(call('service_role', None, "select cancel_partner_commission_for_payment('creem','nope')"))['status'] == 'not_found')
check('refund of paid -> reversed', val(call('service_role', None, "select cancel_partner_commission_for_payment('creem','pay_1','refund')"))['status'] == 'reversed')
S = {}
for i in range(5): S[i] = mkuser(f's{i}@x.com'); claim(S[i], CODE)
for i in range(3): rec(S[i], f'pay_s{i}', 89)          # 3 x 17.80 = 53.40
su("update partner_commissions set eligible_at = now() - interval '1 minute' where status='pending'")
r = call('authenticated', ADMIN, "select owed_back, approved from admin_list_partners() where id=%s", (PID,)); row = r[1][0]
check('owed_back 2.00, approved 53.40', float(row[0]) == 2.00 and float(row[1]) == 53.40, r)
r = call('authenticated', ADMIN, "select admin_record_partner_payout(%s,'ref3')", (PID,)); p = val(r)
check('payout net 51.40 (53.40 - 2.00 owed back)', r[0] == 'ok' and float(p['amount']) == 51.40 and float(p['deductions']) == 2.00, r)
check('reversal marked recovered', su("select recovered from partner_commissions where payment_id='pay_1'")[0][0] is True)
r = call('authenticated', ADMIN, "select admin_list_partners() ", ); 
rec(S[3], 'pay_s3', 89); su("update partner_commissions set eligible_at = now() - interval '1 minute' where status='pending'")
cid = su("select id from partner_commissions where payment_id='pay_s3'")[0][0]
r = call('authenticated', ADMIN, "select admin_cancel_commission(%s,'chargeback')", (cid,))
check('admin cancel approved -> cancelled', val(r) == 'cancelled', r)
cid = su("select id from partner_commissions where payment_id='pay_s0'")[0][0]
r = call('authenticated', ADMIN, "select admin_cancel_commission(%s,'chargeback')", (cid,)); check('admin cancel paid -> reversed', val(r) == 'reversed', r)

# ---- 8. clicks
check('click valid', val(call('service_role', None, "select partner_record_click(%s)", (CODE.lower(),))) is True)
call('service_role', None, "select partner_record_click(%s)", (CODE,))
check('click invalid', val(call('service_role', None, "select partner_record_click('NOPE1234')")) is False)
check('clicks counted', su("select sum(clicks) from partner_click_daily where partner_id=%s", (PID,))[0][0] == 2)

# ---- 9. portal
def sha(s): import hashlib; return hashlib.sha256(s.encode()).hexdigest()
r = val(call('service_role', None, "select partner_login_request('nobody@x.com', %s)", (sha('t0'),))); check('unknown email not sent', r['sent'] is False)
r = val(call('service_role', None, "select partner_login_request('PAT@creator.com', %s)", (sha('t1'),))); check('known email sent', r['sent'] is True and r['name'] == 'Pat Creator', r)
check('exchange ok', val(call('service_role', None, "select partner_login_exchange(%s,%s)", (sha('t1'), sha('s1')))) is True)
check('token single use', val(call('service_role', None, "select partner_login_exchange(%s,%s)", (sha('t1'), sha('s1b')))) is False)
check('wrong token', val(call('service_role', None, "select partner_login_exchange(%s,%s)", (sha('zzz'), sha('s2')))) is False)
check('session resolves partner', str(val(call('service_role', None, "select partner_session_partner(%s)", (sha('s1'),)))) == str(PID))
check('bad session -> null', val(call('service_role', None, "select partner_session_partner(%s)", (sha('bad'),))) is None)
call('service_role', None, "select partner_login_request('pat@creator.com', %s)", (sha('t2'),)); su("update partner_login_tokens set expires_at = now() - interval '1 minute' where token_hash=%s", (sha('t2'),))
check('expired token rejected', val(call('service_role', None, "select partner_login_exchange(%s,%s)", (sha('t2'), sha('s3')))) is False)
for i in range(6): last = val(call('service_role', None, "select partner_login_request('pat@creator.com', %s)", (sha(f'r{i}'),)))
check('login rate limit', last['sent'] is False and last['reason'] == 'rate', last)
su("update partner_sessions set expires_at = now() - interval '1 minute' where token_hash=%s", (sha('s1'),))
check('expired session -> null', val(call('service_role', None, "select partner_session_partner(%s)", (sha('s1'),))) is None)
su("update partner_sessions set expires_at = now() + interval '1 day' where token_hash=%s", (sha('s1'),))
S1 = val(call('service_role', None, "select partner_portal_summary(%s)", (PID,)))
check('summary shape', set(S1) >= {'partner', 'settings', 'stats', 'balances', 'referrals', 'commissions', 'payouts'}, list(S1))
check('summary stats', S1['stats']['signups'] == 6 and S1['stats']['clicks_total'] == 2, S1['stats'])
check('summary hides emails', all('@' not in json.dumps(x) for x in S1['referrals']))
check('summary payout list', len(S1['payouts']) == 2, S1['payouts'])
bad = call('service_role', None, "select partner_save_payout(%s,'cash','abc')", (PID,)); check('bad payout method', bad[0] == 'err')
bad = call('service_role', None, "select partner_save_payout(%s,'paypal','a')", (PID,)); check('bad payout details', bad[0] == 'err')
call('service_role', None, "select partner_save_payout(%s,'paypal','pat@creator.com')", (PID,))
check('payout saved', su("select payout_method from partners where id=%s", (PID,))[0][0] == 'paypal')
call('service_role', None, "select partner_logout(%s)", (sha('s1'),)); check('logout', val(call('service_role', None, "select partner_session_partner(%s)", (sha('s1'),))) is None)
call('authenticated', ADMIN, "select admin_set_partner(%s,'suspended')", (PID,))
check('suspended: click false', val(call('service_role', None, "select partner_record_click(%s)", (CODE,))) is False)
check('suspended: login blocked', val(call('service_role', None, "select partner_login_request('pat@creator.com', %s)", (sha('t9'),)))['sent'] is False)
check('suspended: no new commission', rec(S[4], 'pay_s4', 89)['status'] == 'partner_suspended')
call('authenticated', ADMIN, "select admin_set_partner(%s,'active', 30)", (PID,)); check('percent override stored', float(su("select commission_percent from partners where id=%s", (PID,))[0][0]) == 30)
r = call('authenticated', ADMIN, "select admin_set_partner(%s,null,150)", (PID,)); check('bad percent', r[0] == 'err')

# ---- 10. concurrency
U5 = mkuser('c1@x.com'); claim(U5, CODE); U6 = mkuser('c2@x.com'); claim(U6, CODE)
res = []
def worker(uid, pay):
    c = conn(); res.append(val(call('service_role', None, 'select record_partner_commission(%s,%s,%s,%s,%s)', (uid, 'creem', pay, 10, 'USD'), c=c))['status']); c.close()
ths = [threading.Thread(target=worker, args=(U5, f'race_{i}')) for i in range(6)]
[t.start() for t in ths]; [t.join() for t in ths]
check('6 racing payments -> exactly one commission', res.count('created') == 1 and su("select count(*) from partner_commissions where referral_id=(select id from referrals where referred_user_id=%s)", (U5,))[0][0] == 1, res)
for i in range(2):
    v = mkuser(f'v{i}@x.com'); claim(v, CODE); rec(v, f'pay_v{i}', 89)
su("update partner_commissions set eligible_at = now() - interval '1 minute' where status='pending'")
pres = []
def pworker():
    c = conn(); pres.append(call('authenticated', ADMIN, "select admin_record_partner_payout(%s,'race',true)", (PID,), c=c)[0]); c.close()
ths = [threading.Thread(target=pworker) for _ in range(4)]
[t.start() for t in ths]; [t.join() for t in ths]
check('4 racing payouts -> exactly one succeeds', pres.count('ok') == 1, pres)
check('payout rows sane', su("select count(*) from partner_payouts where reference='race'")[0][0] == 1)
check('race payout net = 3.00 + 53.40 - 17.80 owed back', float(su("select amount from partner_payouts where reference='race'")[0][0]) == 38.60, su("select amount from partner_payouts where reference='race'"))

# ---- 11. settings editable
su("update partner_settings set value=1 where key='hold_days'")
U7 = mkuser('h1@x.com'); claim(U7, CODE2); rec(U7, 'pay_h', 10)
check('hold_days setting used', su("select eligible_at < now() + interval '25 hours' from partner_commissions where payment_id='pay_h'")[0][0] is True)
su("update partner_settings set value=14 where key='hold_days'")

print(f'{n} checks, {len(fails)} failed'); sys.exit(1 if fails else 0)
