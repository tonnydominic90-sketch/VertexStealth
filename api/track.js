'use strict';
// Privacy-friendly analytics beacon. Stores country/region/city from Vercel's edge headers, never the IP address and no cookies.
const { sb, userFromToken, bearer, readBody, send } = require('./_lib/common');

const hits = new Map(); // tiny in-memory throttle per instance (the IP is only a transient key, never stored)
let windowStart = Date.now();
const EVENTS = new Set(['pageview', 'signin', 'app_launch']);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return send(res, 204);
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  try {
    const ua = String(req.headers['user-agent'] || '');
    if (/bot|crawl|spider|slurp|facebookexternalhit|headless|lighthouse|monitor/i.test(ua)) return send(res, 204);
    const key = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
    if (Date.now() - windowStart > 60000) { hits.clear(); windowStart = Date.now(); }
    const n = (hits.get(key) || 0) + 1; hits.set(key, n);
    if (n > 120) return send(res, 204);

    const b = await readBody(req);
    const dec = (v) => { try { return decodeURIComponent(String(v || '')); } catch (e) { return String(v || ''); } };
    const country = String(req.headers['x-vercel-ip-country'] || '').slice(0, 2).toUpperCase() || null;
    const region = dec(req.headers['x-vercel-ip-country-region']).slice(0, 40) || null;
    const city = dec(req.headers['x-vercel-ip-city']).slice(0, 60) || null;
    const w = Number(b.w) || 0;
    const device = /Electron|VertexStealth/i.test(ua) ? 'app' : (/mobile|android|iphone/i.test(ua) || (w && w < 700)) ? 'mobile' : (/ipad|tablet/i.test(ua) || (w && w < 1024)) ? 'tablet' : 'desktop';
    const event = EVENTS.has(b.event) ? b.event : 'pageview';
    const path = String(b.path || '/').slice(0, 200).split('?')[0];
    const ref = String(b.ref || '').slice(0, 100).replace(/^www\./, '');

    let user = null;
    if (bearer(req)) user = await userFromToken(bearer(req));

    await sb('/site_events', { method: 'POST', body: { event, path, referrer_host: ref || null, country, region, city, device, user_id: user ? user.id : null, app_version: b.version ? String(b.version).slice(0, 20) : null } });
    if (user && country) {
      await sb('/user_locations?on_conflict=user_id', { method: 'POST', prefer: 'resolution=merge-duplicates', body: { user_id: user.id, country, region, city, last_seen: new Date().toISOString() } });
    }
    return send(res, 204);
  } catch (e) {
    return send(res, 204); // analytics must never break a page
  }
};
