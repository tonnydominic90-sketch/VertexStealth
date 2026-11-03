'use strict';
/**
 * Referral-code helper for the Electron main process (drop into src/referral.js).
 *
 *  - savePendingReferral(code): call when the user signs up with a "Referral code" typed in.
 *  - claimPendingReferral(supabase): call after EVERY successful sign-in (cheap no-op when nothing is pending).
 *
 * The code is remembered on disk because sign-up usually needs an e-mail confirmation first, so the user only has a
 * session later. The database enforces everything that matters (new account window, self-referral, one partner per user).
 */
const fs = require('fs');
const path = require('path');

const CODE_RE = /^[A-Z0-9]{8}$/;
const normalize = (c) => String(c || '').trim().toUpperCase().replace(/[\s-]/g, '');

function filePath(dir) {
  return path.join(dir || require('electron').app.getPath('userData'), 'pending-referral.json');
}

function savePendingReferral(code, { dir, source = 'code' } = {}) {
  const c = normalize(code);
  if (!CODE_RE.test(c)) return { saved: false, reason: 'invalid_format' };
  try {
    fs.writeFileSync(filePath(dir), JSON.stringify({ code: c, source, savedAt: Date.now() }), { mode: 0o600 });
    return { saved: true, code: c };
  } catch (e) { return { saved: false, reason: 'write_failed' }; }
}

function readPending(dir) {
  try {
    const v = JSON.parse(fs.readFileSync(filePath(dir), 'utf8'));
    return v && CODE_RE.test(v.code) ? v : null;
  } catch (e) { return null; }
}
const clearPending = (dir) => { try { fs.unlinkSync(filePath(dir)); } catch (e) { /* nothing to remove */ } };

/** Terminal answers (the server decided) clear the pending code; network problems keep it for the next sign-in. */
async function claimPendingReferral(supabase, { dir } = {}) {
  const pending = readPending(dir);
  if (!pending) return { status: 'none' };
  if (Date.now() - pending.savedAt > 14 * 864e5) { clearPending(dir); return { status: 'expired' }; }
  let res;
  try {
    res = await supabase.rpc('claim_referral', { p_code: pending.code, p_source: pending.source === 'link' ? 'link' : 'code' });
  } catch (e) { return { status: 'network_error' }; }
  if (res.error) {
    const m = String(res.error.message || '');
    if (/not_authenticated|JWT|42501/i.test(m) || res.error.code === '42501') return { status: 'not_signed_in' };
    return { status: 'network_error' };
  }
  clearPending(dir);
  return { status: (res.data && res.data.status) || 'unknown' };
}

module.exports = { savePendingReferral, claimPendingReferral, normalize, CODE_RE };
