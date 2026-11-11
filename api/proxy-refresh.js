'use strict';
// Re-downloads the enabled source lists and re-checks the proxies. Three ways to trigger it:
//   * Vercel Cron (daily, see vercel.json): GET with the CRON_SECRET (if set) or Vercel's cron user agent
//   * the website: when the list is older than 20 minutes the page asks for a refresh (POST). The database lock
//     inside refreshAll() guarantees at most one refresh per gap, however many visitors ask.
//   * Admin > Free proxies > Refresh now (goes through /api/admin)
const { send, env } = require('./_lib/common');
const P = require('./_lib/proxies');

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const secret = env('CRON_SECRET');
      const auth = String(req.headers.authorization || '');
      const fromCron = secret ? auth === 'Bearer ' + secret : /^vercel-cron\//.test(String(req.headers['user-agent'] || ''));
      if (!fromCron) return send(res, 401, { error: 'Not allowed.' });
      return send(res, 200, await P.refreshAll({ minGapSeconds: 600 }));
    }
    if (req.method === 'POST') return send(res, 200, await P.refreshAll({ minGapSeconds: 1200 }));
    return send(res, 405, { error: 'GET or POST only' });
  } catch (e) {
    console.error('proxy-refresh error', e);
    return send(res, 500, { error: 'Refresh failed. Check the Vercel function logs.' });
  }
};
