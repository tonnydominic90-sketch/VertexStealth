'use strict';
/*
 * Free proxy list engine (server side only).
 *   1. Admin adds source links (Admin > Free proxies). Each link is a public list of proxies.
 *   2. refreshAll() downloads every enabled list, checks the proxies ourselves (real tunnel test, no dependencies)
 *      and stores the working ones in public.free_proxies.
 *   3. /api/free-proxies serves them to the website and to the desktop app, honouring each source's two switches.
 */
const net = require('net');
const tls = require('tls');
const C = require('./common');
const { sb, env, HttpError } = C;

const MAX_LIST_BYTES = 8 * 1024 * 1024;
const LIMITS = { recheckMax: 800, maxChecks: 2400, concurrency: 300, checkTimeoutMs: 4500, failStreakDelete: 3, pruneHours: 48 };
const PROTOCOL_CHOICES = ['http', 'https', 'socks4', 'socks5', 'mixed'];

// ---------------------------------------------------------------- IP helpers
function parseIPv4(s) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(s));
  if (!m) return null;
  if (m.slice(1).some((p) => p.length > 1 && p[0] === '0')) return null;
  const o = m.slice(1).map(Number);
  return o.some((n) => n > 255) ? null : o;
}
// Public, routable IPv4 only. Keeps private/internal addresses out of the list and out of our outbound connections.
function isPublicIPv4(ip) {
  const o = parseIPv4(ip);
  if (!o) return false;
  const [a, b, c] = o;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && ((b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99) || b === 168)) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

// ---------------------------------------------------------------- list parsing
function normProto(p) {
  p = String(p || '').toLowerCase();
  if (p === 'http' || p === 'https' || p === 'connect') return 'http';
  if (p === 'socks4' || p === 'socks4a') return 'socks4';
  if (p === 'socks5' || p === 'socks5h' || p === 'socks') return 'socks5';
  return null;
}
const hintProto = (hint) => (hint === 'mixed' ? 'http' : normProto(hint) || 'http');

// An explicit protocol in the list (socks5://1.2.3.4:1080, or a JSON type field) always wins; otherwise the source's own
// protocol setting applies ('mixed' lists without a prefix are treated as HTTP).
// Understands: ip:port | proto://ip:port | ip:port:anything | "ip port" | JSON arrays/objects with ip+port.
// Lines with a user:pass@ part are skipped (free lists do not need credentials).
function parseList(text, hint = 'http') {
  const found = new Map(); let invalid = 0;
  const add = (ip, port, proto) => {
    const p = Number(port);
    if (!isPublicIPv4(ip) || !Number.isInteger(p) || p < 1 || p > 65535) { invalid++; return; }
    const key = ip + ':' + p;
    if (!found.has(key)) found.set(key, { ip, port: p, protocol: proto || hintProto(hint) });
  };
  const line = (raw) => {
    const s = String(raw).trim();
    if (!s || s[0] === '#' || s.startsWith('//') || s.includes('@')) return;
    const m = /^(?:([a-z0-9]+):\/\/)?(\d{1,3}(?:\.\d{1,3}){3})[:\s,;]+(\d{1,5})(?![\d.])/i.exec(s);
    if (!m) return;
    add(m[2], m[3], normProto(m[1]));
  };
  const walk = (v, depth) => {
    if (depth > 5 || v === null || v === undefined) return;
    if (Array.isArray(v)) { v.forEach((x) => walk(x, depth + 1)); return; }
    if (typeof v === 'string') { line(v); return; }
    if (typeof v !== 'object') return;
    const rawProtocol = Array.isArray(v.protocols) ? v.protocols[0] : (v.protocols || v.protocol || v.type || v.scheme || v.proxyType || v.proxy_type);
    const ipField = v.ip || v.host || v.ipAddress || v.ip_address;
    const addressField = v.address || v.proxy || v.endpoint || v.server;
    // Some APIs (including Incogniton's free-proxy endpoint) return address as
    // "IP:PORT" instead of separate ip and port properties.
    if (ipField && v.port !== undefined) {
      add(String(ipField), v.port, normProto(rawProtocol));
      return;
    }
    if (addressField) {
      const address = String(addressField).trim().replace(/^(?:http|https|socks4a?|socks5h?):\/\//i, '');
      const m = /^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/.exec(address);
      if (m) { add(m[1], v.port !== undefined ? v.port : m[2], normProto(rawProtocol)); return; }
    }
    for (const k of ['data', 'proxies', 'items', 'results', 'list', 'jsonData', 'result']) if (v[k]) walk(v[k], depth + 1);
  };
  const body = String(text || '').replace(/^\uFEFF/, '').trim();
  if (body[0] === '[' || body[0] === '{') { try { walk(JSON.parse(body), 0); } catch (e) { /* not JSON, fall back to lines */ } }
  if (!found.size && !(body[0] === '[' || body[0] === '{')) body.split(/\r?\n/).forEach(line);
  return { entries: [...found.values()], invalid };
}

// ---------------------------------------------------------------- downloading a source list
function assertSafeUrl(u) {
  let url;
  try { url = new URL(u); } catch (e) { throw new Error('That is not a valid link.'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('The link must start with https:// (or http://).');
  if (url.username || url.password) throw new Error('Links with a username or password are not allowed.');
  const h = url.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h.startsWith('[')) throw new Error('Internal addresses are not allowed.');
  if (/^[\d.]+$/.test(h) && !isPublicIPv4(h)) throw new Error('Internal addresses are not allowed.');
  return url;
}
async function readCapped(res, max) {
  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader(); const chunks = []; let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.length;
      if (n > max) { try { await reader.cancel(); } catch (e) { /* ignore */ } throw new Error('The list is larger than 8 MB.'); }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  const t = await res.text();
  if (t.length > max) throw new Error('The list is larger than 8 MB.');
  return t;
}
async function fetchText(link, timeoutMs = 15000) {
  let cur = String(link);
  for (let hop = 0; hop < 4; hop++) {
    assertSafeUrl(cur);
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(cur, { redirect: 'manual', signal: ctrl.signal, headers: { 'User-Agent': 'VertexStealth-proxy-list/1.0 (+https://www.vertexstealth.top)', Accept: 'text/plain,application/json,*/*' } });
      const loc = res.headers && res.headers.get && res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && loc) { cur = new URL(loc, cur).toString(); continue; }
      if (!res.ok) throw new Error('The server answered HTTP ' + res.status + '.');
      return await readCapped(res, MAX_LIST_BYTES);
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('The server took longer than ' + Math.round(timeoutMs / 1000) + ' seconds to answer.');
      throw e;
    } finally { clearTimeout(timer); }
  }
  throw new Error('Too many redirects.');
}

// ---------------------------------------------------------------- proxy check (no dependencies: raw sockets)
// A proxy counts as working only when it opens a real tunnel to a public server and that server completes a TLS
// handshake through it. HTTP proxies that refuse CONNECT get a plain GET test instead (reported as HTTP only).
class Conn {
  constructor(ip, port, timeoutMs) {
    this.buf = Buffer.alloc(0); this.waiters = []; this.err = null; this.up = false;
    this.socket = net.connect({ host: ip, port });
    this.socket.setNoDelay(true);
    this.timer = setTimeout(() => this.fail(new Error('timeout')), timeoutMs);
    this.onData = (d) => { this.buf = Buffer.concat([this.buf, d]); this.wake(); };
    this.socket.on('connect', () => { this.up = true; this.wake(); });
    this.socket.on('data', this.onData);
    this.socket.on('error', (e) => this.fail(e));
    this.socket.on('close', () => this.fail(new Error('closed')));
  }
  wake() { const w = this.waiters; this.waiters = []; w.forEach((f) => f()); }
  fail(e) { if (this.err) return; this.err = e; clearTimeout(this.timer); try { this.socket.destroy(); } catch (x) { /* ignore */ } this.wake(); }
  async until(test) {
    for (;;) {
      if (this.err) throw this.err;
      const v = test();
      if (v !== undefined) return v;
      await new Promise((r) => this.waiters.push(r));
    }
  }
  connected() { return this.until(() => (this.up ? true : undefined)); }
  write(d) { this.socket.write(d); }
  take(n) { const out = this.buf.subarray(0, n); this.buf = this.buf.subarray(n); return out; }
  readN(n) { return this.until(() => (this.buf.length >= n ? this.take(n) : undefined)); }
  readHead() {
    return this.until(() => {
      const i = this.buf.indexOf('\r\n\r\n');
      if (i >= 0) return this.take(i + 4).toString('latin1');
      if (this.buf.length > 16384) throw new Error('header too large');
      return undefined;
    });
  }
  // Hand the raw socket to TLS and complete a handshake through the tunnel.
  tlsHandshake() {
    return new Promise((resolve, reject) => {
      this.socket.removeListener('data', this.onData);
      const t = tls.connect({ socket: this.socket, rejectUnauthorized: false });
      t.once('secureConnect', () => { resolve(); t.destroy(); });
      t.once('error', reject);
      t.once('close', () => reject(new Error('closed')));
      this.waiters.push(() => { if (this.err) reject(this.err); });
    });
  }
  close() { this.fail(new Error('done')); }
}
const ipBytes = (host) => host.split('.').map(Number);
const portBytes = (p) => [p >> 8, p & 255];

async function checkHttp(ip, port, o) {
  const t0 = Date.now(); let c = new Conn(ip, port, o.timeout); let head;
  try {
    await c.connected();
    c.write(`CONNECT ${o.host}:${o.port} HTTP/1.1\r\nHost: ${o.host}:${o.port}\r\nProxy-Connection: keep-alive\r\n\r\n`);
    head = await c.readHead();
    const m = /^HTTP\/1\.[01]\s+(\d{3})/.exec(head);
    if (!m) return { ok: false };
    if (m[1] === '200') { await c.tlsHandshake(); return { ok: true, https: true, ms: Date.now() - t0 }; }
  } catch (e) { return { ok: false, error: e.message }; } finally { c.close(); }
  // The proxy speaks HTTP but refused the tunnel: try a plain request through it.
  const left = o.timeout - (Date.now() - t0);
  if (left < 600) return { ok: false };
  c = new Conn(ip, port, left);
  try {
    await c.connected();
    c.write(`GET http://${o.host}/ HTTP/1.1\r\nHost: ${o.host}\r\nConnection: close\r\n\r\n`);
    head = await c.readHead();
    const m = /^HTTP\/1\.[01]\s+(\d{3})/.exec(head);
    const code = m ? Number(m[1]) : 0;
    return code >= 200 && code < 400 ? { ok: true, https: false, ms: Date.now() - t0 } : { ok: false };
  } catch (e) { return { ok: false, error: e.message }; } finally { c.close(); }
}
async function checkSocks5(ip, port, o) {
  const t0 = Date.now(); const c = new Conn(ip, port, o.timeout);
  try {
    await c.connected();
    c.write(Buffer.from([5, 1, 0]));
    const g = await c.readN(2);
    if (g[0] !== 5 || g[1] !== 0) return { ok: false };
    c.write(Buffer.from([5, 1, 0, 1, ...ipBytes(o.host), ...portBytes(o.port)]));
    const h = await c.readN(4);
    if (h[0] !== 5 || h[1] !== 0) return { ok: false };
    if (h[3] === 1) await c.readN(6); else if (h[3] === 4) await c.readN(18); else if (h[3] === 3) { const l = (await c.readN(1))[0]; await c.readN(l + 2); } else return { ok: false };
    await c.tlsHandshake();
    return { ok: true, https: false, ms: Date.now() - t0 };
  } catch (e) { return { ok: false, error: e.message }; } finally { c.close(); }
}
async function checkSocks4(ip, port, o) {
  const t0 = Date.now(); const c = new Conn(ip, port, o.timeout);
  try {
    await c.connected();
    c.write(Buffer.from([4, 1, ...portBytes(o.port), ...ipBytes(o.host), 0]));
    const r = await c.readN(8);
    if (r[1] !== 0x5a) return { ok: false };
    await c.tlsHandshake();
    return { ok: true, https: false, ms: Date.now() - t0 };
  } catch (e) { return { ok: false, error: e.message }; } finally { c.close(); }
}
async function checkProxy(p, opts = {}) {
  const o = Object.assign({ host: '1.1.1.1', port: 443, timeout: LIMITS.checkTimeoutMs }, opts);
  if (p.protocol === 'socks5') return checkSocks5(p.ip, p.port, o);
  if (p.protocol === 'socks4') return checkSocks4(p.ip, p.port, o);
  return checkHttp(p.ip, p.port, o);
}

async function pool(items, size, fn, shouldStop) {
  const out = new Array(items.length); let i = 0;
  const worker = async () => {
    for (;;) {
      if (shouldStop && shouldStop()) return;
      const k = i++; if (k >= items.length) return;
      try { out[k] = await fn(items[k], k); } catch (e) { out[k] = undefined; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}

// ---------------------------------------------------------------- country lookup
// Order: IPinfo Lite when IPINFO_TOKEN is set in Vercel, otherwise the free keyless country.is batch API.
async function lookupCountries(ips, deadline) {
  const out = new Map(); const list = [...new Set(ips)]; let errors = 0;
  const token = env('IPINFO_TOKEN');
  const getJson = async (url, init) => {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
    try { const r = await fetch(url, Object.assign({ signal: ctrl.signal }, init)); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(t); }
  };
  const cc = (v) => (/^[A-Za-z]{2}$/.test(String(v || '')) ? String(v).toUpperCase() : null);
  if (token) {
    await pool(list, 20, async (ip) => {
      try { const d = await getJson(`https://api.ipinfo.io/lite/${ip}?token=${encodeURIComponent(token)}`); const c = cc(d.country_code || d.country); if (c) out.set(ip, c); else errors++; } catch (e) { errors++; }
    }, () => deadline && Date.now() > deadline);
    return { map: out, errors };
  }
  for (let i = 0; i < list.length; i += 100) {
    if (deadline && Date.now() > deadline) break;
    const chunk = list.slice(i, i + 100);
    try {
      const d = await getJson('https://api.country.is', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(chunk) });
      (Array.isArray(d) ? d : []).forEach((r) => { const c = cc(r && r.country); if (c && r.ip) out.set(r.ip, c); });
    } catch (e) {
      errors++;
      await pool(chunk, 10, async (ip) => { try { const d = await getJson('https://api.country.is/' + ip); const c = cc(d && d.country); if (c) out.set(ip, c); } catch (x) { errors++; } }, () => deadline && Date.now() > deadline);
    }
  }
  return { map: out, errors };
}

// ---------------------------------------------------------------- database helpers
async function fetchAll(path, cap = 50000) {
  const out = [];
  for (let off = 0; off < cap; off += 1000) {
    const sep = path.includes('?') ? '&' : '?';
    const rows = await sb(`${path}${sep}limit=1000&offset=${off}`);
    out.push(...(rows || []));
    if (!rows || rows.length < 1000) break;
  }
  return out;
}
const chunks = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };
async function upsertProxies(rows) {
  for (const part of chunks(rows, 400)) await sb('/free_proxies?on_conflict=ip,port', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: part });
}
async function deleteProxies(ids) {
  for (const part of chunks(ids, 150)) await sb(`/free_proxies?id=in.(${part.join(',')})`, { method: 'DELETE', prefer: 'return=minimal' });
}
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---------------------------------------------------------------- the refresh job
async function refreshAll({ minGapSeconds = 1200, budgetMs = 46000, checkOpts = {}, limits = {} } = {}) {
  const L = Object.assign({}, LIMITS, limits);
  const claimed = await sb('/rpc/claim_proxy_refresh', { method: 'POST', body: { min_gap_seconds: minGapSeconds } });
  if (claimed !== true) return { ran: false, reason: 'A refresh ran recently.' };
  const t0 = Date.now(); const deadline = t0 + budgetMs; const nowIso = new Date().toISOString();
  invalidateCache();

  const allSources = await sb('/proxy_sources?select=*&order=id.asc');
  const known = new Set(allSources.map((s) => s.id));
  const active = allSources.filter((s) => s.enabled_site || s.enabled_app);
  const activeIds = new Set(active.map((s) => s.id));

  // 1) download every enabled list
  const fetched = await Promise.all(active.map(async (s) => {
    try {
      const text = await fetchText(s.url);
      const { entries } = parseList(text, s.protocol);
      if (!entries.length) return { s, ok: false, error: 'No valid ip:port entries were found in this list.' };
      return { s, ok: true, entries };
    } catch (e) { return { s, ok: false, error: String(e.message || e).slice(0, 250) }; }
  }));
  await Promise.all(fetched.map((f) => sb(`/proxy_sources?id=eq.${f.s.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { last_fetched_at: nowIso, last_status: f.ok ? 'ok' : 'error', last_error: f.ok ? null : f.error, last_found: f.ok ? f.entries.length : 0 } }).catch(() => null)));
  const okIds = new Set(fetched.filter((f) => f.ok).map((f) => f.s.id));

  const listed = new Map(); // "ip:port" -> { ip, port, protocol, ids:Set }
  for (const f of fetched) if (f.ok) for (const e of f.entries) {
    const k = e.ip + ':' + e.port; const hit = listed.get(k);
    if (hit) hit.ids.add(f.s.id); else listed.set(k, { ip: e.ip, port: e.port, protocol: e.protocol, ids: new Set([f.s.id]) });
  }

  // 2) work out which stored proxies stay, change sources or go
  const existing = await fetchAll('/free_proxies?select=id,ip,port,protocol,https,country,alive,checks,successes,fail_streak,source_ids,last_seen,last_checked,latency_ms');
  const exKeys = new Set(); const toDelete = []; const keep = [];
  for (const r of existing) {
    const k = r.ip + ':' + r.port; exKeys.add(k);
    const lb = listed.get(k);
    const ids = new Set((r.source_ids || []).filter((id) => known.has(id) && !okIds.has(id)));
    if (lb) lb.ids.forEach((id) => ids.add(id));
    if (!ids.size) { toDelete.push(r.id); continue; }
    const before = (r.source_ids || []).slice().sort((a, b) => a - b).join(',');
    const after = [...ids].sort((a, b) => a - b);
    keep.push({ row: r, ids: after, idsChanged: before !== after.join(','), seen: !!lb });
  }

  // 3) pick what to check: stored proxies first (alive, oldest check first), then a random sample of new ones
  const visible = keep.filter((x) => x.ids.some((id) => activeIds.has(id)) && (x.row.alive || x.row.fail_streak < L.failStreakDelete));
  visible.sort((a, b) => (b.row.alive - a.row.alive) || String(a.row.last_checked || '').localeCompare(String(b.row.last_checked || '')));
  const recheck = visible.slice(0, L.recheckMax);
  const fresh = shuffle([...listed.entries()].filter(([k]) => !exKeys.has(k)).map(([, v]) => v)).slice(0, Math.max(0, L.maxChecks - recheck.length));
  const jobs = [...recheck.map((x) => ({ kind: 'old', x, p: { ip: x.row.ip, port: x.row.port, protocol: x.row.protocol } })), ...fresh.map((v) => ({ kind: 'new', v, p: v }))];
  const results = await pool(jobs, L.concurrency, (j) => checkProxy(j.p, Object.assign({ timeout: L.checkTimeoutMs }, checkOpts)), () => Date.now() > deadline - L.checkTimeoutMs);

  // 4) country for new working proxies and for stored ones that still lack it
  const needGeo = [];
  jobs.forEach((j, i) => { const r = results[i]; if (r && r.ok && (j.kind === 'new' || !j.x.row.country)) needGeo.push(j.p.ip); });
  const geo = needGeo.length ? await lookupCountries(needGeo.slice(0, 500), deadline + 6000) : { map: new Map(), errors: 0 };

  // 5) write everything back
  const upAlive = [], upFail = [], upMeta = [], inserts = []; let newAlive = 0, checked = 0, nowDead = 0;
  const checkedKeys = new Set();
  jobs.forEach((j, i) => {
    const r = results[i]; if (!r) return; checked++;
    if (j.kind === 'new') {
      if (!r.ok) return;
      newAlive++;
      inserts.push({ ip: j.v.ip, port: j.v.port, protocol: j.v.protocol, https: !!r.https, country: geo.map.get(j.v.ip) || null, latency_ms: r.ms, alive: true, checks: 1, successes: 1, fail_streak: 0, source_ids: [...j.v.ids].sort((a, b) => a - b), first_seen: nowIso, last_seen: nowIso, last_checked: nowIso, last_alive_at: nowIso });
      return;
    }
    const { row, ids } = j.x; checkedKeys.add(row.id);
    const base = { ip: row.ip, port: row.port, protocol: row.protocol, source_ids: ids, last_checked: nowIso, checks: row.checks + 1 };
    if (r.ok) upAlive.push({ ...base, https: !!r.https, country: geo.map.get(row.ip) || row.country || null, latency_ms: r.ms, alive: true, successes: row.successes + 1, fail_streak: 0, last_alive_at: nowIso, last_seen: j.x.seen ? nowIso : row.last_seen });
    else if (row.fail_streak + 1 >= L.failStreakDelete) { toDelete.push(row.id); nowDead++; }
    else upFail.push({ ...base, alive: false, fail_streak: row.fail_streak + 1, last_seen: j.x.seen ? nowIso : row.last_seen });
  });
  for (const x of keep) {
    if (checkedKeys.has(x.row.id)) continue;
    const stale = x.seen && (!x.row.last_seen || Date.now() - new Date(x.row.last_seen).getTime() > 6 * 36e5);
    if (x.idsChanged || stale) upMeta.push({ ip: x.row.ip, port: x.row.port, protocol: x.row.protocol, source_ids: x.ids, last_seen: x.seen ? nowIso : x.row.last_seen });
  }
  await upsertProxies(upAlive); await upsertProxies(upFail); await upsertProxies(upMeta); await upsertProxies(inserts);
  await deleteProxies(toDelete);
  await sb(`/free_proxies?last_seen=lt.${encodeURIComponent(new Date(Date.now() - L.pruneHours * 36e5).toISOString())}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => null);

  const stats = { ran: true, finishedAt: new Date().toISOString(), durationMs: Date.now() - t0, sources: { ok: okIds.size, failed: fetched.length - okIds.size }, listed: listed.size, checked, newAlive, stillAlive: upAlive.length, dropped: toDelete.length, nowDead, geoErrors: geo.errors, geoFound: geo.map.size };
  await sb('/site_settings?on_conflict=key', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { key: 'proxy_refresh_stats', value: stats, updated_at: stats.finishedAt } }).catch(() => null);
  invalidateCache();
  return stats;
}

// ---------------------------------------------------------------- reading the list (website and app)
const cache = {};
function invalidateCache() { for (const k of Object.keys(cache)) delete cache[k]; }
async function loadVisible(target) {
  const hit = cache[target];
  if (hit && Date.now() - hit.t < 30000) return hit.data;
  const flag = target === 'app' ? 'enabled_app' : 'enabled_site';
  const sources = await sb(`/proxy_sources?select=id,name,url,protocol&${flag}=eq.true&order=id.asc`);
  let rows = [];
  if (sources.length) {
    rows = await fetchAll(`/free_proxies?select=ip,port,protocol,https,country,latency_ms,last_checked,checks,successes&alive=eq.true&source_ids=ov.{${sources.map((s) => s.id).join(',')}}&order=latency_ms.asc.nullslast`, 6000);
  }
  const meta = await sb('/site_settings?key=in.(proxy_refresh,proxy_refresh_stats)&select=key,value').catch(() => []);
  const started = (meta.find((m) => m.key === 'proxy_refresh') || {}).value;
  const stats = (meta.find((m) => m.key === 'proxy_refresh_stats') || {}).value;
  const data = { sources, rows, startedAt: started && started.startedAt || null, finishedAt: stats && stats.finishedAt || null };
  cache[target] = { t: Date.now(), data };
  return data;
}

const PROTO_FILTERS = new Set(['http', 'https', 'socks4', 'socks5']);
function filterRows(rows, q) {
  const proto = PROTO_FILTERS.has(q.protocol) ? q.protocol : '';
  const cc = /^[A-Za-z]{2}$/.test(q.country || '') ? q.country.toUpperCase() : '';
  const maxms = Number(q.maxms) > 0 ? Number(q.maxms) : 0;
  return rows.filter((r) => (!proto || (proto === 'https' ? r.https : r.protocol === proto)) && (!cc || r.country === cc) && (!maxms || (r.latency_ms !== null && r.latency_ms <= maxms)));
}
const publicRow = (r) => ({ ip: r.ip, port: r.port, protocol: r.protocol, https: !!r.https, country: r.country || null, ms: r.latency_ms, checked: r.last_checked, uptime: r.checks ? Math.round((r.successes / r.checks) * 100) : null });

async function listing(target, q) {
  const d = await loadVisible(target);
  const rows = filterRows(d.rows, q);
  const facets = { protocols: { http: 0, https: 0, socks4: 0, socks5: 0 }, countries: {} };
  for (const r of d.rows) {
    facets.protocols[r.protocol]++; if (r.https) facets.protocols.https++;
    if (r.country) facets.countries[r.country] = (facets.countries[r.country] || 0) + 1;
  }
  return { all: d, rows, facets: { protocols: facets.protocols, countries: Object.entries(facets.countries).sort((a, b) => b[1] - a[1]).map(([code, count]) => ({ code, count })) } };
}
const isStale = (d, maxAgeMs = 20 * 60000) => !d.startedAt || Date.now() - new Date(d.startedAt).getTime() > maxAgeMs;

// ---------------------------------------------------------------- source validation (admin)
function cleanSourceInput(b) {
  const name = String(b.name || '').trim().replace(/\s+/g, ' ');
  if (!name || name.length > 80) throw new HttpError(400, 'Give the source a short name (up to 80 characters).');
  const link = String(b.url || '').trim();
  if (link.length > 500) throw new HttpError(400, 'That link is too long.');
  try { assertSafeUrl(link); } catch (e) { throw new HttpError(400, e.message); }
  const protocol = PROTOCOL_CHOICES.includes(b.protocol) ? b.protocol : null;
  if (!protocol) throw new HttpError(400, 'Choose what kind of proxies the list contains.');
  return { name, url: link, protocol, enabled_site: b.enabledSite !== false, enabled_app: b.enabledApp !== false };
}

module.exports = { LIMITS, PROTOCOL_CHOICES, parseIPv4, isPublicIPv4, parseList, assertSafeUrl, fetchText, checkProxy, lookupCountries, refreshAll, loadVisible, listing, filterRows, publicRow, isStale, invalidateCache, cleanSourceInput, fetchAll, pool };
