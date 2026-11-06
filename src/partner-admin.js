'use strict';
(function () {
  const root = document.getElementById('padmin');
  if (!root) return;
  const SB = (root.dataset.sb || '').replace(/\/+$/, ''), ANON = root.dataset.anon || '', FN = root.dataset.fn || '';
  const KEY = 'vs_padmin_token';
  const $ = (id) => document.getElementById(id);
  const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const date = (s) => (s ? new Date(s).toISOString().slice(0, 10) : '');
  const sum = (rows, f) => rows.reduce((t, r) => t + Number(f(r) || 0), 0);
  let token = ''; try { token = sessionStorage.getItem(KEY) || ''; } catch (e) { /* ignore */ }
  let tab = 'applications';

  const TITLES = {
    applications: ['Applications', 'Review people who applied to join the partner program.'],
    partners: ['Partners', 'Approved partners, their performance and balances.'],
    commissions: ['Commissions', 'Every commission earned by your partners.'],
    payouts: ['Payouts', 'A record of payouts you have sent.'],
  };

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (k === 'class') el.className = v; else if (k === 'onclick') el.addEventListener('click', v); else el.setAttribute(k, v); }
    kids.flat().forEach((c) => { if (c !== null && c !== undefined && c !== false) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  const badge = (status) => h('span', { class: 'pp-badge st-' + String(status).toLowerCase().replace(/[^a-z]/g, '') }, String(status).charAt(0).toUpperCase() + String(status).slice(1));

  async function rpc(fn, args) {
    const r = await fetch(SB + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + token }, body: JSON.stringify(args || {}) });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { /* ignore */ }
    if (!r.ok) { const err = new Error((j && (j.message || j.error)) || t || 'Request failed'); err.status = r.status; throw err; }
    return j;
  }

  // ---- toast + modal (replace the browser's alert/confirm/prompt) ----
  let toastTimer = 0;
  function msg(text, bad) {
    const old = document.querySelector('.pa-toast'); if (old) old.remove();
    if (!text) return;
    const t = h('div', { class: 'pa-toast' + (bad ? ' err' : ''), role: 'status' }, text); document.body.appendChild(t);
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 6500);
  }
  /** ask({title, text, confirm, danger, input:{label,value,placeholder,type}}) -> null (cancelled) or {value} */
  function ask(o) {
    return new Promise((resolve) => {
      let field = null;
      const done = (v) => { bg.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
      const ok = h('button', { class: 'pa-btn ' + (o.danger ? 'dng' : 'pri'), type: 'button', onclick: () => done({ value: field ? field.value : '' }) }, o.confirm || 'Confirm');
      const no = h('button', { class: 'pa-btn', type: 'button', onclick: () => done(null) }, 'Cancel');
      if (o.input) field = h('input', { type: o.input.type || 'text', value: o.input.value || '', placeholder: o.input.placeholder || '', id: 'pa-ask-in' });
      const box = h('div', { class: 'pa-modal', role: 'dialog', 'aria-modal': 'true' },
        h('h3', {}, o.title), o.text ? h('p', {}, o.text) : null,
        o.input ? h('label', { for: 'pa-ask-in' }, o.input.label || '') : null, field,
        h('div', { class: 'pa-modal-btns' }, no, ok));
      const bg = h('div', { class: 'pa-modal-bg' }, box);
      bg.addEventListener('mousedown', (e) => { if (e.target === bg) done(null); });
      const onKey = (e) => { if (e.key === 'Escape') done(null); else if (e.key === 'Enter' && field) done({ value: field.value }); };
      document.addEventListener('keydown', onKey);
      document.body.appendChild(bg); (field || ok).focus();
    });
  }

  const fail = (e) => {
    if (e.status === 401 || /JWT/i.test(e.message)) { signOut(); $('login-status').className = 'pp-status err'; $('login-status').textContent = 'Session expired. Please sign in again.'; }
    else if (/forbidden/.test(e.message)) msg('This account is not an admin.', true);
    else msg(e.message, true);
  };
  function signOut() { token = ''; try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ } $('app').hidden = true; $('login').hidden = false; }

  async function review(a, action) {
    const r = await ask(action === 'decline'
      ? { title: 'Decline ' + a.name + '?', text: 'They will get an email. You can add a short reason that is included in it.', confirm: 'Decline application', danger: true, input: { label: 'Reason (optional)', placeholder: 'e.g. We could not verify your channel' } }
      : { title: 'Approve ' + a.name + '?', text: 'This creates their partner account and emails them their personal link and code.', confirm: 'Approve and email' });
    if (!r) return;
    try {
      const res = await fetch(FN + '/partner-admin-review', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ id: a.id, action, reason: r.value || '' }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(j.error || 'Failed'), { status: res.status });
      msg((action === 'approve' ? 'Approved. Code ' + j.code : 'Declined.') + (j.emailed ? ' Email sent.' : ' Email was NOT sent, check the email settings.'), !j.emailed);
      load(); refreshBadge();
    } catch (e) { fail(e); }
  }

  const table = (head, rows, numCols) => h('div', { class: 'pp-scroll' }, h('table', { class: 'pp-table' },
    h('thead', {}, h('tr', {}, head.map((x, i) => h('th', numCols && numCols.includes(i) ? { class: 'pa-num' } : {}, x)))), h('tbody', {}, rows)));
  const td = (txt, cls) => h('td', cls ? { class: cls } : {}, txt);
  const empty = (t, s) => h('div', { class: 'pa-empty' }, h('b', {}, t), s);
  const stats = (items) => { const box = $('pa-stats'); box.textContent = ''; items.forEach(([l, v]) => box.appendChild(h('div', { class: 'pa-stat' }, h('span', {}, l), h('b', {}, String(v))))); };
  const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('');

  async function load() {
    const box = $('content'); box.textContent = ''; box.appendChild(h('div', { class: 'pa-loading' }, 'Loading…')); $('pa-stats').textContent = '';
    try {
      if (tab === 'applications') {
        const rows = await rpc('admin_partner_applications', { p_status: $('filter').value || null });
        box.textContent = '';
        stats([['Shown', rows.length], ['Pending', rows.filter((a) => a.status === 'pending').length], ['Approved', rows.filter((a) => a.status === 'approved').length], ['Declined', rows.filter((a) => a.status === 'declined').length]]);
        if (!rows.length) return box.appendChild(empty('Nothing here', 'No applications match this filter.'));
        const list = h('div', { class: 'pa-apps' }); box.appendChild(list);
        rows.forEach((a) => list.appendChild(h('article', { class: 'pa-app' },
          h('div', { class: 'pa-avatar' }, initials(a.name)),
          h('div', {},
            h('h3', {}, a.name, badge(a.status)),
            h('div', { class: 'pa-meta' }, h('span', {}, a.email), h('span', {}, a.country), h('span', {}, 'Applied ' + date(a.created_at)),
              a.channel_url ? (/^https?:\/\//i.test(a.channel_url) ? h('a', { href: a.channel_url, target: '_blank', rel: 'noopener noreferrer nofollow' }, a.channel_url) : h('span', {}, a.channel_url)) : null),
            h('p', { class: 'pa-quote' }, a.promotion_plan),
            a.decline_reason ? h('p', { class: 'pa-reason' }, 'Decline reason: ' + a.decline_reason) : null),
          a.status === 'pending' ? h('div', { class: 'pa-actions' }, h('button', { class: 'pa-btn pri', type: 'button', onclick: () => review(a, 'approve') }, 'Approve'), h('button', { class: 'pa-btn dng', type: 'button', onclick: () => review(a, 'decline') }, 'Decline')) : null)));
      } else if (tab === 'partners') {
        const rows = await rpc('admin_list_partners');
        box.textContent = '';
        stats([['Partners', rows.length], ['Active', rows.filter((p) => p.status === 'active').length], ['Pending commissions', money(sum(rows, (p) => p.pending))], ['Approved, payable', money(sum(rows, (p) => p.approved))], ['Paid out', money(sum(rows, (p) => p.paid))]]);
        if (!rows.length) return box.appendChild(empty('No partners yet', 'Approve an application and the partner will show up here.'));
        const num = (n) => Number(n || 0).toLocaleString('en-US');
        box.appendChild(table(['Partner', 'Code', 'Status', 'Activity', 'Pending', 'Approved', 'Paid', ''], rows.map((p) => h('tr', {},
          h('td', {}, h('div', { class: 'pa-cell' }, h('b', {}, p.name), h('small', {}, p.email), h('small', {}, 'Payout: ' + (p.payout_method ? p.payout_method + ', ' + p.payout_details : 'not set')))),
          h('td', {}, h('span', { class: 'pa-code' }, p.code)),
          h('td', {}, h('div', { class: 'pa-cell' }, badge(p.status), h('small', {}, Number(p.commission_percent) + '% rate'))),
          h('td', {}, h('div', { class: 'pa-cell' }, h('b', {}, num(p.clicks) + ' clicks'), h('small', {}, num(p.signups) + ' sign-ups, ' + num(p.upgrades) + ' upgrades'))),
          td(money(p.pending), 'pa-num'),
          h('td', { class: 'pa-num' }, h('div', { class: 'pa-cell' }, h('b', {}, money(p.approved)), Number(p.owed_back) > 0 ? h('small', { class: 'pa-owed' }, money(p.owed_back) + ' owed back') : null)),
          td(money(p.paid), 'pa-num'),
          h('td', { class: 'pa-actions' },
            h('button', { class: 'pa-btn sm pri', type: 'button', onclick: () => payout(p) }, 'Record payout'),
            h('button', { class: 'pa-btn sm', type: 'button', onclick: () => setPercent(p) }, 'Set %'),
            h('button', { class: 'pa-btn sm', type: 'button', onclick: () => setPartner(p, p.status === 'active' ? 'suspended' : 'active') }, p.status === 'active' ? 'Suspend' : 'Activate')))), [4, 5, 6]));
      } else if (tab === 'commissions') {
        const rows = await rpc('admin_partner_commissions', { p_status: $('filter').value || null });
        box.textContent = '';
        stats([['Commissions', rows.length], ['Total commission', money(sum(rows, (c) => c.commission_amount))], ['Revenue behind them', money(sum(rows, (c) => c.amount_paid))]]);
        if (!rows.length) return box.appendChild(empty('No commissions', 'Nothing matches this filter yet.'));
        box.appendChild(table(['Date', 'Partner', 'Referral', 'Provider', 'Paid', 'Rate', 'Commission', 'Status', 'Eligible', ''], rows.map((c) => h('tr', {},
          td(date(c.created_at)), h('td', {}, h('div', { class: 'pa-cell' }, h('b', {}, c.partner_name), h('small', {}, c.partner_code))), td(c.referral_ref), td(c.provider),
          td(money(c.amount_paid), 'pa-num'), td(Number(c.commission_percent) + '%', 'pa-num'), td(money(c.commission_amount), 'pa-num'),
          h('td', {}, badge(c.status), c.cancel_reason ? h('small', {}, ' ' + c.cancel_reason) : null), td(date(c.eligible_at)),
          h('td', {}, ['cancelled', 'reversed'].includes(c.status) ? null : h('button', { class: 'pa-btn sm dng', type: 'button', onclick: () => cancelCommission(c) }, c.status === 'paid' ? 'Reverse' : 'Cancel')))), [4, 5, 6]));
      } else {
        const rows = await rpc('admin_list_partner_payouts');
        box.textContent = '';
        stats([['Payouts', rows.length], ['Total sent', money(sum(rows, (o) => o.amount))], ['Deducted (refunds)', money(sum(rows, (o) => o.deductions))]]);
        if (!rows.length) return box.appendChild(empty('No payouts yet', 'Recorded payouts will appear here.'));
        box.appendChild(table(['Date', 'Partner', 'Amount', 'Deducted', 'Method', 'Details', 'Reference'], rows.map((o) => h('tr', {},
          td(date(o.created_at)), td(o.partner_name), td(money(o.amount), 'pa-num'), td(money(o.deductions), 'pa-num'), td(o.method || ''), td(o.details || ''), td(o.reference || ''))), [2, 3]));
      }
    } catch (e) { box.textContent = ''; fail(e); }
  }

  async function setPartner(p, status) {
    const ok = await ask({ title: (status === 'suspended' ? 'Suspend ' : 'Activate ') + p.name + '?', text: status === 'suspended' ? 'Their link stops earning commission until you activate them again.' : 'Their link will start earning commission again.', confirm: status === 'suspended' ? 'Suspend' : 'Activate', danger: status === 'suspended' });
    if (!ok) return;
    try { await rpc('admin_set_partner', { p_id: p.id, p_status: status }); load(); } catch (e) { fail(e); }
  }
  async function setPercent(p) {
    const r = await ask({ title: 'Commission rate for ' + p.name, text: 'Applies to NEW referrals only.', confirm: 'Save rate', input: { label: 'Commission %', value: String(Number(p.commission_percent)), type: 'number' } });
    if (!r) return;
    const n = Number(r.value); if (!(n >= 0 && n <= 100)) return msg('Enter a number from 0 to 100.', true);
    try { await rpc('admin_set_partner', { p_id: p.id, p_percent: n }); load(); } catch (e) { fail(e); }
  }
  async function cancelCommission(c) {
    const paid = c.status === 'paid';
    const r = await ask({ title: paid ? 'Reverse this paid commission?' : 'Cancel this commission?', text: paid ? 'It will be deducted from the partner\'s next payout.' : 'The partner will no longer be owed this commission.', confirm: paid ? 'Reverse' : 'Cancel commission', danger: true, input: { label: 'Reason', value: 'refund' } });
    if (!r) return;
    try { await rpc('admin_cancel_commission', { p_id: c.id, p_reason: r.value }); load(); } catch (e) { fail(e); }
  }
  async function payout(p) {
    const approved = Number(p.approved), owed = Number(p.owed_back), net = approved - owed;
    if (net <= 0) return msg('Nothing to pay ' + p.name + ' right now (approved ' + money(approved) + ', owed back ' + money(owed) + ').', true);
    if (!p.payout_method) { const go = await ask({ title: 'No payout details saved', text: p.name + ' has not saved payout details yet. Record the payout anyway?', confirm: 'Continue' }); if (!go) return; }
    const r = await ask({ title: 'Record payout of ' + money(net), text: 'Pay ' + p.name + ' (' + (p.payout_method ? p.payout_method + ': ' + p.payout_details : 'no details') + ').\nSend the money first, then enter your payment reference to record it.', confirm: 'Record payout', input: { label: 'Payment reference', placeholder: 'Transaction ID or note' } });
    if (!r) return;
    const send = async (force) => { const x = await rpc('admin_record_partner_payout', { p_partner: p.id, p_reference: r.value, p_force: force }); msg('Recorded payout of ' + money(x.amount) + '.'); load(); };
    try { await send(false); }
    catch (e) {
      if (/below_minimum/.test(e.message)) { const go = await ask({ title: 'Below the minimum payout', text: 'The balance is under the minimum payout. Record it anyway?', confirm: 'Record anyway' }); if (go) { try { await send(true); } catch (e2) { fail(e2); } } }
      else fail(e);
    }
  }

  async function refreshBadge() {
    try { const rows = await rpc('admin_partner_applications', { p_status: 'pending' }); const c = $('pending-count'); c.textContent = String(rows.length); c.hidden = !rows.length; } catch (e) { /* ignore */ }
  }
  function setTab(t) {
    tab = t; document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    $('pa-title').textContent = TITLES[t][0]; $('pa-sub').textContent = TITLES[t][1];
    const f = $('filter'); f.hidden = !(t === 'applications' || t === 'commissions'); f.textContent = '';
    const opts = t === 'applications' ? [['pending', 'Pending'], ['approved', 'Approved'], ['declined', 'Declined'], ['', 'All']] : [['', 'All statuses'], ['pending', 'Pending'], ['approved', 'Approved'], ['paid', 'Paid'], ['cancelled', 'Cancelled'], ['reversed', 'Reversed']];
    opts.forEach(([v, l]) => f.appendChild(h('option', { value: v }, l)));
    msg(''); load();
  }
  function enter() { $('login').hidden = true; $('app').hidden = false; setTab('applications'); refreshBadge(); }
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
      $('a-pass').value = ''; st.textContent = ''; enter();
    } catch (err) { token = ''; st.className = 'pp-status err'; st.textContent = /forbidden/.test(err.message) ? 'This account is not an admin.' : err.message; }
  });
  if (token) { rpc('admin_list_partners').then(enter).catch(() => signOut()); }
})();
