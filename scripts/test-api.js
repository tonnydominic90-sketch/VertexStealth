'use strict';
// Offline test of the serverless API against an in-memory fake Supabase + Brevo. Run: node scripts/test-api.js
process.env.SUPABASE_URL = 'https://fake.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
process.env.BREVO_API_KEY = 'xkeysib-test'; process.env.EMAIL_FROM = 'VertexStealth <support@vertexstealth.top>'; process.env.SITE_URL = 'https://www.vertexstealth.top';
const assert = require('assert');
const now = Date.now(), iso = (d) => new Date(d).toISOString();
const db = {
  users: [
    { id: 'a1', email: 'boss@x.com', created_at: iso(now - 90 * 864e5), last_sign_in_at: iso(now - 864e5), email_confirmed_at: iso(now) },
    { id: 'u1', email: 'trial.user@x.com', created_at: iso(now - 864e5), last_sign_in_at: iso(now), email_confirmed_at: iso(now) },
    { id: 'u2', email: 'paid.person@x.com', created_at: iso(now - 60 * 864e5), last_sign_in_at: iso(now - 5 * 864e5), email_confirmed_at: iso(now) },
    { id: 'u3', email: 'old@x.com', created_at: iso(now - 40 * 864e5), email_confirmed_at: iso(now) },
    { id: 'u4', email: 'noconfirm@x.com', created_at: iso(now - 864e5) },
  ],
  profiles: [
    { id: 'a1', email: 'boss@x.com', is_admin: true },
    { id: 'u1', email: 'trial.user@x.com', is_admin: false },
    { id: 'u2', email: 'paid.person@x.com', is_admin: false, plan: 'monthly', plan_expires_at: iso(now + 10 * 864e5) },
    { id: 'u3', email: 'old@x.com', is_admin: false },
  ],
  devices: [{ user_id: 'u3', is_banned: false }],
  site_events: [], user_locations: [{ user_id: 'u1', country: 'KE' }, { user_id: 'u2', country: 'US' }], admin_audit_log: [], email_campaigns: [], email_optouts: [{ email: 'paid.person@x.com' }], site_settings: [],
};
for (let i = 0; i < 30; i++) db.site_events.push({ created_at: iso(now - (i % 5) * 864e5), event: 'pageview', path: i % 2 ? '/pricing' : '/', country: i % 3 ? 'KE' : 'US', referrer_host: i % 4 ? '' : 'google.com', device: 'desktop' });
const sent = []; const banUntil = {}; const rlDb = {};
const json = (o, s = 200) => ({ ok: s < 300, status: s, text: async () => JSON.stringify(o), json: async () => o });
global.fetch = async (url, opt = {}) => {
  const u = new URL(url); const m = opt.method || 'GET'; const auth = (opt.headers || {}).Authorization || '';
  if (u.host === 'github.com') return (opt.method === 'HEAD' && /\/0\.2\.[12]\//.test(u.pathname)) ? { ok: true, status: 200 } : { ok: false, status: 404 };
  if (u.host === 'api.github.com') return json({ tag_name: 'v0.2.2', published_at: iso(now), assets: [{ name: 'VertexStealth-Setup-0.2.2.exe.blockmap', browser_download_url: 'x', size: 1 }, { name: 'VertexStealth-Setup-0.2.2.exe', browser_download_url: 'https://github.com/tonnydominic90-sketch/VertexStealth-Release/releases/download/0.2.2/VertexStealth-Setup-0.2.2.exe', size: 90000000 }] });
  if (u.host === 'api.brevo.com') {
    if (u.pathname === '/v3/smtp/email') { const b = JSON.parse(opt.body); if (opt.headers['api-key'] !== 'xkeysib-test') return json({ message: 'Key not found' }, 401); sent.push({ to: [b.to[0].email], subject: b.subject, html: b.htmlContent, text: b.textContent, headers: b.headers, from: b.sender.email }); return json({ messageId: '<x@brevo>' }, 201); }
    if (u.pathname === '/v3/account') return json({ companyName: 'Test', plan: [{ type: 'free', credits: 300 }] });
    if (u.pathname === '/v3/senders') return json({ senders: [{ email: 'support@vertexstealth.top', active: true }] });
  }
  if (u.pathname === '/auth/v1/user') { const tok = auth.replace('Bearer ', ''); const usr = db.users.find((x) => 'tok-' + x.id === tok); return usr ? json(usr) : json({ msg: 'bad' }, 401); }
  if (u.pathname === '/auth/v1/admin/users') return json({ users: db.users });
  const gm = u.pathname.match(/^\/auth\/v1\/admin\/users\/(.+)$/);
  if (gm) { const usr = db.users.find((x) => x.id === gm[1]); if (!usr) return json({ msg: 'nf' }, 404); if (m === 'PUT') { const b = JSON.parse(opt.body); if (b.ban_duration) { banUntil[usr.id] = b.ban_duration; usr.banned_until = b.ban_duration === 'none' ? null : iso(now + 1e12); } return json(usr); } return json(usr); }
  if (u.pathname === '/rest/v1/rpc/hit_rate_limit') { if (!global.__rl) return json({ message: 'function not found' }, 404); const b = JSON.parse(opt.body); rlDb[b.p_key] = (rlDb[b.p_key] || 0) + 1; return json(rlDb[b.p_key] <= b.p_max); }
  const rm = u.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
  if (rm) {
    const t = rm[1]; if (!db[t]) return json({ message: 'relation does not exist' }, 404);
    let rows = db[t].slice(); const sel = u.searchParams.get('select') || '*';
    for (const [k, v] of u.searchParams) { if (['select', 'limit', 'offset', 'order', 'on_conflict'].includes(k)) continue; const mm = String(v).match(/^(eq|gte)\.(.*)$/); if (mm) rows = rows.filter((r) => mm[1] === 'eq' ? String(r[k]) === mm[2] : String(r[k]) >= mm[2]); }
    if (m === 'GET') { if (sel !== '*') { for (const c of sel.split(',')) if (db[t].length && !(c in db[t][0]) && !['is_banned', 'ban_reason', 'plan', 'plan_expires_at'].includes(c)) { /* tolerate */ } if (sel.split(',').some((c) => c === 'nonexistent_col')) return json({ message: 'column does not exist' }, 400); } const off = Number(u.searchParams.get('offset') || 0), lim = Number(u.searchParams.get('limit') || 1000); return json(rows.slice(off, off + lim)); }
    if (m === 'POST') { const b = JSON.parse(opt.body); const ex = db[t].find((r) => (t === 'user_locations' && r.user_id === b.user_id) || (t === 'email_optouts' && r.email === b.email) || (t === 'site_settings' && r.key === b.key)); if (ex) Object.assign(ex, b); else db[t].push(b); return json(null, 201); }
    if (m === 'PATCH') { const b = JSON.parse(opt.body); rows.forEach((r) => Object.assign(r, b)); return json(rows); }
  }
  return json({ message: 'unhandled ' + u.pathname }, 500);
};
const download = require('../api/download.js'), admin = require('../api/admin.js'), track = require('../api/track.js'), unsub = require('../api/unsub.js');
const common = require('../api/_lib/common.js');
const call = async (handler, body, token = 'tok-a1', method = 'POST', headers = {}) => {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  await handler({ method, headers: { authorization: token ? 'Bearer ' + token : '', ...headers }, body, url: '/x' }, res);
  return { status: res.statusCode, data: res.body ? JSON.parse(res.body) : null, raw: res.body };
};
(async () => {
  let r;
  assert.strictEqual((await call(admin, { action: 'me' }, '')).status, 401, 'no token -> 401');
  assert.strictEqual((await call(admin, { action: 'me' }, 'tok-u1')).status, 403, 'non-admin -> 403');
  assert.strictEqual((await call(admin, { action: 'nope' })).status, 400);
  assert.strictEqual((await call(admin, { action: 'me' }, 'tok-a1', 'GET')).status, 405);
  r = await call(admin, { action: 'me' }); assert.strictEqual(r.data.email, 'boss@x.com');
  console.log('auth gate OK');

  r = await call(admin, { action: 'overview' }); assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  assert.strictEqual(r.data.totals.users, 5); assert.strictEqual(r.data.totals.paid, 1); assert.strictEqual(r.data.totals.trial, 2); assert.strictEqual(r.data.totals.admins, 1);
  assert.strictEqual(r.data.signups.length, 30); assert.strictEqual(r.data.visits.length, 14); assert(r.data.topPages.length === 2); assert.strictEqual(r.data.totals.pageviews30, 30);
  assert(r.data.userCountries.find((c) => c.key === 'KE'));
  console.log('overview OK', JSON.stringify(r.data.totals));

  r = await call(admin, { action: 'users', q: 'paid' }); assert.strictEqual(r.data.total, 1); assert.strictEqual(r.data.rows[0].status, 'paid'); assert.strictEqual(r.data.rows[0].country, 'US');
  r = await call(admin, { action: 'users', filter: 'trial' }); assert.strictEqual(r.data.total, 2);
  console.log('users list/filter OK');

  r = await call(admin, { action: 'setSuspend', id: 'u1', suspend: true, days: 7, reason: 'test' }); assert.strictEqual(r.status, 200); assert.strictEqual(banUntil.u1, '168h');
  r = await call(admin, { action: 'users', q: 'trial.user' }); assert.strictEqual(r.data.rows[0].status, 'suspended');
  await call(admin, { action: 'setSuspend', id: 'u1', suspend: false }); assert.strictEqual(banUntil.u1, 'none');
  assert.strictEqual((await call(admin, { action: 'setSuspend', id: 'a1', suspend: true })).status, 400, 'cannot suspend self');
  r = await call(admin, { action: 'setBan', id: 'u3', ban: true, reason: 'abuse' }); assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  assert.strictEqual(db.profiles.find((p) => p.id === 'u3').is_banned, true); assert.strictEqual(db.devices[0].is_banned, true); assert.strictEqual(banUntil.u3, '876000h');
  await call(admin, { action: 'setBan', id: 'u3', ban: false }); assert.strictEqual(db.profiles.find((p) => p.id === 'u3').is_banned, false);
  console.log('suspend/ban OK');

  r = await call(admin, { action: 'setAdmin', id: 'u1', admin: true }); assert.strictEqual(r.status, 200); assert.strictEqual(db.profiles.find((p) => p.id === 'u1').is_admin, true);
  assert.strictEqual((await call(admin, { action: 'setSuspend', id: 'u1', suspend: true })).status, 400, 'cannot suspend another admin');
  await call(admin, { action: 'setAdmin', id: 'u1', admin: false });
  assert.strictEqual((await call(admin, { action: 'setAdmin', id: 'a1', admin: false })).status, 400, 'no self demote');
  r = await call(admin, { action: 'setPlan', id: 'u1', plan: 'yearly' }); assert.strictEqual(r.status, 200); const p1 = db.profiles.find((p) => p.id === 'u1'); assert.strictEqual(p1.plan, 'yearly'); assert(Math.abs(new Date(p1.plan_expires_at) - (now + 365 * 864e5)) < 5000);
  r = await call(admin, { action: 'setPlan', id: 'u2', plan: 'monthly' }); const p2 = db.profiles.find((p) => p.id === 'u2'); assert(new Date(p2.plan_expires_at) - (now + 40 * 864e5) < 5000 && new Date(p2.plan_expires_at) > now + 39 * 864e5, 'extends existing');
  assert.strictEqual((await call(admin, { action: 'setPlan', id: 'u1', plan: 'custom' })).status, 400, 'custom needs days');
  await call(admin, { action: 'setPlan', id: 'u1', plan: 'free' }); assert.strictEqual(p1.plan, 'free');
  assert(db.admin_audit_log.length >= 6); console.log('promote/upgrade/audit OK');

  // email
  r = await call(admin, { action: 'audienceCount', audience: { type: 'all' }, category: 'service' }); assert.strictEqual(r.data.count, 4, 'confirmed + not banned');
  r = await call(admin, { action: 'audienceCount', audience: { type: 'all' }, category: 'marketing' }); assert.strictEqual(r.data.count, 3, 'opt-out excluded for marketing');
  r = await call(admin, { action: 'audienceCount', audience: { type: 'segment', segment: { status: 'paid' } }, category: 'service' }); assert.strictEqual(r.data.count, 1);
  r = await call(admin, { action: 'audienceCount', audience: { type: 'segment', segment: { country: 'KE' } }, category: 'service' }); assert.strictEqual(r.data.count, 1);
  r = await call(admin, { action: 'audienceCount', audience: { type: 'selected', ids: ['u1', 'u3', 'u4'] }, category: 'service' }); assert.strictEqual(r.data.count, 2, 'unconfirmed skipped');
  r = await call(admin, { action: 'emailSend', subject: 'Hi {{name}}', body: 'Hello [date]', category: 'service', audience: { type: 'all' }, confirmCount: 4 }); assert.strictEqual(r.status, 400, 'placeholder blocked');
  r = await call(admin, { action: 'emailSend', subject: 'Hi {{name}}', body: 'Hello {{name}}\n\n- one\n- two\n\n[docs](https://x.com/a?b=1&c=2) <script>alert(1)</script>', category: 'service', test: true }); assert.strictEqual(r.status, 200); assert.strictEqual(sent.length, 1); assert(sent[0].subject.startsWith('[TEST] Hi Boss')); assert(!/<script>/.test(sent[0].html)); assert(/<li/.test(sent[0].html));
  sent.length = 0;
  r = await call(admin, { action: 'emailSend', subject: 'News', body: 'Big news {{name}}', category: 'marketing', audience: { type: 'all' }, confirmCount: 99 }); assert.strictEqual(r.status, 400, 'confirm count enforced');
  r = await call(admin, { action: 'emailSend', subject: 'News', body: 'Big news {{name}}', category: 'marketing', audience: { type: 'all' }, confirmCount: 3 }); assert.strictEqual(r.status, 200, JSON.stringify(r.data)); assert.strictEqual(r.data.sent, 3); assert.strictEqual(sent.length, 3);
  assert(sent.every((m) => m.headers && m.headers['List-Unsubscribe'] && /api\/unsub\?e=/.test(m.html))); assert(!sent.find((m) => m.to[0] === 'paid.person@x.com'), 'opted out not emailed');
  assert.strictEqual(db.email_campaigns.length, 1); assert.strictEqual(db.email_campaigns[0].status, 'sent');
  sent.length = 0;
  r = await call(admin, { action: 'emailSend', subject: 'Security notice', body: 'Important', category: 'service', audience: { type: 'all' }, confirmCount: 4 }); assert.strictEqual(r.data.sent, 4); assert(sent.find((m) => m.to[0] === 'paid.person@x.com'), 'service ignores opt-out'); assert(!sent.find((m) => m.to[0] === 'noconfirm@x.com'));
  assert(sent.every((m) => !m.headers), 'service has no unsubscribe header');
  console.log('email OK');

  // unsubscribe
  const link = common.unsubLink('trial.user@x.com'); const q = new URL(link);
  const rr = { headers: {}, setHeader() {}, end(b) { this.body = b; } };
  await unsub({ method: 'GET', url: q.pathname + q.search }, rr); assert.strictEqual(rr.statusCode, 200); assert(db.email_optouts.find((o) => o.email === 'trial.user@x.com'));
  const bad = { headers: {}, setHeader() {}, end() {} }; await unsub({ method: 'GET', url: q.pathname + '?e=' + q.searchParams.get('e') + '&t=deadbeef' }, bad); assert.strictEqual(bad.statusCode, 400);
  console.log('unsubscribe OK');

  // tracking
  const before = db.site_events.length;
  r = await call(track, { path: '/pricing?x=1', ref: 'google.com', w: 1200 }, '', 'POST', { 'x-vercel-ip-country': 'ke', 'x-vercel-ip-city': 'Nairobi', 'user-agent': 'Mozilla/5.0 Chrome' }); assert.strictEqual(r.status, 204);
  assert.strictEqual(db.site_events.length, before + 1); const ev = db.site_events[db.site_events.length - 1]; assert.strictEqual(ev.country, 'KE'); assert.strictEqual(ev.path, '/pricing'); assert(!('ip' in ev));
  r = await call(track, { event: 'signin', path: '/login' }, 'tok-u2', 'POST', { 'x-vercel-ip-country': 'GB', 'user-agent': 'Mozilla/5.0' }); assert.strictEqual(db.user_locations.find((l) => l.user_id === 'u2').country, 'GB');
  const n2 = db.site_events.length; await call(track, { path: '/' }, '', 'POST', { 'user-agent': 'Googlebot' }); assert.strictEqual(db.site_events.length, n2, 'bots ignored');
  console.log('tracking OK');

  // tracking: browser origins (CORS)
  const evs = db.site_events.length;
  r = await call(track, { path: '/' }, '', 'OPTIONS', { origin: 'https://www.vertexstealth.top' }); assert.strictEqual(r.status, 204);
  const okRes = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end() {} };
  await track({ method: 'POST', headers: { origin: 'https://www.vertexstealth.top', 'user-agent': 'Mozilla/5.0' }, body: { path: '/faq' }, url: '/x' }, okRes);
  assert.strictEqual(okRes.statusCode, 204); assert.strictEqual(okRes.headers['Access-Control-Allow-Origin'], 'https://www.vertexstealth.top'); assert.strictEqual(okRes.headers.Vary, 'Origin');
  r = await call(track, { path: '/' }, '', 'POST', { origin: 'https://evil.example', 'user-agent': 'Mozilla/5.0' }); assert.strictEqual(r.status, 403, 'other websites are refused');
  r = await call(track, { path: '/' }, '', 'OPTIONS', { origin: 'https://evil.example' }); assert.strictEqual(r.status, 403, 'preflight from other websites refused');
  assert.strictEqual(db.site_events.length, evs + 1, 'only the allowed origin was recorded');
  r = await call(track, { path: '/app' }, '', 'POST', { origin: 'null', 'user-agent': 'Electron VertexStealth' }); assert.strictEqual(r.status, 204, 'desktop app window (null origin) accepted');
  r = await call(track, { path: '/app2' }, '', 'POST', { 'user-agent': 'VertexStealth' }); assert.strictEqual(r.status, 204, 'no Origin header accepted');
  console.log('tracking origins OK');

  // rate limiting
  global.__rl = true;
  for (let i = 0; i < 120; i++) assert.strictEqual((await call(admin, { action: 'me' })).status, 200, 'under the limit');
  const rlRes = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  await admin({ method: 'POST', headers: { authorization: 'Bearer tok-a1' }, body: { action: 'me' }, url: '/x' }, rlRes);
  assert.strictEqual(rlRes.statusCode, 429, 'admin limited after 120 requests a minute'); assert.strictEqual(rlRes.headers['Retry-After'], '60');
  assert.strictEqual((await call(admin, { action: 'me' }, '')).status, 429, 'bad tokens count too');
  const rl2 = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  await admin({ method: 'POST', headers: { authorization: 'Bearer tok-a1', 'x-forwarded-for': '203.0.113.9' }, body: { action: 'me' }, url: '/x' }, rl2);
  assert.strictEqual(rl2.statusCode, 200, 'another visitor is not affected');
  const ul = new URL(common.unsubLink('trial.user@x.com'));
  let last;
  for (let i = 0; i < 21; i++) { last = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } }; await unsub({ method: 'GET', headers: { 'x-forwarded-for': '198.51.100.7' }, url: ul.pathname + ul.search }, last); }
  assert.strictEqual(last.statusCode, 429, 'unsubscribe limited after 20 requests a minute'); assert.strictEqual(last.headers['Retry-After'], '60');
  global.__rl = false;
  r = await call(admin, { action: 'me' }); assert.strictEqual(r.status, 200, 'fails open when the SQL has not been run');
  console.log('rate limits OK');

  // releases / download link
  r = await call(download, {}, '', 'GET'); assert.strictEqual(r.data.url, null, 'nothing set yet');
  r = await call(admin, { action: 'latestRelease' }); assert.strictEqual(r.data.version, '0.2.2'); assert(/\.exe$/.test(r.data.url) && !/blockmap/.test(r.data.url));
  const good = 'https://github.com/tonnydominic90-sketch/VertexStealth-Release/releases/download/0.2.2/VertexStealth-Setup-0.2.2.exe';
  assert.strictEqual((await call(admin, { action: 'setDownload', version: '0.2.2', url: 'https://evil.com/x.exe' })).status, 400, 'foreign host rejected');
  assert.strictEqual((await call(admin, { action: 'setDownload', version: '0.2.2', url: good.replace('.exe', '.zip') })).status, 400, 'non-exe rejected');
  assert.strictEqual((await call(admin, { action: 'setDownload', version: '9.9.9', url: good.replace(/0\.2\.2/g, '9.9.9') })).status, 400, 'missing file rejected');
  assert.strictEqual((await call(admin, { action: 'setDownload', version: 'bad version!', url: good })).status, 400, 'bad version rejected');
  assert.strictEqual((await call(admin, { action: 'setDownload', version: '0.2.2', url: good }, 'tok-u1')).status, 403, 'non-admin rejected');
  r = await call(admin, { action: 'setDownload', version: '0.2.2', url: good }); assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  r = await call(download, {}, '', 'GET'); assert.strictEqual(r.data.url, good); assert.strictEqual(r.data.version, '0.2.2');
  r = await call(admin, { action: 'getDownload' }); assert.strictEqual(r.data.current.version, '0.2.2'); console.log('releases OK');
  r = await call(admin, { action: 'setupCheck' }); assert.strictEqual(r.status, 200); assert(r.data.checks.length > 10); console.log('setup check OK:', r.data.checks.filter((c) => !c.ok).map((c) => c.name).join(', ') || 'all green');
  console.log('\nALL API TESTS PASSED');
})().catch((e) => { console.error('TEST FAILED:', e); process.exit(1); });
