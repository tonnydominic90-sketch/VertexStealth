'use strict';
(function () {
  const root = document.getElementById('padmin');
  if (!root) return;
  const SB = (root.dataset.sb || '').replace(/\/+$/, ''), ANON = root.dataset.anon || '', FN = root.dataset.fn || '';
  const KEY = 'vs_padmin_token';
  const $ = (id) => document.getElementById(id);
  const money = (n) => '$' + Number(n || 0).toFixed(2);
  const date = (s) => (s ? new Date(s).toISOString().slice(0, 10) : '');
  let token = ''; try { token = sessionStorage.getItem(KEY) || ''; } catch (e) { /* ignore */ }
  let tab = 'applications';

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (k === 'class') el.className = v; else if (k === 'onclick') el.addEventListener('click', v); else el.setAttribute(k, v); }
    kids.flat().forEach((c) => { if (c !== null && c !== undefined) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  async function rpc(fn, args) {
    const r = await fetch(SB + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + token }, body: JSON.stringify(args || {}) });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { /* ignore */ }
    if (!r.ok) { const err = new Error((j && (j.message || j.error)) || t || 'Request failed'); err.status = r.status; throw err; }
    return j;
  }
  const msg = (t, bad) => { const s = $('msg'); s.className = 'pp-status ' + (bad ? 'err' : 'ok'); s.textContent = t; };
  const fail = (e) => { if (e.status === 401 || /JWT/i.test(e.message)) { signOut(); msg('Session expired. Please sign in again.', true); } else if (/forbidden/.test(e.message)) msg('This account is not an admin.', true); else msg(e.message, true); };

  function signOut() { token = ''; try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ } $('app').hidden = true; $('login').hidden = false; }

  async function review(id, action) {
    let reason = '';
    if (action === 'decline') { reason = window.prompt('Reason to include in the email (optional):', '') ; if (reason === null) return; }
    else if (!window.confirm('Approve this application and email the partner their link?')) return;
    try {
      const r = await fetch(FN + '/partner-admin-review', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ id, action, reason }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(j.error || 'Failed'), { status: r.status });
      msg((action === 'approve' ? 'Approved. Code ' + j.code : 'Declined.') + (j.emailed ? ' Email sent.' : ' Email was NOT sent - check the email settings.'), !j.emailed);
      load();
    } catch (e) { fail(e); }
  }

  const table = (head, rows) => h('div', { class: 'pp-scroll' }, h('table', { class: 'pp-table' }, h('thead', {}, h('tr', {}, head.map((x) => h('th', {}, x)))), h('tbody', {}, rows)));

  async function load() {
    const box = $('content'); box.textContent = 'Loading…';
    try {
      if (tab === 'applications') {
        const st = $('filter').value || null;
        const rows = await rpc('admin_partner_applications', { p_status: st });
        box.textContent = '';
        if (!rows.length) return box.appendChild(h('p', {}, 'Nothing here.'));
        rows.forEach((a) => box.appendChild(h('div', { class: 'pp-card pa-app' },
          h('h3', {}, a.name + ' · ' + a.country), h('p', {}, a.email + ' · applied ' + date(a.created_at) + ' · ' + a.status),
          a.channel_url ? h('p', {}, 'Channel: ' + a.channel_url) : null, h('p', {}, a.promotion_plan),
          a.decline_reason ? h('p', {}, 'Decline reason: ' + a.decline_reason) : null,
          a.status === 'pending' ? h('div', { class: 'pa-actions' }, h('button', { class: 'btn primary', onclick: () => review(a.id, 'approve') }, 'Approve'), h('button', { class: 'btn outline', onclick: () => review(a.id, 'decline') }, 'Decline')) : null)));
      } else if (tab === 'partners') {
        const rows = await rpc('admin_list_partners');
        box.textContent = '';
        box.appendChild(table(['Partner', 'Code', 'Status', '%', 'Clicks', 'Signups', 'Upgrades', 'Pending', 'Approved', 'Paid', 'Owed back', 'Payout to', ''], rows.map((p) => h('tr', {},
          h('td', {}, p.name + ' (' + p.email + ')'), h('td', {}, p.code), h('td', {}, p.status), h('td', {}, String(Number(p.commission_percent))), h('td', {}, String(p.clicks)), h('td', {}, String(p.signups)), h('td', {}, String(p.upgrades)),
          h('td', {}, money(p.pending)), h('td', {}, money(p.approved)), h('td', {}, money(p.paid)), h('td', {}, money(p.owed_back)), h('td', {}, p.payout_method ? p.payout_method + ': ' + p.payout_details : 'not set'),
          h('td', { class: 'pa-actions' },
            h('button', { class: 'btn outline', onclick: () => setPartner(p, p.status === 'active' ? 'suspended' : 'active') }, p.status === 'active' ? 'Suspend' : 'Activate'),
            h('button', { class: 'btn outline', onclick: () => setPercent(p) }, 'Set %'),
            h('button', { class: 'btn primary', onclick: () => payout(p) }, 'Record payout'))))));
      } else if (tab === 'commissions') {
        const rows = await rpc('admin_partner_commissions', { p_status: $('filter').value || null });
        box.textContent = '';
        box.appendChild(table(['Date', 'Partner', 'Referral', 'Provider', 'Paid', '%', 'Commission', 'Status', 'Eligible', ''], rows.map((c) => h('tr', {},
          h('td', {}, date(c.created_at)), h('td', {}, c.partner_name + ' (' + c.partner_code + ')'), h('td', {}, c.referral_ref), h('td', {}, c.provider), h('td', {}, money(c.amount_paid)),
          h('td', {}, String(Number(c.commission_percent))), h('td', {}, money(c.commission_amount)), h('td', {}, c.status + (c.cancel_reason ? ' (' + c.cancel_reason + ')' : '')), h('td', {}, date(c.eligible_at)),
          h('td', {}, ['cancelled', 'reversed'].includes(c.status) ? null : h('button', { class: 'btn outline', onclick: () => cancelCommission(c) }, c.status === 'paid' ? 'Reverse' : 'Cancel'))))));
      } else {
        const rows = await rpc('admin_list_partner_payouts');
        box.textContent = '';
        box.appendChild(table(['Date', 'Partner', 'Amount', 'Deducted', 'Method', 'Details', 'Reference'], rows.map((o) => h('tr', {}, h('td', {}, date(o.created_at)), h('td', {}, o.partner_name), h('td', {}, money(o.amount)), h('td', {}, money(o.deductions)), h('td', {}, o.method || ''), h('td', {}, o.details || ''), h('td', {}, o.reference || '')))));
      }
    } catch (e) { box.textContent = ''; fail(e); }
  }
  async function setPartner(p, status) { if (!window.confirm((status === 'suspended' ? 'Suspend ' : 'Activate ') + p.name + '?')) return; try { await rpc('admin_set_partner', { p_id: p.id, p_status: status }); load(); } catch (e) { fail(e); } }
  async function setPercent(p) { const v = window.prompt('Commission % for ' + p.name + ' (applies to NEW referrals):', String(Number(p.commission_percent))); if (v === null) return; const n = Number(v); if (!(n >= 0 && n <= 100)) return msg('Enter a number from 0 to 100.', true); try { await rpc('admin_set_partner', { p_id: p.id, p_percent: n }); load(); } catch (e) { fail(e); } }
  async function cancelCommission(c) { const why = window.prompt((c.status === 'paid' ? 'Reverse this PAID commission (it will be deducted from the next payout). ' : 'Cancel this commission. ') + 'Reason:', 'refund'); if (why === null) return; try { await rpc('admin_cancel_commission', { p_id: c.id, p_reason: why }); load(); } catch (e) { fail(e); } }
  async function payout(p) {
    const approved = Number(p.approved), owed = Number(p.owed_back), net = approved - owed;
    if (net <= 0) return msg('Nothing to pay ' + p.name + ' right now (approved ' + money(approved) + ', owed back ' + money(owed) + ').', true);
    if (!p.payout_method) { if (!window.confirm(p.name + ' has not saved payout details yet. Record the payout anyway?')) return; }
    const ref = window.prompt('Pay ' + money(net) + ' to ' + p.name + ' (' + (p.payout_method ? p.payout_method + ': ' + p.payout_details : 'no details') + ').\nSend the money first, then enter your payment reference to record it:', '');
    if (ref === null) return;
    try { const r = await rpc('admin_record_partner_payout', { p_partner: p.id, p_reference: ref, p_force: false }); msg('Recorded payout of ' + money(r.amount) + '.'); load(); }
    catch (e) { if (/below_minimum/.test(e.message) && window.confirm('Balance is below the minimum payout. Record it anyway?')) { try { const r = await rpc('admin_record_partner_payout', { p_partner: p.id, p_reference: ref, p_force: true }); msg('Recorded payout of ' + money(r.amount) + '.'); load(); } catch (e2) { fail(e2); } } else fail(e); }
  }

  function setTab(t) {
    tab = t; document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('primary', b.dataset.tab === t));
    const f = $('filter'); f.hidden = !(t === 'applications' || t === 'commissions'); f.textContent = '';
    const opts = t === 'applications' ? [['pending', 'Pending'], ['approved', 'Approved'], ['declined', 'Declined'], ['', 'All']] : [['', 'All'], ['pending', 'Pending'], ['approved', 'Approved'], ['paid', 'Paid'], ['cancelled', 'Cancelled'], ['reversed', 'Reversed']];
    opts.forEach(([v, l]) => f.appendChild(h('option', { value: v }, l)));
    $('msg').textContent = ''; load();
  }
  document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $('filter').addEventListener('change', load);
  $('signout').addEventListener('click', signOut);
  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const st = $('login-status'); st.className = 'pp-status'; st.textContent = 'Signing in…';
    try {
      const r = await fetch(SB + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON }, body: JSON.stringify({ email: $('a-email').value.trim(), password: $('a-pass').value }) });
      const j = await r.json();
      if (!r.ok || !j.access_token) throw new Error(j.error_description || j.msg || 'Sign-in failed');
      token = j.access_token; try { sessionStorage.setItem(KEY, token); } catch (e2) { /* ignore */ }
      await rpc('admin_list_partners'); // proves the account is an admin
      $('a-pass').value = ''; st.textContent = ''; $('login').hidden = true; $('app').hidden = false; setTab('applications');
    } catch (err) { token = ''; st.className = 'pp-status err'; st.textContent = /forbidden/.test(err.message) ? 'This account is not an admin.' : err.message; }
  });
  if (token) { rpc('admin_list_partners').then(() => { $('login').hidden = true; $('app').hidden = false; setTab('applications'); }).catch(() => signOut()); }
})();
