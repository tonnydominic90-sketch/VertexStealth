import json, re, subprocess, sys, time, urllib.request, psycopg2
from playwright.sync_api import sync_playwright
SITE = 'http://localhost:3111'; fails = []; n = 0
def check(name, cond, extra=''):
    global n; n += 1
    if not cond: fails.append(name); print('FAIL', name, extra)
def mails():
    with urllib.request.urlopen('http://localhost:3999/') as r: return json.loads(r.read())
db = psycopg2.connect(host='localhost', user='postgres', password='pw', dbname='vs_test'); db.autocommit = True; cur = db.cursor()
def q(sql, a=()): cur.execute(sql, a); return cur.fetchall() if cur.description else None
def jwt(role, sub=None): return subprocess.check_output(['node', 'support.mjs', 'jwt', role] + ([sub] if sub else []), text=True).strip()
errors = []
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(); ctx.set_default_timeout(7000); page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    page.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' else None)
    # ---- 1. apply through the real form
    page.goto(SITE + '/partners-program'); page.wait_for_selector('#partner-form')
    page.fill('[name=name]', 'Wanjiru Mwangi'); page.fill('[name=email]', 'wanjiru@example.org'); page.fill('[name=country]', 'Kenya')
    page.fill('[name=channel_url]', 'https://youtube.com/@wanjiru')
    page.fill('[name=promotion_plan]', 'I make weekly videos about browser privacy tools and will add my link to each description.')
    page.check('[name=agree]'); page.click('#partner-form button[type=submit]'); page.wait_for_timeout(1500)
    st = page.inner_text('.pp-status'); check('apply success message', 'Thank you' in st, st)
    check('application stored', q("select count(*) from partner_applications where email='wanjiru@example.org'")[0][0] == 1)
    page.fill('[name=name]', 'Wanjiru Again'); page.fill('[name=email]', 'wanjiru@example.org'); page.fill('[name=country]', 'Kenya')
    page.fill('[name=promotion_plan]', 'I make weekly videos about browser privacy tools and will add my link to each description.')
    page.check('[name=agree]'); page.click('#partner-form button[type=submit]'); page.wait_for_timeout(1200)
    st = page.inner_text('.pp-status'); check('duplicate shows friendly server message', 'already have an application' in st, st)
    # ---- 2. admin signs in, approves
    admin = ctx.new_page(); admin.on('console', lambda m: errors.append('admin console: ' + m.text) if m.type == 'error' else None)
    admin.goto(SITE + '/partner-admin'); admin.wait_for_selector('#login-form')
    admin.fill('#a-email', 'admin@x.com'); admin.fill('#a-pass', 'wrong'); admin.click('#login-form button'); admin.wait_for_timeout(800)
    check('bad admin login rejected', 'Invalid login' in admin.inner_text('#login-status'), admin.inner_text('#login-status'))
    admin.fill('#a-email', 'user@x.com'); admin.fill('#a-pass', 'pw'); admin.click('#login-form button'); admin.wait_for_timeout(1000)
    check('non-admin cannot enter', not admin.is_visible('#app') and 'not an admin' in admin.inner_text('#login-status'), admin.inner_text('#login-status'))
    admin.fill('#a-email', 'admin@x.com'); admin.fill('#a-pass', 'pw'); admin.click('#login-form button'); admin.wait_for_selector('#app', state='visible'); admin.wait_for_timeout(600)
    check('pending application listed', 'Wanjiru Mwangi' in admin.inner_text('#content') and 'browser privacy tools' in admin.inner_text('#content'))
    admin.once('dialog', lambda d: d.accept()); admin.click('#content button:has-text("Approve")'); admin.wait_for_timeout(1500)
    msgtxt = admin.inner_text('#msg'); check('approval message with code + email sent', 'Approved. Code' in msgtxt and 'Email sent' in msgtxt, msgtxt)
    CODE = re.search(r'Code (\w{8})', msgtxt).group(1)
    m = [x for x in mails() if x['to'] == ['wanjiru@example.org'] and 'approved' in x['text']]
    check('approval email delivered', len(m) == 1 and CODE in m[0]['text'])
    # ---- 3. referral link
    vctx = b.new_context(); vctx.set_default_timeout(7000); visitor = vctx.new_page(); visitor.on('console', lambda m: errors.append('visitor console: ' + m.text) if m.type == 'error' else None)
    visitor.goto(SITE + f'/r/{CODE}'); visitor.wait_for_url('**/download', timeout=8000)
    check('landed on /download', visitor.url.endswith('/download'), visitor.url)
    check('ref saved in localStorage', json.loads(visitor.evaluate("localStorage.getItem('vs_ref')"))['code'] == CODE)
    check('referral code shown on download page', visitor.is_visible('#ref-note') and CODE in visitor.inner_text('#ref-note'))
    check('click counted once', q("select sum(clicks) from partner_click_daily")[0][0] == 1)
    visitor.goto(SITE + f'/r/{CODE}'); visitor.wait_for_url('**/download', timeout=8000)
    check('refresh in same session not double counted', q("select sum(clicks) from partner_click_daily")[0][0] == 1)
    octx = b.new_context(); octx.set_default_timeout(7000); other = octx.new_page(); other.goto(SITE + '/r/ZZZZZZZZ'); other.wait_for_url('**/download', timeout=8000)
    check('unknown code does not set ref', other.evaluate("localStorage.getItem('vs_ref')") is None)
    other.goto(SITE + '/r/not-a-code'); other.wait_for_url('**/download', timeout=8000); check('malformed code redirects safely', True)
    # ---- 4. simulate the app + a purchase (these calls come from the Electron app / payment webhooks, not the website)
    BUYER = '00000000-0000-0000-0000-0000000000cc'; q("insert into auth.users(id,email) values (%s,'buyer@x.com') on conflict do nothing", (BUYER,))
    def rest(fn, body, tok):
        req = urllib.request.Request('http://localhost:54321/rest/v1/rpc/' + fn, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok, 'apikey': tok}, method='POST')
        with urllib.request.urlopen(req) as r: return json.loads(r.read())
    check('app claims code', rest('claim_referral', {'p_code': CODE, 'p_source': 'link'}, jwt('authenticated', BUYER))['status'] == 'ok')
    check('webhook records commission', rest('record_partner_commission', {'p_user_id': BUYER, 'p_provider': 'creem', 'p_payment_id': 'ord_e2e', 'p_amount': 89}, jwt('service_role'))['status'] == 'created')
    # ---- 5. partner portal
    pp = ctx.new_page(); pp.on('console', lambda m: errors.append('portal console: ' + m.text) if m.type == 'error' else None)
    pp.goto(SITE + '/partner'); pp.wait_for_selector('#login-form', state='visible')
    pp.fill('#f-email', 'nobody@x.com'); pp.click('#login-form button'); pp.wait_for_selector('[data-view=sent]', state='visible')
    check('unknown email: same generic message, no email', all(x['to'] != ['nobody@x.com'] for x in mails()))
    pp.goto(SITE + '/partner'); pp.wait_for_selector('#login-form', state='visible')
    pp.fill('#f-email', 'wanjiru@example.org'); pp.click('#login-form button'); pp.wait_for_selector('[data-view=sent]', state='visible')
    mm = [x for x in mails() if x['to'] == ['wanjiru@example.org'] and 'Sign in' in x['subject'] or 'sign-in' in x['subject']]
    link = re.search(r'(http://localhost:3111/partner#token=[A-Za-z0-9_-]+)', mm[-1]['text']).group(1)
    pp.on('response', lambda r: print('RESP', r.status, r.url[:90]) if 'functions' in r.url else None)
    pp.on('requestfailed', lambda r: print('REQFAILED', r.url[:90], r.failure))
    print('LINK', link[:80])
    pp.goto(link)
    try: pp.wait_for_selector('[data-view=dash]', state='visible', timeout=8000)
    except Exception:
        print('VISIBLE VIEWS', pp.evaluate("[...document.querySelectorAll('[data-view]')].filter(v=>!v.hidden).map(v=>v.dataset.view)"), 'URL', pp.url, 'ERRORS', errors[-5:]); raise
    check('hash token removed from URL', '#' not in pp.url, pp.url)
    check('dashboard shows code + link', CODE in pp.inner_text('#p-code') and pp.input_value('#p-link').endswith('/r/' + CODE))
    check('dashboard stats', pp.inner_text('#s-signups') == '1' and pp.inner_text('#s-upgrades') == '1' and pp.inner_text('#s-clicks') == '1', pp.inner_text('#s-signups'))
    check('pending commission 17.80 shown', pp.inner_text('#b-pending') == '$17.80', pp.inner_text('#b-pending'))
    check('referral row masked, no email', 'R-' in pp.inner_text('#t-referrals') and '@' not in pp.inner_text('#t-referrals'))
    pp.select_option('#f-method', 'usdt'); pp.fill('#f-details', 'TRC20: TXyzExampleAddress123'); pp.click('#payout-form button'); pp.wait_for_timeout(800)
    check('payout details saved', 'saved' in pp.inner_text('#payout-status'), pp.inner_text('#payout-status'))
    pp.reload(); pp.wait_for_selector('[data-view=dash]', state='visible', timeout=8000); check('session survives reload', CODE in pp.inner_text('#p-code'))
    pp2 = ctx.new_page(); pp2.goto(link); pp2.wait_for_selector('[data-view=badlink]', state='visible', timeout=8000); check('used link rejected', True)
    pp.click('#logout'); pp.wait_for_selector('[data-view=login]', state='visible'); check('logout back to login', True)
    # ---- 6. admin: partners, payout
    q("update partner_commissions set eligible_at = now() - interval '1 minute'")
    admin.click('[data-tab=partners]'); admin.wait_for_timeout(1000)
    txt = admin.inner_text('#content'); check('admin partners table shows partner + $17.80 approved', 'Wanjiru Mwangi' in txt and '$17.80' in txt and 'usdt: TRC20' in txt, txt[:300])
    dialogs = []
    def on_dialog(d):
        dialogs.append(d.message[:60])
        d.accept('TX-REF-123' if d.type == 'prompt' else None) if d.type == 'prompt' else d.accept()
    admin.on('dialog', on_dialog); admin.click('#content button:has-text("Record payout")'); admin.wait_for_timeout(1000)
    msgtxt = admin.inner_text('#msg')
    check('below-minimum asks to confirm, then records', 'Recorded payout of $17.80' in msgtxt, (msgtxt, dialogs))
    admin.click('[data-tab=payouts]'); admin.wait_for_timeout(800); check('payouts tab lists it with reference', 'TX-REF-123' in admin.inner_text('#content') and '$17.80' in admin.inner_text('#content'))
    admin.click('[data-tab=commissions]'); admin.wait_for_timeout(800); check('commission now paid', 'paid' in admin.inner_text('#content'))
    # ---- 7. CSP / errors
    csp = [e for e in errors if 'Content Security Policy' in e or 'Refused to' in e]
    check('no CSP violations in any page', not csp, csp[:3])
    other_errs = [e for e in errors if e not in csp and '400' not in e and '401' not in e and '409' not in e and '404' not in e and 'Failed to load resource' not in e]
    check('no unexpected JS errors', not other_errs, other_errs[:5])
    b.close()
print(f'{n} checks, {len(fails)} failed'); sys.exit(1 if fails else 0)
