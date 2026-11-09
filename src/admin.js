'use strict';
(function () {
  var root = document.getElementById('adminRoot');
  var VS = window.VS;
  var state = { tab: 'overview', users: [], tpl: null, tplList: [], audience: { type: 'all' } };

  // ---- tiny DOM helper (no innerHTML with data -> no XSS) ----
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k]; if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v; else if (k === 'checked') el.checked = !!v; else el.setAttribute(k, v === true ? '' : v);
    });
    (function add(list) { list.forEach(function (c) { if (c === null || c === undefined || c === false) return; if (Array.isArray(c)) return add(c); el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); }); })(Array.prototype.slice.call(arguments, 2));
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function toast(msg, err) { var t = h('div', { class: 'adm-toast' + (err ? ' err' : ''), text: msg }); document.body.appendChild(t); setTimeout(function () { t.remove(); }, err ? 6000 : 3000); }
  function flag(cc) { if (!cc || cc.length !== 2) return ''; return String.fromCodePoint.apply(null, cc.toUpperCase().split('').map(function (c) { return 127397 + c.charCodeAt(0); })); }
  var dn = null; try { dn = new Intl.DisplayNames(['en'], { type: 'region' }); } catch (e) {}
  function country(cc) { if (!cc) return '-'; var n = ''; try { n = dn ? dn.of(cc) : ''; } catch (e) {} return flag(cc) + ' ' + (n || cc); }
  function fdate(d) { return d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '-'; }

  async function api(action, body) {
    var s = await VS.session(); if (!s) { location.replace('/login?next=/admin'); throw new Error('Signed out'); }
    var r = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.access_token }, body: JSON.stringify(Object.assign({ action: action }, body || {})) });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) { var e = new Error(d.error || ('Request failed (' + r.status + ')')); e.status = r.status; throw e; }
    return d;
  }
  async function safe(fn) { try { return await fn(); } catch (e) { toast(e.message, true); return null; } }

  // ---- modal ----
  function modal(title, text, fields, okLabel, danger) {
    return new Promise(function (resolve) {
      var inputs = {}; var body = h('div');
      fields.forEach(function (f) {
        var inp = f.type === 'select' ? h('select', null, f.options.map(function (o) { return h('option', { value: o[0], text: o[1] }); })) : h('input', { type: f.type || 'text', value: f.value || '', placeholder: f.placeholder || '' });
        if (f.type === 'select') inp.value = f.value || f.options[0][0];
        inputs[f.name] = inp; body.appendChild(h('label', { class: 'f', text: f.label })); body.appendChild(inp); body.appendChild(h('p', { text: ' ' }));
      });
      var bg = h('div', { class: 'adm-modal-bg' });
      function done(v) { bg.remove(); resolve(v); }
      bg.appendChild(h('div', { class: 'adm-modal' }, h('h3', { text: title }), h('p', { text: text }), body,
        h('div', { class: 'adm-btns' }, h('button', { class: 'adm-btn', text: 'Cancel', onclick: function () { done(null); } }), h('button', { class: 'adm-btn ' + (danger ? 'dng' : 'pri'), text: okLabel || 'Confirm', onclick: function () { var v = {}; Object.keys(inputs).forEach(function (k) { v[k] = inputs[k].value; }); done(v); } }))));
      document.body.appendChild(bg);
      var first = bg.querySelector('input,select'); if (first) first.focus();
    });
  }

  // ---- charts (SVG via DOM attributes; CSP-safe) ----
  var NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs) { var e = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); return e; }
  function bars(data, color) {
    var W = 560, H = 160, pad = 22, max = Math.max.apply(null, data.map(function (d) { return d.count; }).concat([1]));
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + (H + 22), role: 'img' });
    var bw = (W - pad) / data.length;
    data.forEach(function (d, i) {
      var bh = Math.round((d.count / max) * (H - 16)); var x = pad + i * bw + 2;
      var r = svg('rect', { x: x, y: H - bh, width: Math.max(bw - 4, 2), height: Math.max(bh, d.count ? 2 : 0), rx: 2, fill: color || '#169ee8' }); var t = svg('title'); t.textContent = d.day + ': ' + d.count; r.appendChild(t); s.appendChild(r);
    });
    var lab = function (x, txt, anchor) { var t = svg('text', { x: x, y: H + 16, 'font-size': 10, fill: '#6b798b', 'text-anchor': anchor }); t.textContent = txt; s.appendChild(t); };
    lab(pad, data[0].day.slice(5), 'start'); lab(W, data[data.length - 1].day.slice(5), 'end');
    var m = svg('text', { x: 0, y: 12, 'font-size': 10, fill: '#6b798b' }); m.textContent = String(max); s.appendChild(m);
    return s;
  }
  function list(items, fmt) {
    var max = Math.max.apply(null, items.map(function (i) { return i.count; }).concat([1]));
    if (!items.length) return h('p', { text: 'No data yet.', class: 'adm-sub' });
    return h('div', { class: 'adm-list' }, items.map(function (i) { var b = h('i'); b.style.width = Math.round(i.count / max * 100) + '%'; return h('div', { class: 'adm-row' }, h('span', { class: 'nm', text: fmt ? fmt(i.key) : i.key }), h('span', { class: 'ct', text: i.count }), h('div', { class: 'bar' }, b)); }));
  }

  // ---- layout ----
  var TABS = [['overview', 'Overview'], ['users', 'Users'], ['locations', 'Locations'], ['email', 'Communication'], ['releases', 'Releases'], ['activity', 'Activity log'], ['setup', 'Setup check']];
  var main;
  function shell(me) {
    clear(root);
    var side = h('aside', { class: 'adm-side' }, h('div', { class: 'adm-brand' }, 'Vertex', h('span', { text: 'Stealth' }), ' Admin'));
    TABS.forEach(function (t) { side.appendChild(h('button', { class: 'adm-nav' + (state.tab === t[0] ? ' on' : ''), text: t[1], onclick: function () { state.tab = t[0]; shell(me); render(); } })); });
    side.appendChild(h('a', { class: 'adm-nav', href: '/partner-admin', text: 'Partner program ↗' }));
    side.appendChild(h('div', { class: 'adm-me', text: me.email })); side.appendChild(h('a', { href: '/', text: '← Back to website' }));
    side.appendChild(h('button', { class: 'adm-nav', text: 'Sign out', onclick: async function () { await VS.signOut(); location.replace('/login'); } }));
    main = h('main', { class: 'adm-main' });
    root.appendChild(h('div', { class: 'adm' }, side, main));
  }
  function head(t, s) { clear(main); main.appendChild(h('h1', { text: t })); main.appendChild(h('p', { class: 'adm-sub', text: s || '' })); }
  function render() { ({ overview: vOverview, users: vUsers, locations: vLocations, email: vEmail, releases: vReleases, activity: vActivity, setup: vSetup })[state.tab](); }

  // ---- Overview ----
  async function vOverview() {
    head('Overview', 'Accounts, plans and website traffic (last 30 days).'); main.appendChild(h('p', { class: 'adm-sub', text: 'Loading…' }));
    var d = await safe(function () { return api('overview'); }); if (!d) return; head('Overview', 'Accounts, plans and website traffic (last 30 days).');
    var t = d.totals;
    var cards = [['Total users', t.users], ['New (7 days)', t.new7], ['New (30 days)', t.new30], ['Active (7 days)', t.active7], ['Paid', t.paid], ['In trial', t.trial], ['Expired', t.expired], ['Suspended', t.suspended], ['Banned', t.banned], ['Admins', t.admins], ['Page views (30d)', t.pageviews30], ['App launches (30d)', t.appLaunches30]];
    main.appendChild(h('div', { class: 'adm-cards' }, cards.map(function (c) { return h('div', { class: 'adm-card' }, h('b', { text: c[1] }), h('span', { text: c[0] })); })));
    main.appendChild(h('div', { class: 'adm-grid' },
      h('div', { class: 'adm-box' }, h('h2', { text: 'New accounts per day (30 days)' }), bars(d.signups, '#169ee8')),
      h('div', { class: 'adm-box' }, h('h2', { text: 'Website page views per day (14 days)' }), bars(d.visits, '#13886d'))));
    main.appendChild(h('div', { class: 'adm-grid' },
      h('div', { class: 'adm-box' }, h('h2', { text: 'Top pages' }), list(d.topPages)),
      h('div', { class: 'adm-box' }, h('h2', { text: 'Top referrers' }), list(d.topReferrers)),
      h('div', { class: 'adm-box' }, h('h2', { text: 'Devices' }), list(d.devices))));
    main.appendChild(h('p', { class: 'adm-sub', text: 'Plan status is computed from your plan columns and trial length. If numbers look off, open Setup check.' }));
  }

  // ---- Users ----
  var uq = { q: '', filter: 'all', page: 1, country: '' };
  async function vUsers() {
    head('Users', 'Search, suspend, ban, promote and upgrade accounts.');
    var q = h('input', { type: 'text', placeholder: 'Search email…', value: uq.q });
    var f = h('select', null, [['all', 'All users'], ['trial', 'In trial'], ['paid', 'Paid'], ['expired', 'Expired'], ['suspended', 'Suspended'], ['banned', 'Banned'], ['admin', 'Admins']].map(function (o) { return h('option', { value: o[0], text: o[1] }); })); f.value = uq.filter;
    var go = function () { uq.q = q.value.trim(); uq.filter = f.value; uq.page = 1; load(); };
    q.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); }); f.addEventListener('change', go);
    main.appendChild(h('div', { class: 'adm-bar' }, q, f, h('button', { class: 'adm-btn pri', text: 'Search', onclick: go })));
    var out = h('div'); main.appendChild(out);
    async function load() {
      clear(out); out.appendChild(h('p', { class: 'adm-sub', text: 'Loading…' }));
      var d = await safe(function () { return api('users', { q: uq.q, filter: uq.filter, page: uq.page, country: uq.country }); }); if (!d) return;
      state.users = d.rows; clear(out);
      var tbody = h('tbody');
      d.rows.forEach(function (u) {
        var badges = h('td'); badges.appendChild(h('span', { class: 'badge ' + u.status, text: u.status }));
        if (u.isAdmin) badges.appendChild(h('span', { class: 'badge admin', text: 'admin' })); if (!u.confirmed) badges.appendChild(h('span', { class: 'badge', text: 'unconfirmed' }));
        var acts = h('div', { class: 'adm-acts' },
          u.suspendedUntil ? h('button', { class: 'adm-btn sm', text: 'Unsuspend', onclick: function () { act(u, 'unsuspend'); } }) : h('button', { class: 'adm-btn sm', text: 'Suspend', onclick: function () { act(u, 'suspend'); } }),
          u.banned ? h('button', { class: 'adm-btn sm', text: 'Unban', onclick: function () { act(u, 'unban'); } }) : h('button', { class: 'adm-btn sm dng', text: 'Ban', onclick: function () { act(u, 'ban'); } }),
          h('button', { class: 'adm-btn sm', text: 'Upgrade', onclick: function () { act(u, 'plan'); } }),
          h('button', { class: 'adm-btn sm', text: u.isAdmin ? 'Remove admin' : 'Make admin', onclick: function () { act(u, 'admin'); } }));
        tbody.appendChild(h('tr', null, h('td', { text: u.email }), badges, h('td', { text: (u.plan || '-') + (u.planExpires ? ' · until ' + fdate(u.planExpires) : '') }), h('td', { text: country(u.country) }), h('td', { text: fdate(u.createdAt) }), h('td', { text: fdate(u.lastSignIn) }), h('td', null, acts)));
      });
      out.appendChild(h('div', { class: 'adm-wrap' }, h('table', { class: 'adm-table' }, h('thead', null, h('tr', null, ['Email', 'Status', 'Plan', 'Country', 'Joined', 'Last sign-in', 'Actions'].map(function (c) { return h('th', { text: c }); }))), tbody)));
      var pages = Math.max(1, Math.ceil(d.total / d.perPage));
      out.appendChild(h('div', { class: 'adm-pager' }, h('button', { class: 'adm-btn sm', text: '← Prev', disabled: uq.page <= 1, onclick: function () { uq.page--; load(); } }), h('span', { text: d.total + ' users · page ' + uq.page + ' of ' + pages }), h('button', { class: 'adm-btn sm', text: 'Next →', disabled: uq.page >= pages, onclick: function () { uq.page++; load(); } })));
    }
    load();
    async function act(u, kind) {
      var r, res;
      if (kind === 'suspend') { r = await modal('Suspend ' + u.email, 'They cannot sign in (website or app) until you unsuspend them or the period ends.', [{ name: 'days', label: 'Days (0 = until you lift it)', type: 'number', value: '7' }, { name: 'reason', label: 'Reason (kept in the audit log)' }], 'Suspend', true); if (!r) return; res = await safe(function () { return api('setSuspend', { id: u.id, suspend: true, days: Number(r.days) || 0, reason: r.reason }); }); }
      else if (kind === 'unsuspend') { res = await safe(function () { return api('setSuspend', { id: u.id, suspend: false }); }); }
      else if (kind === 'ban') { r = await modal('Ban ' + u.email, 'Permanent. Blocks sign-in and flags the account (and its linked devices) as banned in the app database.', [{ name: 'reason', label: 'Reason (kept in the audit log)' }], 'Ban user', true); if (!r) return; res = await safe(function () { return api('setBan', { id: u.id, ban: true, reason: r.reason }); }); }
      else if (kind === 'unban') { res = await safe(function () { return api('setBan', { id: u.id, ban: false }); }); }
      else if (kind === 'admin') { r = await modal((u.isAdmin ? 'Remove admin from ' : 'Make admin: ') + u.email, u.isAdmin ? 'They will lose access to this panel and to admin tools in the app.' : 'Admins can see every account and send email to users. Only do this for people you trust.', [], u.isAdmin ? 'Remove admin' : 'Make admin', true); if (!r) return; res = await safe(function () { return api('setAdmin', { id: u.id, admin: !u.isAdmin }); }); }
      else if (kind === 'plan') { r = await modal('Change plan for ' + u.email, 'Sets the plan and expiry directly in the database. Use for manual upgrades, gifts and corrections.', [{ name: 'plan', label: 'Plan', type: 'select', options: [['monthly', 'Monthly (adds 30 days)'], ['yearly', 'Yearly (adds 365 days)'], ['custom', 'Custom days'], ['free', 'Remove paid plan']] }, { name: 'days', label: 'Days (only for Custom, or to override)', type: 'number', placeholder: 'e.g. 14' }, { name: 'note', label: 'Note (kept in the audit log)' }], 'Apply'); if (!r) return; res = await safe(function () { return api('setPlan', { id: u.id, plan: r.plan, days: Number(r.days) || undefined, note: r.note }); }); }
      if (res) { if (res.warnings && res.warnings.length) toast('Done with warnings: ' + res.warnings.join(' | '), true); else toast('Done.'); load(); }
    }
  }

  // ---- Locations ----
  async function vLocations() {
    head('Locations', 'Where visitors and known users come from. Country only; IP addresses are never stored.');
    var d = await safe(function () { return api('overview'); }); if (!d) return;
    main.appendChild(h('div', { class: 'adm-grid' },
      h('div', { class: 'adm-box' }, h('h2', { text: 'Website visitors by country (30 days)' }), list(d.topCountries, country)),
      h('div', { class: 'adm-box' }, h('h2', { text: 'Registered users by country' }), list(d.userCountries, country), h('p', { class: 'adm-sub', text: d.trackedUsers + ' of ' + d.totals.users + ' users have a known location (recorded when they sign in on the website or when the app reports a launch).' }))));
  }

  // ---- Communication center ----
  var mdTimer;
  function mdToDom(text, vars) {
    var box = h('div');
    String(text || '').replace(/\{\{\s*(\w+)\s*\}\}/g, function (m, k) { return vars[k] !== undefined ? vars[k] : m; }).split(/\n{2,}/).forEach(function (blk) {
      blk = blk.trim(); if (!blk) return; var lines = blk.split('\n');
      function inline(parent, s) { var re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/g, last = 0, m; while ((m = re.exec(s))) { if (m.index > last) parent.appendChild(document.createTextNode(s.slice(last, m.index))); if (m[1]) parent.appendChild(h('strong', { text: m[1] })); else parent.appendChild(h('a', { href: m[3], text: m[2], rel: 'noopener' })); last = m.index + m[0].length; } if (last < s.length) parent.appendChild(document.createTextNode(s.slice(last))); }
      var bullets = lines.filter(function (l) { return /^- /.test(l); }), others = lines.filter(function (l) { return !/^- /.test(l); });
      if (others.length) { var p = h('p'); others.forEach(function (l, i) { if (i) p.appendChild(h('br')); inline(p, l); }); box.appendChild(p); }
      if (bullets.length) { var ul = h('ul'); bullets.forEach(function (l) { var li = h('li'); inline(li, l.slice(2)); ul.appendChild(li); }); box.appendChild(ul); }
    });
    return box;
  }
  async function vEmail() {
    head('Communication center', 'Send emails to all users, a segment, or hand-picked users, using ready-made templates.');
    if (!state.tplList.length) { var t = await safe(function () { return api('templates'); }); if (!t) return; state.tplList = t.templates; }
    if (!state.tpl) state.tpl = state.tplList[0];
    var ed = { subject: state.tpl.subject, body: state.tpl.body, category: state.tpl.category };
    var tplBox = h('div', { class: 'adm-tpls' });
    var subj = h('input', { type: 'text', value: ed.subject, placeholder: 'Subject' }), body = h('textarea'); body.value = ed.body;
    var cat = h('select', null, [['service', 'Service message (account, billing, security, legal)'], ['marketing', 'Product news (has unsubscribe link, respects opt-outs)']].map(function (o) { return h('option', { value: o[0], text: o[1] }); })); cat.value = ed.category;
    var prev = h('div', { class: 'mail-prev' });
    var aud = h('select', null, [['all', 'All active users'], ['segment', 'A segment (plan, country, activity)'], ['selected', 'Selected users']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    var segPlan = h('select', null, [['any', 'Any status'], ['trial', 'In trial'], ['paid', 'Paid'], ['expired', 'Expired']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    var segCountry = h('input', { type: 'text', placeholder: 'Country code, e.g. KE (optional)' });
    var segInactive = h('input', { type: 'number', placeholder: 'Inactive for N days (optional)' });
    var segBox = h('div', { class: 'adm-bar' }, segPlan, segCountry, segInactive); segBox.hidden = true;
    var pick = h('div', { class: 'adm-pick' }); var pickBox = h('div'); pickBox.hidden = true;
    var pickSearch = h('input', { type: 'text', placeholder: 'Search users to add…' });
    var chosen = {}; var count = h('p', { class: 'adm-sub', text: '' });
    function currentAudience() {
      if (aud.value === 'all') return { type: 'all' };
      if (aud.value === 'selected') return { type: 'selected', ids: Object.keys(chosen) };
      return { type: 'segment', segment: { status: segPlan.value, country: segCountry.value.trim().toUpperCase(), inactiveDays: Number(segInactive.value) || 0 } };
    }
    async function refreshCount() { var r = await safe(function () { return api('audienceCount', { audience: currentAudience(), category: cat.value }); }); if (r) { count.textContent = r.count + ' recipient' + (r.count === 1 ? '' : 's') + (r.sample.length ? ' (e.g. ' + r.sample.slice(0, 3).join(', ') + ')' : '') + '. Banned, suspended and unconfirmed accounts are skipped' + (cat.value === 'marketing' ? ', and people who unsubscribed are excluded.' : '.'); count.dataset.n = r.count; } }
    function drawPrev() { clear(prev); var vars = { name: 'Alex', email: 'alex@example.com', plan: 'trial', download_url: location.origin + '/download', site_url: location.origin, support_email: 'support@vertexstealth.top' }; var sj = subj.value.replace(/\{\{\s*(\w+)\s*\}\}/g, function (m, k) { return vars[k] !== undefined ? vars[k] : m; }); prev.appendChild(h('div', { class: 'm-sub', text: 'Subject: ' + sj })); prev.appendChild(h('div', { class: 'm-card' }, mdToDom(body.value, vars))); prev.appendChild(h('p', { class: 'adm-sub', text: 'Approximate preview. Use “Send test to me” to see the real email in your inbox.' })); }
    function drawTpls() { clear(tplBox); state.tplList.forEach(function (t) { tplBox.appendChild(h('button', { class: 'adm-tpl' + (t.id === state.tpl.id ? ' on' : ''), onclick: function () { state.tpl = t; subj.value = t.subject; body.value = t.body; cat.value = t.category; drawTpls(); drawPrev(); refreshCount(); } }, h('b', { text: t.name }), h('small', { text: t.topic + ' · ' + (t.category === 'marketing' ? 'product news' : 'service') }))); }); }
    function drawPick() { clear(pick); var q = pickSearch.value.toLowerCase(); (state.users || []).filter(function (u) { return !q || u.email.toLowerCase().indexOf(q) > -1; }).slice(0, 60).forEach(function (u) { var cb = h('input', { type: 'checkbox', checked: !!chosen[u.id], onchange: function () { if (cb.checked) chosen[u.id] = u.email; else delete chosen[u.id]; refreshCount(); } }); pick.appendChild(h('label', null, cb, u.email)); }); }
    pickSearch.addEventListener('input', async function () { clearTimeout(mdTimer); mdTimer = setTimeout(async function () { var r = await safe(function () { return api('users', { q: pickSearch.value, perPage: 60 }); }); if (r) { state.users = r.rows; drawPick(); } }, 300); });
    aud.addEventListener('change', function () { segBox.hidden = aud.value !== 'segment'; pickBox.hidden = aud.value !== 'selected'; if (aud.value === 'selected' && !(state.users || []).length) pickSearch.dispatchEvent(new Event('input')); refreshCount(); });
    [segPlan, segCountry, segInactive, cat].forEach(function (e) { e.addEventListener('change', refreshCount); }); [subj, body].forEach(function (e) { e.addEventListener('input', drawPrev); });
    pickBox.appendChild(pickSearch); pickBox.appendChild(pick);
    function payload() { return { templateId: state.tpl.id, subject: subj.value, body: body.value, category: cat.value, audience: currentAudience() }; }
    var testBtn = h('button', { class: 'adm-btn', text: 'Send test to me', onclick: async function () { var r = await safe(function () { return api('emailSend', Object.assign(payload(), { test: true })); }); if (r) toast('Test sent to ' + r.to); } });
    var sendBtn = h('button', { class: 'adm-btn pri', text: 'Review & send…', onclick: async function () {
      await refreshCount(); var n = Number(count.dataset.n || 0); if (!n) { toast('No recipients match this audience.', true); return; }
      var r = await modal('Send to ' + n + ' recipient' + (n === 1 ? '' : 's') + '?', 'Subject: ' + subj.value + '. This cannot be undone. Type SEND to confirm.', [{ name: 'word', label: 'Type SEND' }], 'Send now', true);
      if (!r || r.word.trim() !== 'SEND') { if (r) toast('Not sent: you did not type SEND.', true); return; }
      sendBtn.disabled = true; var res = await safe(function () { return api('emailSend', Object.assign(payload(), { confirmCount: n })); }); sendBtn.disabled = false;
      if (res) toast('Sent ' + res.sent + (res.failed ? ', failed ' + res.failed + (res.errors && res.errors[0] ? ' (' + res.errors[0] + ')' : '') : '') + '.', !!res.failed);
    } });
    drawTpls(); drawPrev();
    main.appendChild(h('h2', { text: '1. Choose a template', class: 'adm-sub' })); main.appendChild(tplBox);
    main.appendChild(h('div', { class: 'adm-two' },
      h('div', { class: 'adm-box' }, h('h2', { text: '2. Edit the message' }), h('label', { class: 'f', text: 'Subject' }), subj, h('p', { class: 'adm-sub', text: ' ' }), h('label', { class: 'f', text: 'Message' }), body, h('p', { class: 'adm-sub', text: 'Blank line = new paragraph · "- " = bullet · **bold** · [text](https://link) · variables: {{name}} {{email}} {{plan}} {{download_url}} {{site_url}} {{support_email}}' }), h('label', { class: 'f', text: 'Type of message' }), cat),
      h('div', { class: 'adm-box' }, h('h2', { text: 'Preview' }), prev)));
    main.appendChild(h('div', { class: 'adm-box' }, h('h2', { text: '3. Choose recipients' }), h('div', { class: 'adm-bar' }, aud), segBox, pickBox, count, h('div', { class: 'adm-bar' }, testBtn, sendBtn)));
    refreshCount();
  }

  // ---- Releases ----
  async function vReleases() {
    head('Releases', 'Choose which installer the website Download button gives out. Changes go live within about a minute, with no redeploy.');
    var d = await safe(function () { return api('getDownload'); }); if (!d) return;
    var cur = d.current;
    main.appendChild(h('div', { class: 'adm-box' }, h('h2', { text: 'Currently live' }),
      cur ? h('div', { class: 'adm-list' }, h('div', null, h('b', { text: 'Version ' + cur.version }), h('span', { text: ' · set ' + fdate(cur.updatedAt) })), h('a', { href: cur.url, rel: 'noopener', text: cur.url }))
          : h('p', { class: 'adm-sub', text: 'Nothing set here yet, so the website uses the link built into the site. Save a release below to take over.' })));
    main.appendChild(h('div', { class: 'adm-sub', text: ' ' }));
    var ver = h('input', { type: 'text', placeholder: 'e.g. 0.2.2', value: cur ? cur.version : '' });
    var url = h('input', { type: 'text', placeholder: d.prefix + '0.2.2/VertexStealth-Setup-0.2.2.exe', value: cur ? cur.url : '' }); url.style.width = '100%';
    var info = h('p', { class: 'adm-sub', text: '' });
    var det = h('button', { class: 'adm-btn', text: 'Detect latest from GitHub', onclick: async function () { det.disabled = true; var r = await safe(function () { return api('latestRelease'); }); det.disabled = false; if (r) { ver.value = r.version; url.value = r.url; info.textContent = 'Found ' + r.name + ' (' + (r.size / 1048576).toFixed(1) + ' MB), published ' + fdate(r.publishedAt) + '. Review, then Save.'; } } });
    var save = h('button', { class: 'adm-btn pri', text: 'Save and publish', onclick: async function () { save.disabled = true; var r = await safe(function () { return api('setDownload', { version: ver.value, url: url.value }); }); save.disabled = false; if (r) { toast('Download updated to ' + r.version); vReleases(); } } });
    main.appendChild(h('div', { class: 'adm-box' }, h('h2', { text: 'Publish a new version' }),
      h('label', { class: 'f', text: 'Version' }), ver, h('p', { text: ' ' }), h('label', { class: 'f', text: 'Installer link (.exe on GitHub Releases)' }), url, info,
      h('div', { class: 'adm-bar' }, det, save),
      h('p', { class: 'adm-sub', text: 'Steps for each release: 1) publish the release on GitHub with the installer attached. 2) Click Detect latest (or paste the link). 3) Save and publish. The server checks that GitHub really has the file before saving.' })));
  }

  // ---- Activity ----
  async function vActivity() {
    head('Activity log', 'Recent email campaigns and admin actions.');
    var c = await safe(function () { return api('campaigns'); }), a = await safe(function () { return api('auditLog'); });
    function tbl(cols, rows, cell) { return h('div', { class: 'adm-wrap' }, h('table', { class: 'adm-table' }, h('thead', null, h('tr', null, cols.map(function (x) { return h('th', { text: x }); }))), h('tbody', null, rows.map(function (r) { return h('tr', null, cell(r).map(function (v) { return h('td', { text: v }); })); })))); }
    main.appendChild(h('h2', { text: 'Email campaigns', class: 'adm-sub' }));
    main.appendChild(c && c.rows.length ? tbl(['Date', 'Subject', 'Type', 'Recipients', 'Sent', 'Failed', 'By'], c.rows, function (r) { return [fdate(r.created_at), r.subject, r.category, r.recipients, r.sent, r.failed, r.sent_by_email]; }) : h('p', { class: 'adm-sub', text: 'No campaigns yet.' }));
    main.appendChild(h('h2', { text: 'Admin actions', class: 'adm-sub' }));
    main.appendChild(a && a.rows.length ? tbl(['When', 'Admin', 'Action', 'Target', 'Details'], a.rows, function (r) { return [new Date(r.created_at).toLocaleString(), r.admin_email, r.action, r.target_email || '', r.details ? JSON.stringify(r.details).slice(0, 120) : '']; }) : h('p', { class: 'adm-sub', text: 'No actions yet.' }));
  }

  // ---- Setup ----
  async function vSetup() {
    head('Setup check', 'Confirms the server is wired to your database and email provider. Fix anything marked ✗.');
    var d = await safe(function () { return api('setupCheck'); }); if (!d) return; var groups = {};
    d.checks.forEach(function (c) { (groups[c.group] = groups[c.group] || []).push(c); });
    Object.keys(groups).forEach(function (g) { main.appendChild(h('div', { class: 'adm-box' }, h('h2', { text: g }), h('div', { class: 'adm-list' }, groups[g].map(function (c) { return h('div', null, h('span', { class: c.ok ? 'adm-ok' : 'adm-bad', text: c.ok ? '✓ ' : '✗ ' }), h('b', { text: c.name }), h('span', { text: ': ' + c.detail })); })))); main.appendChild(h('div', { class: 'adm-sub', text: ' ' })); });
  }

  // ---- boot ----
  (async function () {
    if (!VS || !VS.configured()) { root.textContent = 'Accounts are not configured on this site yet.'; return; }
    var s = await VS.session(); if (!s) { location.replace('/login?next=/admin'); return; }
    try { var me = await api('me'); shell(me); render(); }
    catch (e) { clear(root); root.appendChild(h('div', { class: 'adm-denied' }, h('h1', { text: e.status === 403 ? 'Not authorised' : 'Could not open the admin panel' }), h('p', { text: e.message }), h('a', { href: '/', text: 'Back to the website' }))); }
  })();
})();
