'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const r = require('./referral.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vsref-'));
let n = 0; const ok = (name, fn) => { fn(); n++; };
const mk = (impl) => ({ rpc: async (name, args) => impl(name, args) });
(async () => {
  assert.deepStrictEqual(r.savePendingReferral('bad', { dir }), { saved: false, reason: 'invalid_format' }); n++;
  assert.strictEqual(r.savePendingReferral(' ab12-cd34 ', { dir }).code, 'AB12CD34'); n++;
  let calls = [];
  let res = await r.claimPendingReferral(mk((name, a) => { calls.push([name, a]); return { data: { status: 'ok' }, error: null }; }), { dir });
  assert.strictEqual(res.status, 'ok'); assert.deepStrictEqual(calls[0], ['claim_referral', { p_code: 'AB12CD34', p_source: 'code' }]); n += 2;
  assert.strictEqual((await r.claimPendingReferral(mk(() => { throw new Error('should not call'); }), { dir })).status, 'none'); n++;   // cleared after a definitive answer
  r.savePendingReferral('ZZZZ2222', { dir });
  assert.strictEqual((await r.claimPendingReferral(mk(() => { throw new Error('offline'); }), { dir })).status, 'network_error'); n++;
  assert.ok(fs.existsSync(path.join(dir, 'pending-referral.json'))); n++;                                                             // kept for retry
  assert.strictEqual((await r.claimPendingReferral(mk(() => ({ data: null, error: { message: 'not_authenticated', code: '42501' } })), { dir })).status, 'not_signed_in'); n++;
  assert.ok(fs.existsSync(path.join(dir, 'pending-referral.json'))); n++;
  assert.strictEqual((await r.claimPendingReferral(mk(() => ({ data: { status: 'too_late' }, error: null })), { dir })).status, 'too_late'); n++;
  assert.ok(!fs.existsSync(path.join(dir, 'pending-referral.json'))); n++;                                                            // too_late is final
  fs.writeFileSync(path.join(dir, 'pending-referral.json'), JSON.stringify({ code: 'AB12CD34', source: 'link', savedAt: Date.now() - 15 * 864e5 }));
  assert.strictEqual((await r.claimPendingReferral(mk(() => ({ data: { status: 'ok' }, error: null })), { dir })).status, 'expired'); n++;
  fs.writeFileSync(path.join(dir, 'pending-referral.json'), 'not json'); assert.strictEqual((await r.claimPendingReferral(mk(() => ({})), { dir })).status, 'none'); n++;
  console.log(`${n} checks OK`);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
