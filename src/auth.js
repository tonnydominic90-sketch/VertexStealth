'use strict';
/* Website sign-in using the SAME Supabase project/users as the desktop app.
   Talks to Supabase Auth (GoTrue) over fetch; the anon key is public by design. */
(function () {
  var cfg = window.VS_CONFIG || {};
  var KEY = 'vs.session';
  var $ = function (id) { return document.getElementById(id); };

  function read() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function write(s) { try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch (e) {} }
  function configured() { return !!(cfg.supabaseUrl && cfg.anonKey); }

  function nice(err) {
    var m = (err && (err.error_description || err.msg || err.message)) || '';
    if (/invalid login/i.test(m)) return 'Email or password is incorrect.';
    if (/not confirmed/i.test(m)) return 'Please confirm your email first. Check your inbox for the confirmation link.';
    if (/already registered|already been registered/i.test(m)) return 'An account with this email already exists. Try signing in instead.';
    if (/banned|suspended/i.test(m)) return 'This account is suspended. Contact support for help.';
    if (/rate limit|too many/i.test(m)) return 'Too many attempts. Please wait a few minutes and try again.';
    if (/password/i.test(m) && /(short|least|weak)/i.test(m)) return 'Choose a stronger password (at least 8 characters).';
    return m || 'Something went wrong. Please try again.';
  }

  async function gotrue(path, opts) {
    if (!configured()) throw { message: 'Accounts are not configured yet.' };
    opts = opts || {};
    var headers = { apikey: cfg.anonKey, 'Content-Type': 'application/json' };
    if (opts.token) headers.Authorization = 'Bearer ' + opts.token;
    var res = await fetch(cfg.supabaseUrl + '/auth/v1' + path, { method: opts.method || 'POST', headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    var text = await res.text(); var data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (e) {}
    if (!res.ok) throw data && (data.msg || data.error_description || data.message) ? data : { message: 'Request failed (' + res.status + ').' };
    return data;
  }

  function store(d) {
    if (!d || !d.access_token) return null;
    var s = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600), user: d.user };
    write(s); return s;
  }

  async function session() {
    var s = read(); if (!s) return null;
    if (s.expires_at - 60 > Date.now() / 1000) return s;
    try {
      var d = await gotrue('/token?grant_type=refresh_token', { body: { refresh_token: s.refresh_token } });
      d.user = d.user || s.user; return store(d);
    } catch (e) { write(null); return null; }
  }

  var api = {
    cfg: cfg, configured: configured, session: session, nice: nice,
    signIn: async function (email, password) { var d = await gotrue('/token?grant_type=password', { body: { email: email, password: password } }); return store(d); },
    signUp: async function (email, password, ref) {
      var meta = { source: 'website' }; if (ref && ref.code) { meta.ref = ref.code; meta.ref_src = ref.src; }
      var d = await gotrue('/signup?redirect_to=' + encodeURIComponent((cfg.siteUrl || location.origin) + '/login'), { body: { email: email, password: password, data: meta } });
      return { session: store(d), needsConfirm: !d.access_token };
    },
    recover: function (email) { return gotrue('/recover?redirect_to=' + encodeURIComponent((cfg.siteUrl || location.origin) + '/account'), { body: { email: email } }); },
    updatePassword: async function (password) { var s = await session(); if (!s) throw { message: 'Please sign in again.' }; return gotrue('/user', { method: 'PUT', token: s.access_token, body: { password: password } }); },
    google: function (next) {
      try { if (next) sessionStorage.setItem('vs_next', next); } catch (e) {}
      location.href = cfg.supabaseUrl + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent((cfg.siteUrl || location.origin) + '/login');
    },
    googleEnabled: async function () {
      try { var r = await fetch(cfg.supabaseUrl + '/auth/v1/settings', { headers: { apikey: cfg.anonKey } }); var d = await r.json(); return !!(d && d.external && d.external.google); } catch (e) { return false; }
    },
    rpc: async function (name, args) {
      var s = await session(); if (!s) throw { message: 'Please sign in.' };
      var r = await fetch(cfg.supabaseUrl + '/rest/v1/rpc/' + name, { method: 'POST', headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) });
      if (!r.ok) throw { message: 'Request failed (' + r.status + ').', status: r.status };
      return r.json();
    },
    signOutEverywhere: async function () { var s = read(); write(null); if (s) { try { await gotrue('/logout?scope=global', { token: s.access_token }); } catch (e) {} } },
    getUser: async function () { var s = await session(); if (!s) return null; return gotrue('/user', { method: 'GET', token: s.access_token }); },
    signOut: async function () { var s = read(); write(null); if (s) { try { await gotrue('/logout', { token: s.access_token }); } catch (e) {} } },
    rest: async function (path) {
      var s = await session(); if (!s) throw { message: 'Please sign in.' };
      var r = await fetch(cfg.supabaseUrl + '/rest/v1' + path, { headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + s.access_token } });
      if (!r.ok) throw { message: 'Request failed (' + r.status + ').' }; return r.json();
    },
    track: async function () {
      var s = await session(); if (!s) return;
      try { fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.access_token }, body: JSON.stringify({ event: 'signin', path: location.pathname }), keepalive: true }); } catch (e) {}
    }
  };
  window.VS = api;


  // ---- partner referral: the code comes from /r/CODE (saved as vs_ref), a typed code, or the account's sign-up metadata
  var CODE_RE = /^[A-Z0-9]{8}$/;
  function cleanCode(v) { return String(v || '').toUpperCase().replace(/[\s-]/g, ''); }
  function savedRef() {
    try { var v = JSON.parse(localStorage.getItem('vs_ref') || 'null'); if (v && CODE_RE.test(cleanCode(v.code)) && Date.now() - (v.ts || 0) < 14 * 864e5) return { code: cleanCode(v.code), src: v.src === 'code' ? 'code' : 'link' }; } catch (e) {}
    return null;
  }
  function pendingRef(user) {
    var l = savedRef(); if (l) return l;
    var m = user && user.user_metadata; if (m && CODE_RE.test(cleanCode(m.ref))) return { code: cleanCode(m.ref), src: m.ref_src === 'link' ? 'link' : 'code' };
    return null;
  }
  async function claimReferral(user) {
    try {
      var s = await session(); if (!s) return;
      var u = user || s.user || {}; var doneKey = 'vs_ref_done_' + (u.id || '');
      if (u.id && localStorage.getItem(doneKey)) return;
      var p = pendingRef(u); if (!p) return;
      var r = await fetch(cfg.supabaseUrl + '/rest/v1/rpc/claim_referral', { method: 'POST', headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_code: p.code, p_source: p.src }) });
      if (!r.ok) return; // keep it and try again next time
      var b = await r.json().catch(function () { return null; });
      if (b && b.status) { localStorage.removeItem('vs_ref'); if (u.id) localStorage.setItem(doneKey, '1'); }
    } catch (e) {}
  }

  function msg(text, ok) { var m = $('authMsg'); if (!m) return; m.textContent = text; m.className = 'auth-msg' + (ok ? ' ok' : ''); m.hidden = !text; }
  function busy(on) { var b = document.querySelector('#authForm button[type=submit]'); if (b) { b.disabled = on; b.style.opacity = on ? '.6' : ''; } }
  function nextUrl() { var n = new URLSearchParams(location.search).get('next') || ''; if (!n) { try { n = sessionStorage.getItem('vs_next') || ''; sessionStorage.removeItem('vs_next'); } catch (e) {} } return /^\/[A-Za-z0-9\-_\/]*$/.test(n) && n.indexOf('//') !== 0 ? n : '/account'; }
  function form(handler) {
    var f = $('authForm'); if (!f) return;
    f.addEventListener('submit', async function (e) {
      e.preventDefault(); msg(''); busy(true);
      try { await handler(); } catch (err) { msg(nice(err)); }
      busy(false);
    });
  }
  function val(id) { var el = $(id); return el ? el.value.trim() : ''; }
  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

  var page = document.body.getAttribute('data-page');
  if (!configured() && /^(login|signup|forgot|account)$/.test(page || '')) { msg('Accounts are not switched on for this website yet. Please check back soon.'); var ff = $('authForm'); if (ff) ff.hidden = true; return; }

  // capture tokens from Supabase email links (#access_token=...&type=recovery|signup)
  var hashSession = null, hashType = '';
  if (location.hash.indexOf('access_token=') > -1) {
    var hp = new URLSearchParams(location.hash.slice(1));
    hashType = hp.get('type') || '';
    hashSession = store({ access_token: hp.get('access_token'), refresh_token: hp.get('refresh_token'), expires_in: parseInt(hp.get('expires_in') || '3600', 10), expires_at: parseInt(hp.get('expires_at') || '0', 10) || undefined });
    history.replaceState(null, '', location.pathname + location.search);
    if (hashSession) { gotrue('/user', { method: 'GET', token: hashSession.access_token }).then(function (u) { hashSession.user = u; write(hashSession); }); }
  }

  // Google / email-link errors come back as #error=...&error_description=...
  if (location.hash.indexOf('error_description=') > -1) {
    var eh = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, '', location.pathname + location.search);
    setTimeout(function () { msg(nice({ message: (eh.get('error_description') || '').replace(/\+/g, ' ') }) || 'Sign-in was cancelled.'); }, 0);
  }

  // "Continue with Google": shown only when the Google provider is switched on in Supabase
  var gb = $('googleBtn');
  if (gb && /^(login|signup)$/.test(page || '')) {
    api.googleEnabled().then(function (on) {
      if (!on) return;
      gb.hidden = false; if ($('authOr')) $('authOr').hidden = false; if ($('googleNote')) $('googleNote').hidden = false;
      gb.addEventListener('click', function () { api.google(new URLSearchParams(location.search).get('next') || ''); });
    });
  }

  if (page === 'login') {
    if (new URLSearchParams(location.search).get('confirmed') || hashType === 'signup') msg('Email confirmed. You can sign in now.', true);
    if (hashSession && !hashType) msg('Signing you in…', true);
    session().then(async function (s) { if (s) { await claimReferral(s.user); location.replace(nextUrl()); } });
    form(async function () {
      var email = val('email'), pw = $('password').value;
      if (!validEmail(email) || !pw) throw { message: 'Enter your email and password.' };
      var si = await api.signIn(email, pw); api.track(); await claimReferral(si && si.user); location.replace(nextUrl());
    });
  } else if (page === 'signup') {
    var rc = $('refcode'), sv = savedRef(); if (rc && sv) rc.value = sv.code;
    form(async function () {
      var email = val('email'), pw = $('password').value;
      if (!validEmail(email)) throw { message: 'Enter a valid email address.' };
      if (pw.length < 8) throw { message: 'Use a password with at least 8 characters.' };
      if (pw !== $('password2').value) throw { message: 'The passwords do not match.' };
      if (!$('terms').checked) throw { message: 'Please accept the terms to continue.' };
      var typed = cleanCode(val('refcode')), ref = null;
      if (typed) { if (!CODE_RE.test(typed)) throw { message: 'The referral code should be 8 letters and numbers, or leave it empty.' }; ref = { code: typed, src: (sv && sv.code === typed) ? sv.src : 'code' }; }
      var r = await api.signUp(email, pw, ref);
      if (ref) { try { localStorage.setItem('vs_ref', JSON.stringify({ code: ref.code, src: ref.src, ts: Date.now() })); } catch (e) {} }
      if (r.session) await claimReferral(r.session.user);
      if (r.needsConfirm) { msg('Almost done. We sent a confirmation link to ' + email + '. Open it, then sign in here or in the desktop app.', true); $('authForm').hidden = true; }
      else { location.replace('/account'); }
    });
  } else if (page === 'forgot') {
    form(async function () {
      var email = val('email'); if (!validEmail(email)) throw { message: 'Enter a valid email address.' };
      await api.recover(email); msg('If an account exists for ' + email + ', a reset link is on its way.', true);
    });
  } else if (page === 'account') {
    (async function () {
      var s = hashSession || await session();
      if (!s) { location.replace('/login?next=/account'); return; }
      var u = await api.getUser().catch(function () { return s.user; }) || s.user || {};
      $('accountBody').hidden = false;
      if (hashType === 'recovery') { msg('Choose a new password below.', true); $('pwTitle').textContent = 'Set a new password'; }
      api.track(); claimReferral(u);
      $('signOut').addEventListener('click', async function () { await api.signOut(); location.replace('/'); });
      $('signOutAll').addEventListener('click', async function () { await api.signOutEverywhere(); location.replace('/login'); });
      renderIdentity(u);
      // load the rest in parallel; any piece may fail without breaking the page
      var res = await Promise.all([
        api.rpc('my_entitlement').catch(function () { return null; }),
        api.rest('/profiles?select=*&id=eq.' + encodeURIComponent(u.id)).then(function (r) { return r && r[0]; }).catch(function () { return null; }),
        api.rpc('my_partner').catch(function () { return null; }),
        api.rpc('my_devices').catch(function () { return null; })
      ]);
      var ent = res[0], prof = res[1], partner = res[2], devices = res[3];
      renderPlan(u, ent, prof); renderUsage(ent); renderSteps(ent, devices); renderPartner(partner); renderBilling(u, ent, prof);
      var dv = $('acctDevices'); dv.textContent = devices ? (devices.length ? devices.length + (devices.length === 1 ? ' device' : ' devices') : 'None yet. Sign in to the desktop app to register one.') : 'Not available';
    })();
    form(async function () {
      var pw = $('password').value;
      if (pw.length < 8) throw { message: 'Use a password with at least 8 characters.' };
      if (pw !== $('password2').value) throw { message: 'The passwords do not match.' };
      await api.updatePassword(pw); $('password').value = ''; $('password2').value = ''; msg('Password saved. Use it on the website and in the desktop app.', true);
    });
  }

  // ===== account dashboard rendering (plain DOM, no innerHTML: every value is written as text) =====
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = text; return e; }
  function link(href, text, cls) { var a = el('a', cls, text); a.href = href; return a; }
  function fmtDate(d) { return d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : ''; }
  function money(n) { return '$' + Number(n || 0).toFixed(Number(n) % 1 ? 2 : 0); }
  function leftText(end) {
    if (!end) return null; var ms = new Date(end).getTime() - Date.now(); if (ms <= 0) return 'Ended';
    var d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5);
    return d >= 1 ? d + (d === 1 ? ' day' : ' days') + (d < 3 ? ' ' + h + ' h' : '') : h + (h === 1 ? ' hour' : ' hours');
  }
  function clear(id) { var n = $(id); n.textContent = ''; return n; }
  function mailto(subject, body) { var m = (cfg.email || 'support@vertexstealth.top'); return 'mailto:' + m + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body || ''); }
  function methods(u) {
    var list = (u.app_metadata && u.app_metadata.providers) || (u.app_metadata && u.app_metadata.provider ? [u.app_metadata.provider] : []);
    return list.length ? list : ['email'];
  }

  function renderIdentity(u) {
    var m = u.user_metadata || {}, name = m.full_name || m.name || '';
    var first = (name || (u.email || '').split('@')[0] || '').split(/\s+/)[0];
    $('adHello').textContent = first ? 'Hi, ' + first.charAt(0).toUpperCase() + first.slice(1) : 'Your account';
    $('adSub').textContent = 'Manage your plan, profiles and account.';
    $('adAvatar').textContent = (name || u.email || '?').trim().charAt(0).toUpperCase();
    $('acctEmail').textContent = u.email || '';
    $('acctSince').textContent = fmtDate(u.created_at);
    var ms = methods(u).map(function (x) { return x === 'google' ? 'Google' : x === 'email' ? 'Email and password' : x; });
    $('acctMethod').textContent = ms.join(' and ');
    $('helpMail').href = mailto('VertexStealth support', 'Account: ' + (u.email || ''));
    $('delMail').href = mailto('Delete my VertexStealth account', 'Please delete the account ' + (u.email || '') + ' and its data.');
    if (methods(u).indexOf('email') < 0) { $('pwTitle').textContent = 'Security'; $('pwLabel').textContent = 'Set a password (at least 8 characters). The desktop app signs in with email and password.'; }
  }

  function renderPlan(u, ent, prof) {
    var plans = cfg.plans || {};
    var eff = (ent && ent.effective) || (prof && prof.plan) || 'free';
    var kind = eff === 'trial' ? 'trial' : (eff === 'free' ? 'free' : 'paid');
    var planName = String((ent && ent.plan) || (prof && prof.plan) || '');
    var nice = kind === 'trial' ? 'Free trial' : kind === 'free' ? 'No active plan' : (/year/i.test(planName + eff) ? 'Yearly' : /month/i.test(planName + eff) ? 'Monthly' : (planName || eff).replace(/^./, function (c) { return c.toUpperCase(); }));
    var end = kind === 'trial' ? (ent && ent.trial_ends_at) : (ent && ent.plan_expires_at) || (prof && prof.plan_expires_at);
    var left = leftText(end), started = ent && ent.trial_started_at;
    var badge = $('planBadge'); badge.textContent = kind === 'trial' ? 'Trial' : kind === 'free' ? 'Free' : 'Active'; badge.className = 'ad-badge ' + kind;
    if (prof && prof.is_admin) badge.textContent += ' · Admin';
    $('planTitle').textContent = nice;
    var sub = '';
    if (kind === 'trial') sub = 'Your free trial ends on ' + fmtDate(end) + (left ? ' (' + left + ' left).' : '.');
    else if (kind === 'free') sub = started ? 'Your free trial has ended. Choose a plan to keep creating and launching profiles.' : 'Your ' + (plans.trialDays || 3) + '-day free trial starts when you first sign in to the desktop app.';
    else sub = end ? 'Your plan is active until ' + fmtDate(end) + (left ? ' (' + left + ' left).' : '.') : 'Your plan is active with no end date.';
    $('planSub').textContent = sub;
    $('fPlan').textContent = nice;
    $('fStatus').textContent = kind === 'free' ? (started ? 'Trial ended' : 'Trial not started') : kind === 'trial' ? 'Trial running' : 'Active';
    $('fDateLabel').textContent = kind === 'trial' ? 'Trial ends' : kind === 'paid' ? 'Renews / ends' : 'Ended';
    $('fDate').textContent = end ? fmtDate(end) : (kind === 'paid' ? 'No end date' : '-');
    $('fLeft').textContent = left || '-';
    // bar: share of the period still left
    var bw = $('planBarWrap'), bar = $('planBar'), frac = null;
    if (end) {
      var total = kind === 'trial' && started ? new Date(end) - new Date(started) : (/year/i.test(nice) ? 365 : 30) * 864e5;
      if (kind !== 'free' && total > 0) frac = Math.max(0, Math.min(1, (new Date(end) - Date.now()) / total));
    }
    if (frac !== null) { bw.hidden = false; bar.style.width = Math.round(frac * 100) + '%'; bar.className = 'ad-bar-fill' + (frac < 0.2 ? ' low' : ''); }
    var cta = clear('planCta');
    cta.appendChild(link('/pricing', kind === 'paid' ? 'Renew or change plan' : kind === 'trial' ? 'Upgrade now' : 'Choose a plan', 'btn primary'));
    cta.appendChild(link('/pricing', 'Compare plans', 'btn outline'));
    var pn = $('payNote');
    if (!plans.paymentsLive) {
      pn.hidden = false; pn.textContent = 'Online checkout is opening soon. To upgrade or renew now, ';
      pn.appendChild(link(mailto('Upgrade my VertexStealth plan', 'Account: ' + (u.email || '') + '\nPlan wanted: Monthly / Yearly'), 'email us'));
      pn.appendChild(document.createTextNode(' and we will activate it for you.'));
    }
  }

  function renderUsage(ent) {
    if (!ent) { $('useBig').textContent = '-'; $('useNote').textContent = 'Usage is not available right now.'; $('useBarWrap').hidden = true; return; }
    var count = ent.count || 0, limit = ent.limit;
    $('useBig').textContent = limit === null || limit === undefined ? count + (count === 1 ? ' profile' : ' profiles') : count + ' of ' + limit;
    var bar = $('useBar'), pct = limit === null || limit === undefined ? 0 : limit === 0 ? (count ? 100 : 0) : Math.min(100, Math.round(count / limit * 100));
    $('useBarWrap').hidden = limit === null || limit === undefined; bar.style.width = pct + '%'; bar.className = 'ad-bar-fill' + (pct >= 100 ? ' low' : '');
    var note = limit === null || limit === undefined ? 'Your plan allows unlimited browser profiles.' : limit === 0 ? 'Your current plan does not include profiles. Choose a plan to create them.' : 'Your plan includes up to ' + limit + ' profiles.';
    if (limit !== null && limit !== undefined && count > limit) note += ' ' + (count - limit) + ' profile(s) are locked, never deleted. Upgrade to unlock them.';
    $('useNote').textContent = note;
  }

  function renderSteps(ent, devices) {
    var count = ent ? ent.count || 0 : 0, paid = ent && ent.effective !== 'free' && ent.effective !== 'trial';
    var hasDevice = devices && devices.length > 0;
    var items = [[true, 'Create your account', null], [hasDevice || count > 0, 'Download and install the desktop app', '/download'], [count > 0, 'Sign in to the app and create your first profile', '/docs'], [!!paid, 'Choose a plan to keep your profiles', '/pricing']];
    var ol = clear('adSteps');
    items.forEach(function (it) { var li = el('li', it[0] ? 'done' : ''); li.appendChild(el('span', 'ad-tick', it[0] ? '\u2713' : '')); li.appendChild(it[2] && !it[0] ? link(it[2], it[1]) : el('span', null, it[1])); ol.appendChild(li); });
  }

  function renderPartner(p) {
    var body = clear('partnerBody'), pc = cfg.partners || {};
    var st = p && p.status || 'none';
    if (st === 'active') {
      body.appendChild(el('p', 'ad-muted', 'You are an approved VertexStealth partner. Your referral code:'));
      body.appendChild(el('div', 'ad-code', p.code || ''));
      var row = el('div', 'ad-row');
      row.appendChild(link('/partner', 'Open partner dashboard', 'btn primary'));
      var cp = el('button', 'btn outline', 'Copy referral link'); cp.type = 'button';
      cp.addEventListener('click', async function () { try { await navigator.clipboard.writeText(location.origin + '/r/' + p.code); cp.textContent = 'Copied'; setTimeout(function () { cp.textContent = 'Copy referral link'; }, 1500); } catch (e) {} });
      row.appendChild(cp); body.appendChild(row);
    } else if (st === 'suspended') {
      body.appendChild(el('p', 'ad-muted', 'Your partner account is suspended. Please contact support if you think this is a mistake.'));
      body.appendChild(link(mailto('Partner account suspended', 'Account: ' + ($('acctEmail').textContent || '')), 'Contact support', 'btn outline'));
    } else if (st === 'pending') {
      body.appendChild(el('p', 'ad-muted', 'Your partner application is being reviewed. We reply within ' + (pc.reviewTime || '3 business days') + ' and will email you. Your dashboard appears here once you are approved.'));
    } else if (st === 'declined') {
      body.appendChild(el('p', 'ad-muted', 'Your last partner application was not approved. You are welcome to apply again with a clearer plan.'));
      body.appendChild(link('/partners-program#apply', 'Apply again', 'btn outline'));
    } else {
      body.appendChild(el('p', 'ad-muted', 'Earn ' + (pc.percent || 20) + '% of the first payment of every customer you refer. Free to join.'));
      body.appendChild(link('/partners-program#apply', 'Become a partner', 'btn outline'));
    }
  }

  function renderBilling(u, ent, prof) {
    var plans = cfg.plans || {}, b = clear('billBody');
    var list = el('ul', 'ad-prices');
    var yearSave = plans.monthly && plans.yearly ? Math.max(0, plans.monthly * 12 - plans.yearly) : 0;
    [['Monthly', money(plans.monthly) + ' / month'], ['Yearly', money(plans.yearly) + ' / year' + (yearSave ? ' (save ' + money(yearSave) + ')' : '')]].forEach(function (r) { var li = el('li'); li.appendChild(el('span', null, r[0])); li.appendChild(el('b', null, r[1])); list.appendChild(li); });
    b.appendChild(list);
    var end = ent && ent.effective !== 'trial' && ent.effective !== 'free' ? (ent.plan_expires_at || (prof && prof.plan_expires_at)) : null;
    b.appendChild(el('p', 'ad-muted', end ? 'Your current plan runs until ' + fmtDate(end) + '. Renew before then to keep every profile unlocked.' : 'Payment history: no payments recorded on this account yet.'));
    b.appendChild(link(mailto('Invoice or refund request', 'Account: ' + (u.email || '')), 'Need an invoice or a refund? Contact us', 'ad-link'));
  }
})();
