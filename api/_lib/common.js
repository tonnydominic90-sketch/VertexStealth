'use strict';
const crypto = require('crypto');
const MAP = require('./schema-map.json');

const env = (k, d = '') => (process.env[k] || d).trim();
const SB = () => env('SUPABASE_URL').replace(/\/$/, '');
const SERVICE = () => env('SUPABASE_SERVICE_ROLE_KEY');
const SITE = () => env('SITE_URL', 'https://www.vertexstealth.top').replace(/\/$/, '');

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(body === undefined ? '' : JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > 1e6) throw new HttpError(413, 'Body too large'); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch (e) { return {}; }
}

// PostgREST with the service role (bypasses RLS). Server-side only.
async function sb(path, { method = 'GET', body, prefer, headers = {} } = {}) {
  if (!SB() || !SERVICE()) throw new HttpError(500, 'Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  const h = { apikey: SERVICE(), Authorization: 'Bearer ' + SERVICE(), 'Content-Type': 'application/json', ...headers };
  if (prefer) h.Prefer = prefer;
  const res = await fetch(SB() + '/rest/v1' + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text(); let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!res.ok) { const m = (data && (data.message || data.hint || data.details)) || ('Database error ' + res.status); throw new HttpError(res.status === 404 ? 400 : 400, String(m)); }
  return data;
}

// GoTrue admin API (list/ban users)
async function gotrueAdmin(path, { method = 'GET', body } = {}) {
  const res = await fetch(SB() + '/auth/v1/admin' + path, { method, headers: { apikey: SERVICE(), Authorization: 'Bearer ' + SERVICE(), 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text(); let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (e) {}
  if (!res.ok) throw new HttpError(400, data.msg || data.message || ('Auth admin error ' + res.status));
  return data;
}

async function userFromToken(token) {
  if (!token) return null;
  const res = await fetch(SB() + '/auth/v1/user', { headers: { apikey: SERVICE(), Authorization: 'Bearer ' + token } });
  if (!res.ok) return null;
  const u = await res.json();
  return u && u.id ? u : null;
}
const bearer = (req) => { const h = req.headers.authorization || ''; return h.startsWith('Bearer ') ? h.slice(7) : ''; };

async function requireAdmin(req) {
  const user = await userFromToken(bearer(req));
  if (!user) throw new HttpError(401, 'Please sign in.');
  const rows = await sb(`/${MAP.profilesTable}?id=eq.${encodeURIComponent(user.id)}&select=${MAP.columns.admin}`);
  if (!rows || !rows[0] || rows[0][MAP.columns.admin] !== true) throw new HttpError(403, 'This account is not an administrator.');
  return user;
}

async function listAllAuthUsers(cap = 10000) {
  const out = [];
  for (let page = 1; out.length < cap; page++) {
    const d = await gotrueAdmin(`/users?page=${page}&per_page=1000`);
    const batch = d.users || [];
    out.push(...batch);
    if (batch.length < 1000) break;
  }
  return out;
}

const isBannedNow = (u) => !!(u.banned_until && new Date(u.banned_until).getTime() > Date.now());
const isPaid = (plan, expires) => {
  if (!plan || !new RegExp(MAP.paidPlanPattern, 'i').test(String(plan))) return false;
  return !expires || new Date(expires).getTime() > Date.now();
};

async function audit(admin, action, target, details) {
  try {
    await sb('/admin_audit_log', { method: 'POST', body: { admin_id: admin.id, admin_email: admin.email, action, target_id: target && target.id || null, target_email: target && target.email || null, details: details || null } });
  } catch (e) { /* never block an action because logging failed */ }
}

const b64u = (s) => Buffer.from(s, 'utf8').toString('base64url');
const fromB64u = (s) => Buffer.from(s, 'base64url').toString('utf8');
const unsubSecret = () => env('UNSUB_SECRET') || SERVICE();
const unsubToken = (email) => crypto.createHmac('sha256', unsubSecret()).update(email.toLowerCase()).digest('hex');
const unsubLink = (email) => `${SITE()}/api/unsub?e=${b64u(email.toLowerCase())}&t=${unsubToken(email)}`;

module.exports = { MAP, env, SB, SERVICE, SITE, HttpError, send, readBody, sb, gotrueAdmin, userFromToken, bearer, requireAdmin, listAllAuthUsers, isBannedNow, isPaid, audit, b64u, fromB64u, unsubToken, unsubLink };
