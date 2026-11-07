import json, urllib.request, urllib.error, subprocess, uuid, re, sys, psycopg2, time
FN = 'http://localhost:8001/functions/v1/'; MAIL = 'http://localhost:3999/'; ORIGIN = 'https://vertexstealth.vercel.app'
fails = []; n = 0
def check(name, cond, extra=''):
    global n; n += 1
    if not cond: fails.append(name); print('FAIL', name, extra)
def post(fn, body=None, headers=None, raw=None, origin=ORIGIN, method='POST'):
    h = {'Content-Type': 'application/json'}
    if origin: h['Origin'] = origin
    h.update(headers or {})
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(FN + fn, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as r: return r.status, (json.loads(r.read() or b'null')), r.headers
    except urllib.error.HTTPError as e:
        t = e.read(); 
        try: j = json.loads(t)
        except Exception: j = t
        return e.code, j, e.headers
def mails():
    with urllib.request.urlopen(MAIL) as r: return json.loads(r.read())
def clear_mail(): urllib.request.urlopen(urllib.request.Request(MAIL, method='DELETE')).read()
def jwt(role, sub=None): return subprocess.check_output(['node', 'support.mjs', 'jwt', role] + ([sub] if sub else []), text=True).strip()
db = psycopg2.connect(host='localhost', user='postgres', password='pw', dbname='vs_test'); db.autocommit = True; cur = db.cursor()
def q(sql, a=()): cur.execute(sql, a); return cur.fetchall() if cur.description else None
for t in ('partner_login_tokens','partner_sessions','partner_commissions','partner_payouts','referrals','partner_click_daily','partners','partner_applications'): q(f'truncate {t} cascade')
q('delete from auth.users')
ADMIN, NORMAL = str(uuid.uuid4()), str(uuid.uuid4())
for uid, em, adm in ((ADMIN, 'admin@x.com', True), (NORMAL, 'user@x.com', False)):
    q('insert into auth.users(id,email) values (%s,%s)', (uid, em)); q('insert into profiles(id,email,is_admin) values (%s,%s,%s)', (uid, em, adm))
ADMIN_JWT, USER_JWT = jwt('authenticated', ADMIN), jwt('authenticated', NORMAL)
PLAN = 'I run a small YouTube channel about browser tools and will put my link in every tutorial description.'
GOOD = dict(name='Pat Creator', email='pat@creator.com', country='Kenya', channel_url='https://youtube.com/@pat', promotion_plan=PLAN)

# ---------- CORS / origin ----------
s, _, h = post('partner-apply', method='OPTIONS'); check('preflight 204', s == 204)
check('preflight allows site origin', h.get('Access-Control-Allow-Origin') == ORIGIN, dict(h))
s, _, h = post('partner-apply', method='OPTIONS', origin='https://evil.example'); check('preflight no ACAO for other origin', h.get('Access-Control-Allow-Origin') is None)
s, j, _ = post('partner-apply', GOOD, origin='https://evil.example'); check('other origin refused', s == 403, (s, j))
s, j, _ = post('partner-apply', GOOD, method='GET'); check('GET refused', s == 405 or s in (400, 405), s)

# ---------- apply ----------
clear_mail()
s, j, _ = post('partner-apply', GOOD, headers={'X-Forwarded-For': '1.1.1.1'}); check('apply ok', s == 200 and j.get('ok') is True, (s, j))
m = mails(); check('two emails sent (applicant + admin)', len(m) == 2, m)
check('applicant email goes to applicant', any(x['to'] == ['pat@creator.com'] for x in m))
check('admin email goes to admin', any(x['to'] == ['admin@vertexstealth.test'] for x in m))
check('brevo api-key header used', all(x['auth'] == 'test-key' for x in m))
s, j, _ = post('partner-apply', GOOD, headers={'X-Forwarded-For': '1.1.1.2'}); check('duplicate 409', s == 409 and j['error'] == 'duplicate', (s, j))
s, j, _ = post('partner-apply', {**GOOD, 'email': 'bad'}); check('bad email 422', s == 422)
s, j, _ = post('partner-apply', {**GOOD, 'email': 'x1@x.com', 'promotion_plan': 'short'}); check('short plan 422', s == 422)
s, j, _ = post('partner-apply', {**GOOD, 'email': 'x2@x.com', 'channel_url': 'javascript:alert(1)'}); check('bad channel 422', s == 422)
before = q('select count(*) from partner_applications')[0][0]
s, j, _ = post('partner-apply', {**GOOD, 'email': 'bot@x.com', 'company_website': 'spam'}); check('honeypot looks like success', s == 200)
check('honeypot stores nothing', q('select count(*) from partner_applications')[0][0] == before)
s, j, _ = post('partner-apply', raw=b'{not json'); check('bad json 400', s == 400)
s, j, _ = post('partner-apply', raw=json.dumps({**GOOD, 'promotion_plan': 'x' * 30000}).encode()); check('oversize 400', s == 400)
clear_mail()
evil = {**GOOD, 'name': '<img src=x onerror=alert(1)>Evil', 'email': 'evil@x.com', 'promotion_plan': PLAN + ' <script>alert(1)</script>'}
s, j, _ = post('partner-apply', evil, headers={'X-Forwarded-For': '2.2.2.2'}); check('html in fields accepted as text', s == 200)
adm = [x for x in mails() if x['to'] == ['admin@vertexstealth.test']][0]
check('admin email escapes html', '<script>' not in adm['html'] and '&lt;script&gt;' in adm['html'] and '<img' not in adm['html'], adm['html'][:300])
for i in range(6): s, j, _ = post('partner-apply', {**GOOD, 'email': f'rl{i}@x.com'}, headers={'X-Forwarded-For': '3.3.3.3'})
check('rate limit 429 after 5/day', s == 429, (s, j))

# ---------- admin review ----------
APP = q("select id from partner_applications where email='pat@creator.com'")[0][0]
EVIL = q("select id from partner_applications where email='evil@x.com'")[0][0]
body = {'id': str(APP), 'action': 'approve'}
s, j, _ = post('partner-admin-review', body); check('review: no auth 401', s == 401, (s, j))
s, j, _ = post('partner-admin-review', body, headers={'Authorization': 'Bearer ' + USER_JWT}); check('review: non-admin 403', s == 403, (s, j))
s, j, _ = post('partner-admin-review', body, headers={'Authorization': 'Bearer garbage'}); check('review: garbage token rejected', s in (401, 403, 500), s)
check('nothing approved yet', q("select status from partner_applications where id=%s", (str(APP),))[0][0] == 'pending')
clear_mail()
s, j, _ = post('partner-admin-review', body, headers={'Authorization': 'Bearer ' + ADMIN_JWT}); check('review: admin approves', s == 200 and len(j['code']) == 8 and j['emailed'] is True, (s, j))
CODE = j['code']; m = mails()
check('approval email has code + link + portal', len(m) == 1 and CODE in m[0]['text'] and f'/r/{CODE}' in m[0]['html'] and '/partner' in m[0]['html'], m)
check('approval email to applicant', m[0]['to'] == ['pat@creator.com'])
s, j, _ = post('partner-admin-review', body, headers={'Authorization': 'Bearer ' + ADMIN_JWT}); check('review: double approve 409', s == 409, (s, j))
s, j, _ = post('partner-admin-review', {'id': str(uuid.uuid4()), 'action': 'approve'}, headers={'Authorization': 'Bearer ' + ADMIN_JWT}); check('review: unknown id 404', s == 404, (s, j))
s, j, _ = post('partner-admin-review', {'id': 'nope', 'action': 'approve'}, headers={'Authorization': 'Bearer ' + ADMIN_JWT}); check('review: bad id 400', s == 400)
s, j, _ = post('partner-admin-review', {'id': str(EVIL), 'action': 'delete'}, headers={'Authorization': 'Bearer ' + ADMIN_JWT}); check('review: bad action 400', s == 400)
clear_mail()
s, j, _ = post('partner-admin-review', {'id': str(EVIL), 'action': 'decline', 'reason': 'Not a fit <b>sorry</b>'}, headers={'Authorization': 'Bearer ' + ADMIN_JWT})
m = mails(); check('decline ok + emailed', s == 200 and j['emailed'] and len(m) == 1, (s, j))
check('decline reason escaped in html but present', '&lt;b&gt;sorry' in m[0]['html'] and '<b>sorry' not in m[0]['html'])

# ---------- click ----------
s, j, _ = post('partner-click', {'code': CODE.lower()}); check('click valid', s == 200 and j['valid'] is True, (s, j))
s, j, _ = post('partner-click', {'code': 'NOPE1234'}); check('click unknown', j['valid'] is False)
s, j, _ = post('partner-click', {'code': "x'; drop table partners;--"}); check('click garbage', j['valid'] is False)
check('click stored', q("select sum(clicks) from partner_click_daily")[0][0] == 1)

# ---------- portal ----------
clear_mail()
s, j, _ = post('partner-portal', {'action': 'request_login', 'email': 'nobody@x.com'}); check('login unknown: same 200', s == 200 and j == {'ok': True})
check('login unknown: no email', mails() == [])
s, j, _ = post('partner-portal', {'action': 'request_login', 'email': 'PAT@creator.com'}); check('login known 200', s == 200)
m = mails(); check('login email sent', len(m) == 1 and m[0]['to'] == ['pat@creator.com'], m)
tok = re.search(r'#token=([A-Za-z0-9_-]+)', m[0]['text']).group(1)
check('token stored hashed only', q("select count(*) from partner_login_tokens where token_hash=%s", (tok,))[0][0] == 0 and q("select count(*) from partner_login_tokens")[0][0] == 1)
s, j, _ = post('partner-portal', {'action': 'exchange', 'token': 'x' * 43}); check('bad token 401', s == 401)
s, j, _ = post('partner-portal', {'action': 'exchange', 'token': tok}); check('exchange ok', s == 200 and len(j['session']) > 20, (s, j))
SES = j['session']
s, j, _ = post('partner-portal', {'action': 'exchange', 'token': tok}); check('token cannot be reused', s == 401)
auth = {'Authorization': 'Bearer ' + SES}
s, j, _ = post('partner-portal', {'action': 'summary'}); check('summary needs session', s == 401)
s, j, _ = post('partner-portal', {'action': 'summary'}, headers={'Authorization': 'Bearer ' + 'a' * 43}); check('summary rejects unknown session', s == 401)
s, j, _ = post('partner-portal', {'action': 'summary'}, headers=auth); check('summary ok', s == 200 and j['partner']['code'] == CODE and j['stats']['clicks_total'] == 1, (s, j))
check('summary does not leak other partners', 'evil' not in json.dumps(j))
s, j, _ = post('partner-portal', {'action': 'save_payout', 'method': 'cash', 'details': 'abc'}, headers=auth); check('payout bad method 422', s == 422)
s, j, _ = post('partner-portal', {'action': 'save_payout', 'method': 'usdt', 'details': 'TRC20: Txxxxxxxxxxxxxxxxxx'}, headers=auth); check('payout saved', s == 200)
s, j, _ = post('partner-portal', {'action': 'summary'}, headers=auth); check('payout visible in summary', j['partner']['payout_method'] == 'usdt')
s, j, _ = post('partner-portal', {'action': 'logout'}, headers=auth); check('logout ok', s == 200)
s, j, _ = post('partner-portal', {'action': 'summary'}, headers=auth); check('session dead after logout', s == 401)
s, j, _ = post('partner-portal', {'action': 'nope'}, headers=auth); check('unknown action rejected', s in (400, 401))

# ---------- end to end: claim -> commission -> approve -> payout (DB path used by the app + webhooks) ----------
REF = str(uuid.uuid4()); q('insert into auth.users(id,email) values (%s,%s)', (REF, 'buyer@x.com'))
import urllib.parse
def rest(fn, body, token):
    req = urllib.request.Request('http://localhost:54321/rest/v1/rpc/' + fn, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'apikey': token}, method='POST')
    try:
        with urllib.request.urlopen(req) as r: return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e: return e.code, e.read().decode()
s, j = rest('claim_referral', {'p_code': CODE, 'p_source': 'link'}, jwt('authenticated', REF)); check('claim via PostgREST as the app does', s == 200 and j['status'] == 'ok', (s, j))
s, j = rest('claim_referral', {'p_code': CODE}, jwt('anon')); check('anon claim blocked via API', s in (401, 403, 404), (s, j))
s, j = rest('record_partner_commission', {'p_user_id': REF, 'p_provider': 'creem', 'p_payment_id': 'ord_1', 'p_amount': 89}, jwt('authenticated', REF)); check('commission hook blocked for users via API', s in (401, 403, 404), (s, j))
s, j = rest('record_partner_commission', {'p_user_id': REF, 'p_provider': 'creem', 'p_payment_id': 'ord_1', 'p_amount': 89}, jwt('service_role')); check('commission hook works for service role', s == 200 and j['status'] == 'created' and float(j['commission']) == 17.8, (s, j))
s, j = rest('admin_list_partners', {}, USER_JWT); check('admin_list_partners blocked for normal user via API', s in (401, 403) or 'forbidden' in str(j), (s, j))
s, j = rest('admin_list_partners', {}, ADMIN_JWT); check('admin_list_partners works for admin via API', s == 200 and j[0]['code'] == CODE and float(j[0]['pending']) == 17.8, (s, j))
q("update partner_commissions set eligible_at = now() - interval '1 minute'")
s, j = rest('admin_record_partner_payout', {'p_partner': j[0]['id'], 'p_reference': 'int-test', 'p_force': True}, ADMIN_JWT); check('payout via API', s == 200 and float(j['amount']) == 17.8, (s, j))
# direct table access over the API must be impossible
for t in ('partners', 'partner_commissions', 'referrals', 'partner_applications', 'partner_sessions'):
    req = urllib.request.Request('http://localhost:54321/rest/v1/' + t + '?select=*', headers={'Authorization': 'Bearer ' + USER_JWT}); 
    try: urllib.request.urlopen(req); ok = False
    except urllib.error.HTTPError as e: ok = e.code in (401, 403, 404)
    check(f'table {t} not readable through the API', ok)
print(f'{n} checks, {len(fails)} failed'); sys.exit(1 if fails else 0)
