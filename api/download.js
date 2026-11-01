'use strict';
// Public: returns the installer link the admin chose (Admin > Releases). The site falls back to its built-in link if this is empty.
const { sb, send } = require('./_lib/common');
module.exports = async (req, res) => {
  try {
    const rows = await sb('/site_settings?key=eq.download&select=value,updated_at');
    const v = rows && rows[0] && rows[0].value;
    if (v && v.url) return send(res, 200, { url: v.url, version: v.version || null, updatedAt: rows[0].updated_at }, { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' });
  } catch (e) { /* fall through */ }
  return send(res, 200, { url: null }, { 'Cache-Control': 'public, s-maxage=30' });
};
