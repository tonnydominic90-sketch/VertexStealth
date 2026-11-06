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
  function nextUrl() { var n = new URLSearchParams(location.search).get('next') || ''; return /^\/[A-Za-z0-9\-_\/]*$/.test(n) && n.indexOf('//') !== 0 ? n : '/account'; }
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

  if (page === 'login') {
    if (new URLSearchParams(location.search).get('confirmed') || hashType === 'signup') msg('Email confirmed. You can sign in now.', true);
    session().then(function (s) { if (s) location.replace(nextUrl()); });
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
      $('acctEmail').textContent = u.email || '';
      $('acctSince').textContent = u.created_at ? new Date(u.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '';
      $('accountBody').hidden = false;
      if (hashType === 'recovery') { msg('Choose a new password below.', true); $('pwTitle').textContent = 'Set a new password'; }
      api.track(); claimReferral(u);
      try {
        var rows = await api.rest('/profiles?select=*&id=eq.' + encodeURIComponent(u.id));
        var p = rows && rows[0];
        if (p && (p.plan || p.plan_expires_at)) {
          var txt = String(p.plan || 'trial'); if (p.plan_expires_at) txt += ' · until ' + new Date(p.plan_expires_at).toLocaleDateString();
          $('acctPlan').textContent = txt; $('acctPlanRow').hidden = false;
        }
      } catch (e) {}
      $('signOut').addEventListener('click', async function () { await api.signOut(); location.replace('/'); });
    })();
    form(async function () {
      var pw = $('password').value;
      if (pw.length < 8) throw { message: 'Use a password with at least 8 characters.' };
      if (pw !== $('password2').value) throw { message: 'The passwords do not match.' };
      await api.updatePassword(pw); $('password').value = ''; $('password2').value = ''; msg('Password updated. Use it on the website and in the desktop app.', true);
    });
  }
})();
