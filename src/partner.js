'use strict';
(function () {
  const root = document.getElementById('portal');
  if (!root) return;
  const FN = root.dataset.fn || '';
  const KEY = 'vs_partner_session';
  const $ = (id) => document.getElementById(id);
  const view = (name) => root.querySelectorAll('[data-view]').forEach((v) => { v.hidden = v.dataset.view !== name; });
  const money = (n) => '$' + Number(n || 0).toFixed(2);
  const date = (s) => (s ? new Date(s).toISOString().slice(0, 10) : '');
  const label = { signed_up: 'Signed up', upgraded: 'Upgraded', pending: 'Pending', approved: 'Approved', paid: 'Paid', cancelled: 'Cancelled', reversed: 'Reversed' };

  async function api(action, body, session) {
    const r = await fetch(FN + '/partner-portal', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, session ? { Authorization: 'Bearer ' + session } : {}),
      body: JSON.stringify(Object.assign({ action }, body || {})),
    });
    let data = null; try { data = await r.json(); } catch (e) { /* ignore */ }
    return { ok: r.ok, status: r.status, data };
  }
  const getSession = () => { try { return sessionStorage.getItem(KEY) || ''; } catch (e) { return ''; } };
  const setSession = (s) => { try { s ? sessionStorage.setItem(KEY, s) : sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ } };

  function fillRows(tbodyId, rows, cols, emptyText) {
    const tb = $(tbodyId); tb.textContent = '';
    if (!rows.length) { const tr = document.createElement('tr'), td = document.createElement('td'); td.colSpan = cols.length; td.textContent = emptyText; tr.appendChild(td); tb.appendChild(tr); return; }
    const statuses = new Set(Object.values(label));
    rows.forEach((row) => { const tr = document.createElement('tr'); cols.forEach((c) => { const td = document.createElement('td'); const t = c(row);
      if (statuses.has(t)) { const sp = document.createElement('span'); sp.className = 'pp-badge st-' + t.toLowerCase().replace(/[^a-z]/g, ''); sp.textContent = t; td.appendChild(sp); } else td.textContent = t;
      tr.appendChild(td); }); tb.appendChild(tr); });
  }

  function render(d) {
    const link = location.origin + '/r/' + d.partner.code;
    $('p-name').textContent = d.partner.name;
    $('p-link').value = link; $('p-code').textContent = d.partner.code;
    $('p-pct').textContent = Number(d.partner.commission_percent) + '%';
    $('s-clicks').textContent = d.stats.clicks_30d; $('s-signups').textContent = d.stats.signups; $('s-upgrades').textContent = d.stats.upgrades;
    $('b-pending').textContent = money(d.balances.pending); $('b-approved').textContent = money(d.balances.approved); $('b-paid').textContent = money(d.balances.paid);
    $('hold').textContent = d.settings.hold_days; $('minp').textContent = d.settings.min_payout;
    const owed = Number(d.balances.owed_back || 0); $('b-owed').hidden = owed <= 0; $('b-owed').textContent = owed > 0 ? 'A refunded commission of ' + money(owed) + ' will be deducted from your next payout.' : '';
    fillRows('t-referrals', d.referrals, [(r) => date(r.created_at), (r) => r.ref, (r) => (r.source === 'link' ? 'Link' : 'Code'), (r) => label[r.status] || r.status], 'No referrals yet. Share your link to get started.');
    fillRows('t-commissions', d.commissions, [(r) => date(r.created_at), (r) => money(r.amount_paid), (r) => money(r.commission_amount), (r) => label[r.status] || r.status, (r) => (r.status === 'pending' ? 'Approved after ' + date(r.eligible_at) : '')], 'No commissions yet.');
    fillRows('t-payouts', d.payouts, [(r) => date(r.created_at), (r) => money(r.amount), (r) => r.method || '', (r) => r.reference || ''], 'No payouts yet.');
    if (d.partner.payout_method) $('f-method').value = d.partner.payout_method;
    $('f-details').value = d.partner.payout_details || '';
    view('dash');
  }

  async function load() {
    const s = getSession(); if (!s) return view('login');
    view('loading');
    const r = await api('summary', null, s);
    if (r.status === 401) { setSession(''); return view('login'); }
    if (!r.ok) { view('error'); return; }
    render(r.data);
  }

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const st = $('login-status'); st.className = 'pp-status'; st.textContent = 'Sending…';
    const r = await api('request_login', { email: $('f-email').value.trim() });
    if (r.ok) view('sent'); else { st.className = 'pp-status err'; st.textContent = 'Something went wrong. Please try again.'; }
  });
  $('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('p-link').value); $('copy').textContent = 'Copied'; setTimeout(() => { $('copy').textContent = 'Copy link'; }, 1500); }
    catch (e) { $('p-link').select(); }
  });
  $('payout-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const st = $('payout-status'); st.className = 'pp-status'; st.textContent = 'Saving…';
    const r = await api('save_payout', { method: $('f-method').value, details: $('f-details').value }, getSession());
    if (r.ok) { st.className = 'pp-status ok'; st.textContent = 'Payout details saved.'; }
    else { st.className = 'pp-status err'; st.textContent = (r.data && r.data.message) || 'Could not save. Please check the details.'; }
  });
  $('logout').addEventListener('click', async () => { await api('logout', null, getSession()); setSession(''); view('login'); });

  // arriving from the emailed sign-in link: location.hash = "#token=..."
  // (also handled when the hash changes in a tab that already has the portal open)
  function handleHash() {
    const m = location.hash.match(/^#token=([A-Za-z0-9_-]{20,100})$/);
    if (!m) return false;
    history.replaceState(null, '', location.pathname); // keep the one-time token out of history and referrers
    view('loading');
    api('exchange', { token: m[1] }).then((r) => {
      if (r.ok && r.data && r.data.session) { setSession(r.data.session); load(); } else view('badlink');
    });
    return true;
  }
  window.addEventListener('hashchange', handleHash);
  if (!handleHash()) load();
})();
