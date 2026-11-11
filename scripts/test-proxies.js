'use strict';
// Offline test of the free proxy list: parsing, real tunnel checks against local mock proxies, the refresh job,
// the admin actions and the public API, all against an in-memory fake Supabase. Run: node scripts/test-proxies.js
process.env.SUPABASE_URL = 'https://fake.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'; process.env.SITE_URL = 'https://www.vertexstealth.top';
const assert = require('assert'); const fs = require('fs'); const path = require('path');
const net = require('net'), tls = require('tls');

// ---- send "public" test IPs to local mock proxies ----
const realConnect = net.connect; const ROUTE = {};
net.connect = function (opts, ...rest) { if (opts && opts.host === '127.0.0.1') return realConnect.call(net, opts, ...rest); const k = opts.host + ':' + opts.port; return realConnect.call(net, ROUTE[k] ? { host: '127.0.0.1', port: ROUTE[k] } : { host: '127.0.0.1', port: 1 }, ...rest); };

const fx = (f) => fs.readFileSync(path.join(__dirname, 'fixtures', f));
const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
const quiet = (s) => s.on('error', () => {});

// ---- in-memory Supabase ----
const now = Date.now(), iso = (d) => new Date(d).toISOString();
const db = { profiles: [{ id: 'a1', email: 'boss@x.com', is_admin: true }, { id: 'u1', email: 'user@x.com', is_admin: false }], proxy_sources: [], free_proxies: [], site_settings: [], admin_audit_log: [] };
const ids = { proxy_sources: 0, free_proxies: 0 };
const DEFAULTS = { free_proxies: { https: false, alive: false, checks: 0, successes: 0, fail_streak: 0, source_ids: [], country: null, latency_ms: null, last_checked: null, last_alive_at: null } };
const json = (o, s = 200) => ({ ok: s < 300, status: s, headers: { get: () => null }, text: async () => (o === undefined ? '' : JSON.stringify(o)), json: async () => o });
const matches = (row, [k, raw]) => {
  const m = /^(eq|in|ov|lt|gte)\.(.*)$/.exec(raw); if (!m) return true; const [, op, v] = m; const cell = row[k];
  if (op === 'eq') return String(cell) === v;
  if (op === 'in') return v.replace(/^\(|\)$/g, '').split(',').includes(String(cell));
  if (op === 'ov') { const want = v.replace(/^\{|\}$/g, '').split(',').map(String); return Array.isArray(cell) && cell.some((x) => want.includes(String(x))); }
  if (op === 'lt') return cell !== null && cell !== undefined && String(cell) < v;
  if (op === 'gte') return String(cell) >= v;
  return true;
};
const sources = {}; // url -> text | Error
const geoCalls = [];
let geoFail = false;
global.fetch = async (url, opt = {}) => {
  const u = new URL(url); const m = opt.method || 'GET'; const auth = (opt.headers || {}).Authorization || '';
  if (u.host === 'lists.test') { const v = sources[u.pathname]; if (v === undefined) return json('nope', 404); if (v instanceof Error) throw v; if (typeof v === 'object' && v.redirect) return { ok: false, status: 302, headers: { get: (h) => (h.toLowerCase() === 'location' ? v.redirect : null) }, text: async () => '' }; return { ok: true, status: 200, headers: { get: () => null }, text: async () => v }; }
  if (u.host === 'api.country.is') {
    if (geoFail) return json({ error: 'down' }, 500);
    if (m === 'POST') { const ips = JSON.parse(opt.body); geoCalls.push(ips.length); return json(ips.map((ip) => ({ ip, country: ip.startsWith('41.') ? 'KE' : ip.startsWith('5.') ? 'DE' : 'US' }))); }
    const ip = u.pathname.slice(1); return json({ ip, country: 'US' });
  }
  if (u.pathname === '/auth/v1/user') { const tok = auth.replace('Bearer ', ''); const usr = [{ id: 'a1' }, { id: 'u1' }].find((x) => 'tok-' + x.id === tok); return usr ? json(usr) : json({ msg: 'bad' }, 401); }
  const rpc = u.pathname.match(/^\/rest\/v1\/rpc\/claim_proxy_refresh$/);
  if (rpc) {
    const gap = JSON.parse(opt.body).min_gap_seconds; const row = db.site_settings.find((r) => r.key === 'proxy_refresh');
    if (!row) { db.site_settings.push({ key: 'proxy_refresh', value: { startedAt: iso(Date.now()) } }); return json(true); }
    if (Date.now() - new Date(row.value.startedAt).getTime() >= gap * 1000) { row.value.startedAt = iso(Date.now()); return json(true); }
    return json(false);
  }
  const rm = u.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
  if (rm) {
    const t = rm[1]; if (!db[t]) return json({ message: 'relation "' + t + '" does not exist' }, 404);
    const filters = [...u.searchParams].filter(([k]) => !['select', 'limit', 'offset', 'order', 'on_conflict'].includes(k));
    let rows = db[t].filter((r) => filters.every((f) => matches(r, f)));
    if (m === 'GET') {
      const ord = u.searchParams.get('order');
      if (ord) { const [f, dir] = ord.split('.'); rows = rows.slice().sort((a, b) => { const x = a[f], y = b[f]; if (x === null || x === undefined) return 1; if (y === null || y === undefined) return -1; return (x < y ? -1 : x > y ? 1 : 0) * (dir === 'desc' ? -1 : 1); }); }
      const off = Number(u.searchParams.get('offset') || 0), lim = Number(u.searchParams.get('limit') || 1000);
      return json(rows.slice(off, off + lim).map((r) => JSON.parse(JSON.stringify(r))));
    }
    if (m === 'POST') {
      const b = JSON.parse(opt.body); const arr = Array.isArray(b) ? b : [b]; const conflict = u.searchParams.get('on_conflict'); const out = [];
      if (Array.isArray(b)) { const keys = Object.keys(b[0] || {}).sort().join(); b.forEach((r) => assert.strictEqual(Object.keys(r).sort().join(), keys, 'bulk rows must share the same keys')); }
      for (const r of arr) {
        let ex = null;
        if (conflict) { const cols = conflict.split(','); ex = db[t].find((x) => cols.every((c) => x[c] === r[c])); }
        if (t === 'proxy_sources') { if (db[t].some((x) => x.url.toLowerCase() === String(r.url).toLowerCase())) return json({ message: 'duplicate key value violates unique constraint "proxy_sources_url_uidx"' }, 409); }
        if (ex) Object.assign(ex, r);
        else { const row = Object.assign({}, DEFAULTS[t] || {}, t === 'proxy_sources' ? { enabled_site: true, enabled_app: true, last_found: 0, created_at: iso(Date.now()) } : {}, r); if (t in ids) row.id = ++ids[t]; db[t].push(row); out.push(row); }
      }
      return json(opt.headers && opt.headers.Prefer && /representation/.test(opt.headers.Prefer) ? out : null, 201);
    }
    if (m === 'PATCH') { const b = JSON.parse(opt.body); rows.forEach((r) => Object.assign(r, b)); return json(rows); }
    if (m === 'DELETE') { rows.forEach((r) => db[t].splice(db[t].indexOf(r), 1)); return json(null, 204); }
  }
  return json({ message: 'unhandled ' + u.pathname }, 500);
};

const P = require('../api/_lib/proxies.js');
const admin = require('../api/admin.js'), pub = require('../api/free-proxies.js'), refresh = require('../api/proxy-refresh.js');
const call = async (handler, body, token = 'tok-a1', method = 'POST', headers = {}, url = '/x') => {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  await handler({ method, headers: { authorization: token ? 'Bearer ' + token : '', ...headers }, body, url }, res);
  let data = null; try { data = res.body ? JSON.parse(res.body) : null; } catch (e) { /* text */ }
  return { status: res.statusCode, data, raw: res.body, headers: res.headers };
};
const adm = (action, body, tok) => call(admin, { action, ...body }, tok);
const get = (qs) => call(pub, undefined, '', 'GET', {}, '/api/free-proxies' + (qs ? '?' + qs : ''));
let passed = 0; const ok = (name, fn) => { try { const r = fn(); if (r && r.then) return r.then(() => { passed++; }, (e) => { console.error('FAIL', name, '\n', e.stack || e); process.exitCode = 1; }); passed++; } catch (e) { console.error('FAIL', name, '\n', e.stack || e); process.exitCode = 1; } };

(async () => {
  // ================= parsing =================
  await ok('parse: plain, prefixed, extra columns, comments, credentials, private, duplicates', () => {
    const text = ['# comment', '8.8.4.4:3128', '8.8.4.4:3128', 'socks5://5.6.7.8:1080', 'http://9.9.9.9:80', '41.1.2.3:8080:KE:elite', '45.74.31.42 7433', 'user:pw@6.6.6.6:80', '10.0.0.1:80', '192.168.1.1:3128', '127.0.0.1:8080', '1.2.3.4:99999', '1.2.3.4:0', '300.1.1.1:80', '01.2.3.4:80', 'garbage line', '', 'https://5.5.5.5:443', '\uFEFF7.7.7.7:81'].join('\r\n');
    const r = P.parseList(text, 'http'); const keys = r.entries.map((e) => `${e.protocol}://${e.ip}:${e.port}`);
    assert.deepStrictEqual(keys, ['http://8.8.4.4:3128', 'socks5://5.6.7.8:1080', 'http://9.9.9.9:80', 'http://41.1.2.3:8080', 'http://45.74.31.42:7433', 'http://5.5.5.5:443', 'http://7.7.7.7:81']);
    assert.strictEqual(r.invalid, 7);
    const mixed = P.parseList(text, 'mixed').entries.map((e) => `${e.protocol}://${e.ip}:${e.port}`);
    assert.ok(mixed.includes('socks5://5.6.7.8:1080') && mixed.includes('http://8.8.4.4:3128') && mixed.includes('http://5.5.5.5:443'));
    assert.deepStrictEqual(P.parseList('1.1.1.1:1080', 'socks4').entries[0].protocol, 'socks4');
    assert.deepStrictEqual(P.parseList('1.1.1.1:1080', 'https').entries[0].protocol, 'http');
  });
  await ok('parse: JSON shapes', () => {
    const a = P.parseList(JSON.stringify(['8.8.4.4:80', '5.6.7.8:81']), 'http').entries; assert.strictEqual(a.length, 2);
    const b = P.parseList(JSON.stringify({ data: [{ ip: '8.8.4.4', port: '3128', protocols: ['socks5'] }, { ip: '10.0.0.1', port: 1 }] }), 'mixed').entries; assert.deepStrictEqual(b, [{ ip: '8.8.4.4', port: 3128, protocol: 'socks5' }]);
    const c = P.parseList(JSON.stringify([{ host: '5.6.7.8', port: 8080, type: 'socks4' }, { host: '5.6.7.9', port: 8080 }]), 'http').entries; assert.deepStrictEqual(c.map((x) => x.protocol), ['socks4', 'http']);
    const incogniton = P.parseList(JSON.stringify([{ address: '8.8.4.4:8080', country: 'US', protocols: ['http'], anonymityLevel: 'elite', ping: 120 }, { address: '5.6.7.8:1080', protocols: ['socks5'] }]), 'mixed').entries; assert.deepStrictEqual(incogniton, [{ ip: '8.8.4.4', port: 8080, protocol: 'http' }, { ip: '5.6.7.8', port: 1080, protocol: 'socks5' }]);
    const wrapped = P.parseList(JSON.stringify({ jsonData: [{ ip: '9.9.9.9', port: 3128, protocol: 'http' }] }), 'http').entries; assert.deepStrictEqual(wrapped, [{ ip: '9.9.9.9', port: 3128, protocol: 'http' }]);
  });
  await ok('public ip filter', () => {
    for (const ip of ['10.1.1.1', '127.0.0.1', '172.16.0.1', '172.31.255.1', '192.168.0.1', '169.254.1.1', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1', '192.0.2.1']) assert.ok(!P.isPublicIPv4(ip), ip);
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '172.15.0.1', '100.63.0.1', '45.74.31.42', '41.90.1.1']) assert.ok(P.isPublicIPv4(ip), ip);
  });
  await ok('source link validation', () => {
    for (const bad of ['', 'ftp://x.com/a', 'http://localhost/a', 'http://127.0.0.1/a', 'https://10.0.0.5/x', 'https://u:p@x.com/a', 'https://[::1]/a', 'nonsense', 'https://thing.internal/x']) assert.throws(() => P.assertSafeUrl(bad), bad);
    P.assertSafeUrl('https://raw.githubusercontent.com/a/b/main/http.txt'); P.assertSafeUrl('http://8.8.8.8/list.txt');
  });

  // ================= checks against real sockets =================
  const tlsSrv = tls.createServer({ key: fx('test-key.pem'), cert: fx('test-cert.pem') }, (s) => { quiet(s); s.end(); });
  const tlsPort = await listen(tlsSrv);
  const tunnel = (s, reply) => { const up = net.connect.call(net, { host: '127.0.0.1', port: tlsPort }); realConnect; };
  const toTls = (s, hello) => { const up = realConnect.call(net, { host: '127.0.0.1', port: tlsPort }, () => { s.write(hello); s.pipe(up); up.pipe(s); }); up.on('error', () => s.destroy()); quiet(up); };
  const httpConnect = net.createServer((s) => { quiet(s); s.once('data', (d) => { if (String(d).startsWith('CONNECT')) toTls(s, 'HTTP/1.1 200 Connection established\r\n\r\n'); else { s.write('HTTP/1.1 200 OK\r\n\r\n'); s.end(); } }); });
  const httpPlain = net.createServer((s) => { quiet(s); s.once('data', (d) => { s.write(String(d).startsWith('CONNECT') ? 'HTTP/1.1 405 Method Not Allowed\r\n\r\n' : 'HTTP/1.1 301 Moved\r\nLocation: x\r\n\r\n'); s.end(); }); });
  const httpDenied = net.createServer((s) => { quiet(s); s.once('data', () => { s.write('HTTP/1.1 403 Forbidden\r\n\r\n'); s.end(); }); });
  const httpFake = net.createServer((s) => { quiet(s); s.once('data', () => { s.write('HTTP/1.1 200 OK\r\n\r\nhello'); s.end(); }); });
  const socks5 = net.createServer((s) => { quiet(s); s.once('data', () => { s.write(Buffer.from([5, 0])); s.once('data', () => toTls(s, Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]))); }); });
  const socks5Auth = net.createServer((s) => { quiet(s); s.once('data', () => { s.write(Buffer.from([5, 2])); s.end(); }); });
  const socks5Dom = net.createServer((s) => { quiet(s); s.once('data', () => { s.write(Buffer.from([5, 0])); s.once('data', () => toTls(s, Buffer.concat([Buffer.from([5, 0, 0, 3, 4]), Buffer.from('host'), Buffer.from([0, 80])]))); }); });
  const socks4 = net.createServer((s) => { quiet(s); s.once('data', () => toTls(s, Buffer.from([0, 0x5a, 0, 0, 0, 0, 0, 0]))); });
  const socks4Deny = net.createServer((s) => { quiet(s); s.once('data', () => { s.write(Buffer.from([0, 0x5b, 0, 0, 0, 0, 0, 0])); s.end(); }); });
  const silent = net.createServer((s) => quiet(s));
  const P_ = {}; for (const [n, srv] of Object.entries({ httpConnect, httpPlain, httpDenied, httpFake, socks5, socks5Auth, socks5Dom, socks4, socks4Deny, silent })) P_[n] = await listen(srv);
  const chk = (protocol, port, timeout = 1500) => P.checkProxy({ ip: '127.0.0.1', port, protocol }, { timeout });
  await ok('check: http proxy with CONNECT -> https true', async () => { const r = await chk('http', P_.httpConnect); assert.ok(r.ok && r.https === true && r.ms >= 0, JSON.stringify(r)); });
  await ok('check: http proxy without CONNECT -> http only', async () => { const r = await chk('http', P_.httpPlain); assert.ok(r.ok && r.https === false, JSON.stringify(r)); });
  await ok('check: http proxy that denies everything is dead', async () => { assert.strictEqual((await chk('http', P_.httpDenied)).ok, false); });
  await ok('check: fake 200 answer with no tunnel is dead', async () => { assert.strictEqual((await chk('http', P_.httpFake)).ok, false); });
  await ok('check: socks5 works; domain-type reply handled; auth-only proxy is dead', async () => { assert.ok((await chk('socks5', P_.socks5)).ok); assert.ok((await chk('socks5', P_.socks5Dom)).ok); assert.strictEqual((await chk('socks5', P_.socks5Auth)).ok, false); });
  await ok('check: socks4 works, denied is dead', async () => { assert.ok((await chk('socks4', P_.socks4)).ok); assert.strictEqual((await chk('socks4', P_.socks4Deny)).ok, false); });
  await ok('check: silent and closed ports time out / fail fast', async () => { const t0 = Date.now(); assert.strictEqual((await chk('http', P_.silent, 700)).ok, false); assert.ok(Date.now() - t0 < 1500); assert.strictEqual((await chk('socks5', 1)).ok, false); });
  await ok('check: protocol mismatch is dead (socks5 client against http proxy)', async () => { assert.strictEqual((await chk('socks5', P_.httpConnect)).ok, false); assert.strictEqual((await chk('http', P_.socks5)).ok, false); });

  // ================= admin: sources =================
  await ok('admin: only admins can use proxy actions', async () => { assert.strictEqual((await adm('proxyOverview', {}, 'tok-u1')).status, 403); assert.strictEqual((await adm('proxyOverview', {}, '')).status, 401); });
  await ok('admin: validation of new sources', async () => {
    for (const body of [{ name: '', url: 'https://lists.test/a.txt', protocol: 'http' }, { name: 'x', url: 'http://127.0.0.1/a', protocol: 'http' }, { name: 'x', url: 'https://lists.test/a.txt', protocol: 'ftp' }, { name: 'x', url: 'javascript:alert(1)', protocol: 'http' }]) assert.strictEqual((await adm('proxySourceSave', body)).status, 400, JSON.stringify(body));
  });
  sources['/http.txt'] = ['8.8.4.4:3128', '8.8.4.4:3129', '8.8.4.4:3130', '8.8.4.4:3131', '5.1.1.1:80', '5.1.1.2:80', '41.2.2.2:8080'].join('\n');
  sources['/socks5.txt'] = ['5.9.9.1:1080', '5.9.9.2:1080', '5.9.9.3:1080', '10.0.0.9:1080'].join('\n');
  sources['/mixed.txt'] = ['socks4://6.4.4.1:1080', 'http://8.8.4.4:3128', 'socks5://5.9.9.1:1080', '6.4.4.2:3128', '127.0.0.1:8080'].join('\n');
  ROUTE['8.8.4.4:3128'] = P_.httpConnect; ROUTE['8.8.4.4:3129'] = P_.httpPlain; ROUTE['8.8.4.4:3130'] = P_.httpFake; /* 3131 dead */ ROUTE['5.1.1.1:80'] = P_.httpDenied; ROUTE['41.2.2.2:8080'] = P_.httpConnect;
  ROUTE['5.9.9.1:1080'] = P_.socks5; ROUTE['5.9.9.2:1080'] = P_.socks5; /* 5.9.9.3 dead */ ROUTE['6.4.4.1:1080'] = P_.socks4; ROUTE['6.4.4.2:3128'] = P_.httpConnect;
  let idHttp, idSocks, idMixed;
  await ok('admin: test link reports what it finds, saves nothing', async () => {
    const r = await adm('proxySourceTest', { url: 'https://lists.test/mixed.txt', protocol: 'mixed' });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.data.found, 4); assert.deepStrictEqual(r.data.byProtocol, { socks4: 1, http: 2, socks5: 1 }); assert.strictEqual(r.data.sample.length, 4);
    assert.strictEqual(db.proxy_sources.length, 0);
    sources['/empty.txt'] = '<html>nothing</html>'; assert.strictEqual((await adm('proxySourceTest', { url: 'https://lists.test/empty.txt', protocol: 'http' })).status, 400);
    assert.strictEqual((await adm('proxySourceTest', { url: 'https://lists.test/missing.txt', protocol: 'http' })).status, 400);
    sources['/boom.txt'] = new Error('ECONNRESET'); assert.strictEqual((await adm('proxySourceTest', { url: 'https://lists.test/boom.txt', protocol: 'http' })).status, 400);
  });
  await ok('admin: redirects are followed but checked', async () => {
    sources['/r1.txt'] = { redirect: 'https://lists.test/http.txt' }; assert.strictEqual((await adm('proxySourceTest', { url: 'https://lists.test/r1.txt', protocol: 'http' })).data.found, 7);
    sources['/r2.txt'] = { redirect: 'http://127.0.0.1/secret' }; assert.strictEqual((await adm('proxySourceTest', { url: 'https://lists.test/r2.txt', protocol: 'http' })).status, 400);
  });
  await ok('admin: add / duplicate / list', async () => {
    let r = await adm('proxySourceSave', { name: 'HTTP list', url: 'https://lists.test/http.txt', protocol: 'http', enabledSite: true, enabledApp: true }); assert.strictEqual(r.status, 200); idHttp = r.data.id;
    r = await adm('proxySourceSave', { name: 'SOCKS5 list', url: 'https://lists.test/socks5.txt', protocol: 'socks5', enabledSite: true, enabledApp: false }); idSocks = r.data.id;
    r = await adm('proxySourceSave', { name: 'Mixed list', url: 'https://lists.test/mixed.txt', protocol: 'mixed', enabledSite: false, enabledApp: true }); idMixed = r.data.id;
    assert.strictEqual((await adm('proxySourceSave', { name: 'again', url: 'HTTPS://LISTS.TEST/http.txt', protocol: 'http' })).status, 400);
    const o = (await adm('proxyOverview', {})).data; assert.strictEqual(o.sources.length, 3);
    const s = o.sources.find((x) => x.id === idSocks); assert.ok(s.enabledSite === true && s.enabledApp === false);
    assert.ok(db.admin_audit_log.some((a) => a.action === 'proxy_source_add'));
  });

  // ================= refresh =================
  await ok('refresh: claims the lock, checks, stores only working proxies, fills countries', async () => {
    const t = Date.now(); const st = await P.refreshAll({ minGapSeconds: 0, limits: { checkTimeoutMs: 1500 } });
    assert.ok(st.ran, JSON.stringify(st)); assert.strictEqual(st.sources.ok, 3);
    const got = db.free_proxies.map((r) => `${r.protocol}://${r.ip}:${r.port}${r.https ? '+https' : ''}`).sort();
    assert.deepStrictEqual(got, ['http://41.2.2.2:8080+https', 'http://6.4.4.2:3128+https', 'http://8.8.4.4:3128+https', 'http://8.8.4.4:3129', 'socks4://6.4.4.1:1080', 'socks5://5.9.9.1:1080', 'socks5://5.9.9.2:1080']);
    const by = Object.fromEntries(db.free_proxies.map((r) => [`${r.ip}:${r.port}`, r]));
    assert.deepStrictEqual(by['8.8.4.4:3128'].source_ids, [idHttp, idMixed]); assert.deepStrictEqual(by['5.9.9.1:1080'].source_ids, [idSocks, idMixed]); assert.deepStrictEqual(by['5.9.9.2:1080'].source_ids, [idSocks]);
    assert.strictEqual(by['41.2.2.2:8080'].country, 'KE'); assert.strictEqual(by['5.9.9.1:1080'].country, 'DE'); assert.strictEqual(by['8.8.4.4:3128'].country, 'US');
    assert.ok(by['8.8.4.4:3128'].alive && by['8.8.4.4:3128'].checks === 1 && by['8.8.4.4:3128'].latency_ms >= 0);
    const src = db.proxy_sources.find((x) => x.id === idHttp); assert.strictEqual(src.last_status, 'ok'); assert.strictEqual(src.last_found, 7);
    assert.strictEqual(db.proxy_sources.find((x) => x.id === idMixed).last_found, 4);
    assert.ok(db.site_settings.find((x) => x.key === 'proxy_refresh_stats').value.newAlive === 7);
    assert.ok(Date.now() - t < 20000);
  });
  await ok('refresh: the lock stops a second refresh inside the gap', async () => { const r = await P.refreshAll({ minGapSeconds: 600 }); assert.strictEqual(r.ran, false); });
  await ok('refresh endpoint: cron auth and public trigger', async () => {
    assert.strictEqual((await call(refresh, undefined, '', 'GET')).status, 401);
    assert.strictEqual((await call(refresh, undefined, '', 'GET', { 'user-agent': 'Mozilla/5.0' })).status, 401);
    let r = await call(refresh, undefined, '', 'GET', { 'user-agent': 'vercel-cron/1.0' }); assert.strictEqual(r.status, 200); assert.strictEqual(r.data.ran, false);
    process.env.CRON_SECRET = 's3cret'; assert.strictEqual((await call(refresh, undefined, '', 'GET', { 'user-agent': 'vercel-cron/1.0' })).status, 401);
    r = await call(refresh, undefined, 'Bearer s3cret'.slice(7) ? '' : '', 'GET', { authorization: 'Bearer s3cret' }); assert.strictEqual(r.status, 200); delete process.env.CRON_SECRET;
    r = await call(refresh, undefined, '', 'POST'); assert.strictEqual(r.status, 200); assert.strictEqual(r.data.ran, false);
    assert.strictEqual((await call(refresh, undefined, '', 'DELETE')).status, 405);
  });

  // ================= public API =================
  const sig = (d) => d.rows.map((r) => `${r.ip}:${r.port}`).sort();
  await ok('public: website shows sources enabled for the site only', async () => {
    P.invalidateCache(); const d = (await get('')).data;
    assert.deepStrictEqual(sig(d), ['41.2.2.2:8080', '5.9.9.1:1080', '5.9.9.2:1080', '8.8.4.4:3128', '8.8.4.4:3129']); // not 6.4.4.x (mixed list is app-only)
    assert.strictEqual(d.total, 5); assert.strictEqual(d.facets.protocols.socks5, 2); assert.strictEqual(d.facets.protocols.https, 2); assert.strictEqual(d.facets.protocols.http, 3);
    assert.deepStrictEqual(d.facets.countries.map((c) => c.code).sort(), ['DE', 'KE', 'US']);
    const row = d.rows.find((r) => r.ip === '8.8.4.4' && r.port === 3128); assert.ok(row.https && row.country === 'US' && row.protocol === 'http' && typeof row.ms === 'number' && row.checked && row.uptime === 100);
    assert.ok(!('source_ids' in row) && !('id' in row));
    assert.strictEqual(d.stale, false); assert.ok(d.updatedAt);
    const row0 = db.site_settings.find((x) => x.key === 'proxy_refresh'); const keep = row0.value.startedAt; row0.value.startedAt = iso(Date.now() - 30 * 60000); P.invalidateCache(); assert.strictEqual((await get('')).data.stale, true); row0.value.startedAt = keep; P.invalidateCache();
  });
  await ok('public: the app shows sources enabled for the app only', async () => {
    const d = (await get('target=app')).data; assert.deepStrictEqual(sig(d), ['41.2.2.2:8080', '5.9.9.1:1080', '6.4.4.1:1080', '6.4.4.2:3128', '8.8.4.4:3128', '8.8.4.4:3129']); // not 5.9.9.2 (socks5 list is site-only)
    const s = (await get('view=sources&target=app')).data.sources; assert.deepStrictEqual(s.map((x) => x.name), ['HTTP list', 'Mixed list']);
    assert.deepStrictEqual((await get('view=sources')).data.sources.map((x) => x.name), ['HTTP list', 'SOCKS5 list']);
  });
  await ok('public: filters, sorting, pagination', async () => {
    assert.deepStrictEqual(sig((await get('protocol=socks5')).data), ['5.9.9.1:1080', '5.9.9.2:1080']);
    assert.deepStrictEqual(sig((await get('protocol=https')).data), ['41.2.2.2:8080', '8.8.4.4:3128']);
    assert.deepStrictEqual(sig((await get('protocol=http')).data), ['41.2.2.2:8080', '8.8.4.4:3128', '8.8.4.4:3129']);
    assert.deepStrictEqual(sig((await get('country=ke')).data), ['41.2.2.2:8080']); assert.strictEqual((await get('country=zz')).data.total, 0);
    assert.strictEqual((await get('protocol=socks4')).data.total, 0); assert.strictEqual((await get('protocol=<script>')).data.total, 5); assert.strictEqual((await get('maxms=0')).data.total, 5);
    const d = (await get('per=5&page=1')).data; const ms = d.rows.map((r) => r.ms); assert.deepStrictEqual(ms, ms.slice().sort((a, b) => a - b));
    const p2 = (await get('per=5&page=2')).data; assert.strictEqual(p2.page, 1); assert.strictEqual(p2.pages, 1);
    for (const x of db.free_proxies) x.latency_ms = 100 + x.id; P.invalidateCache();
    const pg = (await get('per=5&page=1')).data; assert.strictEqual(pg.rows.length, 5);
    const fast = (await get('maxms=105')).data; const all100 = (await get('per=100')).data.rows; assert.ok(fast.rows.every((r) => r.ms <= 105)); assert.strictEqual(fast.total, all100.filter((r) => r.ms <= 105).length); assert.ok(fast.total > 0 && fast.total < 5);
  });
  await ok('public: txt / csv / json exports', async () => {
    let r = await get('format=txt&protocol=socks5&download=1'); assert.deepStrictEqual(r.raw.trim().split('\n').sort(), ['5.9.9.1:1080', '5.9.9.2:1080']); assert.ok(r.raw.endsWith('\n')); assert.ok(/attachment; filename="vertexstealth-free-proxies-\d{4}-\d\d-\d\d\.txt"/.test(r.headers['Content-Disposition'])); assert.ok(/text\/plain/.test(r.headers['Content-Type']));
    r = await get('format=txt'); assert.ok(r.raw.split('\n').filter(Boolean).every((l) => /^(http|socks4|socks5):\/\/\d+\.\d+\.\d+\.\d+:\d+$/.test(l)));
    r = await get('format=csv'); const lines = r.raw.trim().split('\n'); assert.strictEqual(lines[0], 'ip,port,protocol,https,country,speed_ms,last_checked'); assert.strictEqual(lines.length, 6);
    r = await get('format=json&download=1'); assert.ok(Array.isArray(r.data) && r.data.length === 5 && r.data[0].ip); assert.ok(/\.json"/.test(r.headers['Content-Disposition']));
  });
  await ok('public: nothing enabled -> empty list, never an error', async () => {
    await adm('proxySourceToggle', { id: idHttp, where: 'both', value: false }); await adm('proxySourceToggle', { id: idSocks, where: 'both', value: false });
    const d = (await get('')).data; assert.strictEqual(d.total, 0); assert.strictEqual(d.rows.length, 0);
    await adm('proxySourceToggle', { id: idHttp, where: 'both', value: true }); await adm('proxySourceToggle', { id: idSocks, where: 'site', value: true });
  });

  // ================= admin toggles / edit / delete =================
  await ok('admin: site on / app off per source, enable/disable, edit, delete', async () => {
    await adm('proxySourceToggle', { id: idMixed, where: 'site', value: true }); await adm('proxySourceToggle', { id: idSocks, where: 'app', value: false });
    let o = (await adm('proxyOverview', {})).data; const m = o.sources.find((x) => x.id === idMixed); assert.ok(m.enabledSite && m.enabledApp);
    assert.ok(sig((await get('')).data).includes('6.4.4.1:1080'), 'site now shows the mixed list');
    await adm('proxySourceToggle', { id: idMixed, where: 'site', value: false });
    assert.ok(!sig((await get('')).data).includes('6.4.4.1:1080'));
    assert.strictEqual((await adm('proxySourceToggle', { id: 99999, where: 'site', value: true })).status, 404); assert.strictEqual((await adm('proxySourceToggle', { id: idHttp, where: 'x', value: true })).status, 400);
    let r = await adm('proxySourceSave', { id: idSocks, name: 'SOCKS5 renamed', url: 'https://lists.test/socks5.txt', protocol: 'socks5', enabledSite: true, enabledApp: false }); assert.strictEqual(r.status, 200);
    assert.strictEqual(db.proxy_sources.find((x) => x.id === idSocks).name, 'SOCKS5 renamed'); assert.strictEqual((await adm('proxySourceSave', { id: 424242, name: 'x', url: 'https://lists.test/q.txt', protocol: 'http' })).status, 404);
    o = (await adm('proxyOverview', {})).data; assert.strictEqual(o.totals.site, 5); assert.strictEqual(o.sources.find((x) => x.id === idHttp).alive, 3); // 8.8.4.4:3128, 8.8.4.4:3129, 41.2.2.2:8080
  });

  // ================= second refresh: failures, removed entries, deleted source =================
  await ok('refresh 2: dead proxies are kept hidden then dropped after 3 failures; removed entries and deleted sources clean up', async () => {
    delete ROUTE['8.8.4.4:3129'];                                  // proxy died
    sources['/http.txt'] = sources['/http.txt'].split('\n').filter((l) => !l.startsWith('41.2.2.2')).join('\n'); // entry removed from the list
    db.site_settings.find((x) => x.key === 'proxy_refresh').value.startedAt = iso(0);
    let st = await P.refreshAll({ minGapSeconds: 0, limits: { checkTimeoutMs: 1500 } }); assert.ok(st.ran);
    let by = Object.fromEntries(db.free_proxies.map((r) => [`${r.ip}:${r.port}`, r]));
    assert.strictEqual(by['8.8.4.4:3129'].alive, false); assert.strictEqual(by['8.8.4.4:3129'].fail_streak, 1);
    assert.ok(!(await get('')).data.rows.some((r) => r.port === 3129), 'failed proxy is hidden immediately');
    assert.strictEqual(by['41.2.2.2:8080'], undefined, 'entry removed from its only source is deleted');
    assert.strictEqual(by['8.8.4.4:3128'].checks, 2); assert.strictEqual(by['8.8.4.4:3128'].successes, 2);
    for (let i = 0; i < 2; i++) { db.site_settings.find((x) => x.key === 'proxy_refresh').value.startedAt = iso(0); await P.refreshAll({ minGapSeconds: 0, limits: { checkTimeoutMs: 1500 } }); }
    assert.ok(!db.free_proxies.some((r) => r.port === 3129), 'dropped after 3 failed checks');
    // delete a source: proxies that only it listed disappear on the next refresh, shared ones stay
    assert.strictEqual((await adm('proxySourceDelete', { id: idSocks })).status, 200); assert.strictEqual((await adm('proxySourceDelete', { id: idSocks })).status, 404);
    db.site_settings.find((x) => x.key === 'proxy_refresh').value.startedAt = iso(0); await P.refreshAll({ minGapSeconds: 0, limits: { checkTimeoutMs: 1500 } });
    by = Object.fromEntries(db.free_proxies.map((r) => [`${r.ip}:${r.port}`, r]));
    assert.strictEqual(by['5.9.9.2:1080'], undefined); assert.deepStrictEqual(by['5.9.9.1:1080'].source_ids, [idMixed]);
    assert.ok(db.admin_audit_log.some((a) => a.action === 'proxy_source_delete'));
  });
  await ok('refresh 3: a failing source keeps its proxies and reports the error; an empty page is an error too', async () => {
    sources['/http.txt'] = new Error('socket hang up'); db.site_settings.find((x) => x.key === 'proxy_refresh').value.startedAt = iso(0);
    const before = db.free_proxies.filter((r) => r.source_ids.includes(idHttp)).length;
    const st = await P.refreshAll({ minGapSeconds: 0, limits: { checkTimeoutMs: 1500 } }); assert.strictEqual(st.sources.failed, 1);
    const s = db.proxy_sources.find((x) => x.id === idHttp); assert.strictEqual(s.last_status, 'error'); assert.ok(/socket hang up/.test(s.last_error));
    assert.strictEqual(db.free_proxies.filter((r) => r.source_ids.includes(idHttp)).length, before, 'temporary outage does not wipe the list');
    sources['/http.txt'] = '<html>blocked</html>'; db.site_settings.find((x) => x.key === 'proxy_refresh').value.startedAt = iso(0); await P.refreshAll({ minGapSeconds: 0 });
    assert.ok(/No valid ip:port/.test(db.proxy_sources.find((x) => x.id === idHttp).last_error));
  });
  await ok('refresh: country lookup failure does not lose proxies; admin geo test', async () => {
    geoFail = true; db.free_proxies.length = 0; db.proxy_sources = db.proxy_sources.filter((x) => x.id === idHttp); sources['/http.txt'] = '8.8.4.4:3128\n'; ROUTE['8.8.4.4:3128'] = P_.httpConnect; db.site_settings.find((x) => x.key === 'proxy_refresh').value.startedAt = iso(0);
    const st = await P.refreshAll({ minGapSeconds: 0, limits: { checkTimeoutMs: 1500 } }); assert.strictEqual(st.newAlive, 1); assert.strictEqual(db.free_proxies[0].country, null);
    const g = (await adm('proxyGeoTest', {})).data; assert.strictEqual(g.ok, false); geoFail = false;
    assert.strictEqual((await adm('proxyGeoTest', {})).data.ok, true);
    db.site_settings.find((x) => x.key === 'proxy_refresh').value.startedAt = iso(0); await P.refreshAll({ minGapSeconds: 0, limits: { checkTimeoutMs: 1500 } });
    assert.strictEqual(db.free_proxies[0].country, 'US', 'country filled in on the next refresh');
  });
  await ok('admin: manual refresh endpoint respects the short gap', async () => {
    db.site_settings.find((x) => x.key === 'proxy_refresh').value.startedAt = iso(Date.now());
    assert.strictEqual((await adm('proxyRefresh', {})).status, 429);
    db.site_settings.find((x) => x.key === 'proxy_refresh').value.startedAt = iso(0);
    const r = await adm('proxyRefresh', {}); assert.strictEqual(r.status, 200); assert.ok(r.data.ran);
  });
  await ok('admin: setup check lists the new tables', async () => { const r = (await adm('setupCheck', {})).data; assert.ok(r.checks.some((c) => c.name === 'free_proxies' && c.ok) && r.checks.some((c) => c.name === 'proxy_sources' && c.ok)); });

  console.log(`\n${passed} checks passed${process.exitCode ? ' (some FAILED, see above)' : ''}`);
  process.exit(process.exitCode || 0);
})();
