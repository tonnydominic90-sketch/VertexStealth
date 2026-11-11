'use strict';
// Public: the checked free proxy list for the website (default) and the desktop app (?target=app).
//   GET /api/free-proxies                              JSON page of proxies + filter facets
//   GET /api/free-proxies?protocol=socks5&country=US   filters: protocol http|https|socks4|socks5, country, maxms
//   GET /api/free-proxies?format=txt|csv|json&download=1   plain exports (all matching proxies, up to 2000)
//   GET /api/free-proxies?view=sources&target=app      the source links enabled for that target
// Which proxies appear is decided by each source's two switches in Admin > Free proxies (website / app).
const { send } = require('./_lib/common');
const P = require('./_lib/proxies');

const csvCell = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'GET only' });
  try {
    const url = new URL(req.url || '/', 'http://x'); const q = Object.fromEntries(url.searchParams);
    const target = q.target === 'app' ? 'app' : 'site';
    const cacheHdr = { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' };

    if (q.view === 'sources') {
      const d = await P.loadVisible(target);
      return send(res, 200, { sources: d.sources.map((s) => ({ id: s.id, name: s.name, url: s.url, protocol: s.protocol })) }, cacheHdr);
    }

    const { all, rows, facets } = await P.listing(target, q);
    const cap = target === 'app' ? 2000 : 2000;
    const fmt = ['txt', 'csv', 'json'].includes(q.format) ? q.format : '';
    if (fmt) {
      const list = rows.slice(0, cap);
      const day = new Date().toISOString().slice(0, 10);
      const dl = q.download ? { 'Content-Disposition': `attachment; filename="vertexstealth-free-proxies-${day}.${fmt}"` } : {};
      if (fmt === 'json') return send(res, 200, list.map(P.publicRow), { ...cacheHdr, ...dl });
      const withProto = !['http', 'https', 'socks4', 'socks5'].includes(q.protocol);
      const body = fmt === 'txt'
        ? list.map((r) => (withProto ? `${r.protocol}://` : '') + `${r.ip}:${r.port}`).join('\n') + '\n'
        : 'ip,port,protocol,https,country,speed_ms,last_checked\n' + list.map((r) => [r.ip, r.port, r.protocol, r.https ? 'yes' : 'no', r.country || '', r.latency_ms, r.last_checked].map(csvCell).join(',')).join('\n') + '\n';
      res.statusCode = 200;
      res.setHeader('Content-Type', (fmt === 'txt' ? 'text/plain' : 'text/csv') + '; charset=utf-8');
      for (const [k, v] of Object.entries({ ...cacheHdr, ...dl })) res.setHeader(k, v);
      return res.end(body);
    }

    const maxPer = target === 'app' ? 2000 : 100;
    const per = Math.min(Math.max(Number(q.per) || (target === 'app' ? 500 : 50), 5), maxPer);
    const pages = Math.max(1, Math.ceil(rows.length / per));
    const page = Math.min(Math.max(Number(q.page) || 1, 1), pages);
    return send(res, 200, {
      updatedAt: all.finishedAt, stale: P.isStale(all), total: rows.length, available: all.rows.length, page, perPage: per, pages,
      rows: rows.slice((page - 1) * per, page * per).map(P.publicRow), facets, sources: all.sources.length,
    }, cacheHdr);
  } catch (e) {
    console.error('free-proxies error', e);
    return send(res, 500, { error: 'The proxy list is not available right now.' });
  }
};
