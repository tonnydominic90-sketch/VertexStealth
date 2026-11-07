'use strict';
const C = require('./_lib/common');
const { TEMPLATES, renderBody, layout, fill } = require('./_lib/templates');
const { sendBatch } = require('./_lib/mailer');
const { MAP, HttpError, sb, gotrueAdmin, listAllAuthUsers, isBannedNow, isPaid, audit, env, SITE } = C;
const col = MAP.columns;
const FOREVER = '876000h';
const releasePrefix = () => `https://github.com/${MAP.releasesRepo}/releases/download/`;
const PLAN_VALUES = Object.assign({ free: 'free', monthly: 'monthly', yearly: 'yearly' }, MAP.planValues || {});

async function fetchAll(path, cap = 20000) {
  const out = [];
  for (let off = 0; off < cap; off += 1000) {
    const sep = path.includes('?') ? '&' : '?';
    const rows = await sb(`${path}${sep}limit=1000&offset=${off}`);
    out.push(...(rows || []));
    if (!rows || rows.length < 1000) break;
  }
  return out;
}
const byId = (rows, key = 'id') => Object.fromEntries((rows || []).map((r) => [r[key], r]));
const prettyName = (u) => {
  const m = u.user_metadata || {}; const n = m.full_name || m.name;
  if (n) return String(n).split(' ')[0];
  const local = String(u.email || '').split('@')[0].replace(/[._-]+/g, ' ').replace(/\d+/g, '').trim().split(' ')[0] || 'there';
  return local.charAt(0).toUpperCase() + local.slice(1);
};

async function loadUsers() {
  const [auth, profiles, locs] = await Promise.all([
    listAllAuthUsers(),
    fetchAll(`/${MAP.profilesTable}?select=*`),
    fetchAll('/user_locations?select=*').catch(() => []),
  ]);
  const P = byId(profiles), L = byId(locs, 'user_id');
  const trialMs = (MAP.trialDays || 3) * 864e5;
  return auth.map((u) => {
    const p = P[u.id] || {}; const l = L[u.id] || {};
    const plan = p[col.plan] || null; const expires = p[col.planExpires] || null;
    const paid = isPaid(plan, expires);
    const suspended = isBannedNow(u);
    const banned = p[col.banned] === true;
    const trialActive = !paid && Date.now() - new Date(u.created_at).getTime() < trialMs;
    const status = banned ? 'banned' : suspended ? 'suspended' : paid ? 'paid' : trialActive ? 'trial' : 'expired';
    return { id: u.id, email: u.email || '', name: prettyName(u), createdAt: u.created_at, lastSignIn: u.last_sign_in_at || null, confirmed: !!u.email_confirmed_at, suspendedUntil: suspended ? u.banned_until : null, banned, isAdmin: p[col.admin] === true, plan, planExpires: expires, status, country: l.country || null, city: l.city || null, hasProfile: !!P[u.id] };
  });
}

const day = (d) => new Date(d).toISOString().slice(0, 10);
function lastDays(n) { const out = []; for (let i = n - 1; i >= 0; i--) out.push(day(Date.now() - i * 864e5)); return out; }
const top = (map, n = 10) => Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ key: k, count: v }));
const bump = (o, k) => { if (k) o[k] = (o[k] || 0) + 1; };

const ACTIONS = {
  async me(_b, admin) { return { email: admin.email, id: admin.id }; },

  async overview() {
    const users = await loadUsers();
    const now = Date.now();
    const d30 = lastDays(30), d14 = lastDays(14);
    const signups = Object.fromEntries(d30.map((d) => [d, 0]));
    users.forEach((u) => { const d = day(u.createdAt); if (d in signups) signups[d]++; });
    const since = new Date(now - 30 * 864e5).toISOString();
    let events = [];
    try { events = await fetchAll(`/site_events?select=created_at,event,path,country,referrer_host,device,user_id&created_at=gte.${since}&order=created_at.desc`, 50000); } catch (e) { /* table may not exist yet */ }
    const visits = Object.fromEntries(d14.map((d) => [d, 0]));
    const pages = {}, countries = {}, refs = {}, devices = {}; let appLaunches = 0;
    events.forEach((e) => {
      if (e.event === 'app_launch') { appLaunches++; return; }
      if (e.event !== 'pageview') return;
      const d = day(e.created_at); if (d in visits) visits[d]++;
      bump(pages, e.path); bump(countries, e.country); bump(refs, e.referrer_host || '(direct)'); bump(devices, e.device);
    });
    const userCountries = {}; users.forEach((u) => bump(userCountries, u.country));
    const statusCount = {}; users.forEach((u) => bump(statusCount, u.status));
    return {
      totals: { users: users.length, new7: users.filter((u) => now - new Date(u.createdAt) < 7 * 864e5).length, new30: users.filter((u) => now - new Date(u.createdAt) < 30 * 864e5).length, active7: users.filter((u) => u.lastSignIn && now - new Date(u.lastSignIn) < 7 * 864e5).length, paid: statusCount.paid || 0, trial: statusCount.trial || 0, expired: statusCount.expired || 0, suspended: statusCount.suspended || 0, banned: statusCount.banned || 0, admins: users.filter((u) => u.isAdmin).length, unconfirmed: users.filter((u) => !u.confirmed).length, pageviews30: events.filter((e) => e.event === 'pageview').length, appLaunches30: appLaunches },
      signups: d30.map((d) => ({ day: d, count: signups[d] })),
      visits: d14.map((d) => ({ day: d, count: visits[d] })),
      topPages: top(pages), topCountries: top(countries, 15), topReferrers: top(refs), devices: top(devices), userCountries: top(userCountries, 15),
      trackedUsers: users.filter((u) => u.country).length,
    };
  },

  async users(b) {
    let rows = await loadUsers();
    const q = String(b.q || '').toLowerCase().trim();
    if (q) rows = rows.filter((u) => u.email.toLowerCase().includes(q) || u.id.startsWith(q));
    const f = b.filter || 'all';
    if (f === 'admin') rows = rows.filter((u) => u.isAdmin);
    else if (f !== 'all') rows = rows.filter((u) => u.status === f);
    if (b.country) rows = rows.filter((u) => u.country === b.country);
    rows.sort((a, c) => new Date(c.createdAt) - new Date(a.createdAt));
    const per = Math.min(Math.max(Number(b.perPage) || 25, 5), 100); const page = Math.max(Number(b.page) || 1, 1);
    return { total: rows.length, page, perPage: per, rows: rows.slice((page - 1) * per, page * per) };
  },

  async setSuspend(b, admin) {
    const t = await target(b.id, admin, { allowAdmin: false });
    if (b.suspend) {
      const days = Number(b.days) || 0;
      const duration = days > 0 ? `${Math.min(days, 3650) * 24}h` : FOREVER;
      await gotrueAdmin(`/users/${t.id}`, { method: 'PUT', body: { ban_duration: duration } });
      await audit(admin, 'suspend', t, { days: days || 'indefinite', reason: String(b.reason || '').slice(0, 300) });
    } else {
      await gotrueAdmin(`/users/${t.id}`, { method: 'PUT', body: { ban_duration: 'none' } });
      await audit(admin, 'unsuspend', t, null);
    }
    return { ok: true };
  },

  async setBan(b, admin) {
    const t = await target(b.id, admin, { allowAdmin: false });
    const warnings = [];
    if (b.ban) {
      await gotrueAdmin(`/users/${t.id}`, { method: 'PUT', body: { ban_duration: FOREVER } });
      await patchProfile(t.id, { [col.banned]: true, ...(col.banReason ? { [col.banReason]: String(b.reason || '').slice(0, 300) || null } : {}) }, warnings, 'app-level ban flag');
      await banDevices(t.id, true, warnings);
      await audit(admin, 'ban', t, { reason: String(b.reason || '').slice(0, 300), warnings });
    } else {
      await gotrueAdmin(`/users/${t.id}`, { method: 'PUT', body: { ban_duration: 'none' } });
      await patchProfile(t.id, { [col.banned]: false }, warnings, 'app-level ban flag');
      await banDevices(t.id, false, warnings);
      await audit(admin, 'unban', t, { warnings });
    }
    return { ok: true, warnings };
  },

  async setAdmin(b, admin) {
    if (b.id === admin.id) throw new HttpError(400, 'You cannot change your own admin status.');
    const t = await target(b.id, admin, { allowAdmin: true });
    const warnings = [];
    const n = await patchProfile(t.id, { [col.admin]: !!b.admin }, warnings, 'admin flag', true);
    if (!n) throw new HttpError(400, 'No profile row exists for this user yet (they must sign in to the app once).');
    await audit(admin, b.admin ? 'promote_admin' : 'demote_admin', t, null);
    return { ok: true };
  },

  async setPlan(b, admin) {
    const t = await target(b.id, admin, { allowAdmin: true });
    const rows = await sb(`/${MAP.profilesTable}?id=eq.${t.id}&select=${col.plan},${col.planExpires}`);
    if (!rows || !rows[0]) throw new HttpError(400, 'No profile row exists for this user yet (they must sign in to the app once).');
    const kind = String(b.plan);
    if (!['free', 'monthly', 'yearly', 'custom'].includes(kind)) throw new HttpError(400, 'Unknown plan.');
    let plan, expires;
    if (kind === 'free') { plan = PLAN_VALUES.free; expires = null; }
    else {
      const days = kind === 'monthly' ? Number(b.days) || 30 : kind === 'yearly' ? Number(b.days) || 365 : Number(b.days);
      if (!days || days < 1 || days > 3650) throw new HttpError(400, 'Enter a number of days between 1 and 3650.');
      plan = kind === 'custom' ? PLAN_VALUES.monthly : PLAN_VALUES[kind];
      const cur = rows[0][col.planExpires] ? new Date(rows[0][col.planExpires]).getTime() : 0;
      expires = new Date(Math.max(Date.now(), cur) + days * 864e5).toISOString();
    }
    const out = await sb(`/${MAP.profilesTable}?id=eq.${t.id}`, { method: 'PATCH', prefer: 'return=representation', body: { [col.plan]: plan, [col.planExpires]: expires } });
    if (!out || !out.length) throw new HttpError(400, 'Nothing was updated.');
    await audit(admin, 'set_plan', t, { plan, expires, note: String(b.note || '').slice(0, 200) });
    return { ok: true, plan, expires };
  },

  async getDownload() {
    const rows = await sb('/site_settings?key=eq.download&select=value,updated_at,updated_by').catch(() => []);
    const v = rows && rows[0] ? rows[0].value : null;
    return { current: v ? { url: v.url, version: v.version, updatedAt: rows[0].updated_at } : null, repo: MAP.releasesRepo, prefix: releasePrefix() };
  },

  async latestRelease() {
    const r = await fetch(`https://api.github.com/repos/${MAP.releasesRepo}/releases/latest`, { headers: { 'User-Agent': 'vertexstealth-admin', Accept: 'application/vnd.github+json' } });
    if (r.status === 404) throw new HttpError(404, 'No published release found yet in ' + MAP.releasesRepo + '. Publish one on GitHub first (drafts do not count).');
    if (!r.ok) throw new HttpError(502, 'GitHub did not answer (HTTP ' + r.status + '). Paste the link by hand instead.');
    const d = await r.json();
    const asset = (d.assets || []).find((a) => /\.exe$/i.test(a.name) && !/blockmap/i.test(a.name));
    if (!asset) throw new HttpError(404, `Release ${d.tag_name} has no .exe file attached.`);
    return { version: String(d.tag_name || '').replace(/^v/i, ''), url: asset.browser_download_url, name: asset.name, size: asset.size, publishedAt: d.published_at };
  },

  async setDownload(b, admin) {
    const url = String(b.url || '').trim(); const version = String(b.version || '').trim();
    if (!url.startsWith(releasePrefix()) || !/\.exe$/i.test(url) || /\s/.test(url) || url.length > 300) throw new HttpError(400, 'The link must be a .exe file in your releases repo: ' + releasePrefix() + '…');
    if (!/^[0-9A-Za-z.+-]{1,30}$/.test(version)) throw new HttpError(400, 'Enter a version like 0.2.2.');
    let ok = false, code = 0;
    try { const h = await fetch(url, { method: 'HEAD', redirect: 'follow' }); ok = h.ok; code = h.status; } catch (e) { code = 0; }
    if (!ok) throw new HttpError(400, `GitHub could not find that file (HTTP ${code || 'no answer'}). Check the version and file name.`);
    await sb('/site_settings?on_conflict=key', { method: 'POST', prefer: 'resolution=merge-duplicates', body: { key: 'download', value: { url, version }, updated_at: new Date().toISOString(), updated_by: admin.id } });
    await audit(admin, 'set_download', null, { url, version });
    return { ok: true, url, version };
  },

  async templates() { return { templates: TEMPLATES }; },

  async audienceCount(b) { const r = await resolveRecipients(b.audience, b.category || 'service'); return { count: r.length, sample: r.slice(0, 5).map((x) => x.email) }; },

  async emailSend(b, admin) {
    const subject = String(b.subject || '').trim(); const body = String(b.body || '').trim();
    const category = b.category === 'marketing' ? 'marketing' : 'service';
    if (!subject || subject.length > 150) throw new HttpError(400, 'Add a subject (up to 150 characters).');
    if (!body || body.length > 20000) throw new HttpError(400, 'Add a message body.');
    if (/\[[^\]\n]+\](?!\()/.test(subject + '\n' + body) && !b.allowPlaceholders) throw new HttpError(400, 'The message still contains [bracketed placeholder text]. Replace it before sending.');
    const mk = (r) => buildEmail(r, subject, body, category);
    if (b.test) {
      const me = { id: admin.id, email: admin.email, name: prettyName(admin), plan: '', status: 'test' };
      const m = mk(me); m.subject = '[TEST] ' + m.subject;
      const out = await sendBatch([m]);
      if (out.failed) throw new HttpError(502, 'Test email failed: ' + (out.errors[0] || 'unknown error'));
      return { ok: true, test: true, to: admin.email };
    }
    const recipients = await resolveRecipients(b.audience, category);
    if (!recipients.length) throw new HttpError(400, 'No recipients match this audience.');
    if (recipients.length > 2000) throw new HttpError(400, 'More than 2,000 recipients. Narrow the audience and send in parts.');
    if (Number(b.confirmCount) !== recipients.length) throw new HttpError(400, `Recipient count changed (${recipients.length}). Review and confirm again.`);
    const out = await sendBatch(recipients.map(mk));
    const status = out.failed === 0 ? 'sent' : out.sent === 0 ? 'failed' : 'partial';
    await sb('/email_campaigns', { method: 'POST', body: { sent_by: admin.id, sent_by_email: admin.email, template_id: b.templateId || null, category, subject, audience: b.audience || null, recipients: recipients.length, sent: out.sent, failed: out.failed, status } }).catch(() => {});
    await audit(admin, 'email_campaign', null, { subject, category, recipients: recipients.length, sent: out.sent, failed: out.failed });
    return { ok: out.sent > 0, status, sent: out.sent, failed: out.failed, errors: out.errors };
  },

  async campaigns() { return { rows: await sb('/email_campaigns?select=*&order=created_at.desc&limit=50').catch(() => []) }; },
  async auditLog() { return { rows: await sb('/admin_audit_log?select=*&order=created_at.desc&limit=100').catch(() => []) }; },

  async setupCheck() {
    const checks = [];
    const add = (group, name, ok, detail) => checks.push({ group, name, ok, detail: detail || '' });
    for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'BREVO_API_KEY', 'EMAIL_FROM']) add('Environment variables', k, !!env(k), env(k) ? 'set' : 'missing in Vercel > Settings > Environment Variables');
    add('Environment variables', 'SITE_URL', !!env('SITE_URL'), env('SITE_URL') ? 'set' : 'not set, defaulting to https://www.vertexstealth.top');
    const probe = async (table, c) => { try { await sb(`/${table}?select=${c}&limit=1`); return true; } catch (e) { return String(e.message); } };
    for (const t of ['site_events', 'user_locations', 'admin_audit_log', 'email_campaigns', 'email_optouts', 'site_settings']) { const r = await probe(t, '*'); add('Tables from supabase/site-admin.sql', t, r === true, r === true ? 'found' : 'missing: run supabase/site-admin.sql in the Supabase SQL Editor'); }
    for (const [k, c] of Object.entries(col)) { const r = await probe(MAP.profilesTable, c); add(`Existing table "${MAP.profilesTable}" columns`, `${k} -> ${c}`, r === true, r === true ? 'found' : 'not found: edit api/_lib/schema-map.json to match your schema'); }
    if (MAP.devices) { const r = await probe(MAP.devices.table, `${MAP.devices.userColumn},${MAP.devices.bannedColumn}`); add('Existing devices table', `${MAP.devices.table}.${MAP.devices.userColumn}/${MAP.devices.bannedColumn}`, r === true, r === true ? 'found' : 'not found: banning will skip devices until this matches your schema'); }
    if (env('BREVO_API_KEY')) {
      const H = { 'api-key': env('BREVO_API_KEY'), accept: 'application/json' };
      try {
        const r = await fetch('https://api.brevo.com/v3/account', { headers: H });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) add('Email sending (Brevo)', 'API key', false, 'Brevo rejected the key: ' + (d.message || r.status) + '. Create a new v3 API key in Brevo > SMTP & API.');
        else {
          add('Email sending (Brevo)', 'API key', true, 'valid' + (d.companyName ? ' (' + d.companyName + ')' : ''));
          const plan = (d.plan || []).find((p) => /free|standard|business|enterprise|premium/i.test(p.type || '')) || (d.plan || [])[0];
          if (plan) add('Email sending (Brevo)', 'plan and credits', true, `${plan.type || 'plan'}: ${plan.credits ?? '?'} credits left` + (/free/i.test(plan.type || '') ? ' (the free plan allows about 300 emails per day)' : ''));
          const fromAddr = (require('./_lib/mailer').parseAddress(env('EMAIL_FROM')).email || '').toLowerCase();
          const sr = await fetch('https://api.brevo.com/v3/senders', { headers: H });
          const sd = await sr.json().catch(() => ({}));
          if (sr.ok) {
            const hit = (sd.senders || []).find((x) => String(x.email).toLowerCase() === fromAddr);
            add('Email sending (Brevo)', `sender ${fromAddr || '(EMAIL_FROM not set)'}`, !!hit && hit.active !== false, hit ? (hit.active === false ? 'found but not active: finish its verification in Brevo' : 'verified sender') : 'not in Brevo > Senders, domains & dedicated IPs. Add and verify it, or change EMAIL_FROM.');
          } else add('Email sending (Brevo)', 'senders list', true, 'could not list senders with this key (that is fine)');
        }
      } catch (e) { add('Email sending (Brevo)', 'API reachable', false, String(e.message)); }
    }
    return { checks };
  },
};

async function target(id, admin, { allowAdmin }) {
  if (!id) throw new HttpError(400, 'Missing user.');
  if (id === admin.id) throw new HttpError(400, 'You cannot do this to your own account.');
  const u = await gotrueAdmin(`/users/${encodeURIComponent(id)}`).catch(() => null);
  if (!u || !u.id) throw new HttpError(404, 'User not found.');
  if (!allowAdmin) {
    const p = await sb(`/${MAP.profilesTable}?id=eq.${u.id}&select=${col.admin}`).catch(() => []);
    if (p && p[0] && p[0][col.admin] === true) throw new HttpError(400, 'This user is an administrator. Remove their admin role first.');
  }
  return { id: u.id, email: u.email };
}

async function patchProfile(id, body, warnings, label, strict) {
  try {
    const out = await sb(`/${MAP.profilesTable}?id=eq.${id}`, { method: 'PATCH', prefer: 'return=representation', body });
    return out ? out.length : 0;
  } catch (e) {
    if (strict) throw e;
    warnings.push(`Could not update ${label}: ${e.message}`); return 0;
  }
}

async function banDevices(userId, banned, warnings) {
  if (!MAP.devices) return;
  try { await sb(`/${MAP.devices.table}?${MAP.devices.userColumn}=eq.${userId}`, { method: 'PATCH', body: { [MAP.devices.bannedColumn]: banned } }); }
  catch (e) { warnings.push('Could not update device bans: ' + e.message); }
}

async function resolveRecipients(a, category) {
  a = a || { type: 'all' };
  let users = await loadUsers();
  users = users.filter((u) => u.email && u.confirmed && !u.banned && !u.suspendedUntil);
  if (a.type === 'selected') { const ids = new Set(Array.isArray(a.ids) ? a.ids : []); users = users.filter((u) => ids.has(u.id)); }
  else if (a.type === 'segment') {
    const s = a.segment || {};
    if (s.status && s.status !== 'any') users = users.filter((u) => u.status === s.status);
    if (s.country) users = users.filter((u) => u.country === s.country);
    if (s.activeWithinDays) users = users.filter((u) => u.lastSignIn && Date.now() - new Date(u.lastSignIn) < Number(s.activeWithinDays) * 864e5);
    if (s.inactiveDays) users = users.filter((u) => !u.lastSignIn || Date.now() - new Date(u.lastSignIn) > Number(s.inactiveDays) * 864e5);
  }
  if (category === 'marketing') {
    const opt = await fetchAll('/email_optouts?select=email').catch(() => []);
    const out = new Set(opt.map((o) => String(o.email).toLowerCase()));
    users = users.filter((u) => !out.has(u.email.toLowerCase()));
  }
  return users;
}

function buildEmail(r, subjectT, bodyT, category) {
  const vars = { name: r.name || 'there', email: r.email, plan: r.plan || 'trial', download_url: env('DOWNLOAD_URL') || `${SITE()}/download`, site_url: SITE(), support_email: 'support@vertexstealth.top' };
  const subject = fill(subjectT, vars);
  const { html, plain } = renderBody(bodyT, vars);
  const unsub = C.unsubLink(r.email);
  const doc = layout({ subject, bodyHtml: html, category, unsubscribeUrl: unsub, supportEmail: vars.support_email, siteUrl: SITE() });
  const text = plain + '\n\n— VertexStealth' + (category === 'marketing' ? `\nUnsubscribe from product news: ${unsub}` : '');
  const headers = category === 'marketing' ? { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined;
  return { to: r.email, subject, html: doc, text, headers };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return C.send(res, 405, { error: 'POST only' });
  try {
    const admin = await C.requireAdmin(req);
    const body = await C.readBody(req);
    const fn = ACTIONS[body.action];
    if (!fn) throw new HttpError(400, 'Unknown action.');
    return C.send(res, 200, await fn(body, admin));
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (!(e instanceof HttpError)) console.error('admin api error', e);
    return C.send(res, status, { error: e instanceof HttpError ? e.message : 'Server error. Check the Vercel function logs.' });
  }
};
module.exports._test = { buildEmail, resolveRecipients, ACTIONS };
