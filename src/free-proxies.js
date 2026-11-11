'use strict';
(function () {
  var root = document.getElementById('fp');
  if (!root) return;
  var API = '/api/free-proxies';
  var els = {
    proto: document.getElementById('fp-proto'), country: document.getElementById('fp-country'), speed: document.getElementById('fp-speed'),
    body: document.getElementById('fp-body'), summary: document.getElementById('fp-summary'), pager: document.getElementById('fp-pager'),
    reset: document.getElementById('fp-reset'), copyAll: document.getElementById('fp-copyall'),
    dlTxt: document.getElementById('fp-dl-txt'), dlCsv: document.getElementById('fp-dl-csv'), dlJson: document.getElementById('fp-dl-json'),
  };
  var q = new URLSearchParams(location.search);
  var state = { protocol: q.get('protocol') || '', country: (q.get('country') || '').toUpperCase(), maxms: q.get('maxms') || '', page: Math.max(1, Number(q.get('page')) || 1) };
  var names = null; try { names = new Intl.DisplayNames(['en'], { type: 'region' }); } catch (e) { /* older browser */ }
  var facetsDone = false, refreshAsked = false, seq = 0;

  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') el.textContent = attrs[k]; else if (k === 'class') el.className = attrs[k]; else el.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function cname(cc) { if (!cc) return 'Unknown'; try { return (names && names.of(cc)) || cc; } catch (e) { return cc; } }
  function ago(iso) {
    if (!iso) return '-'; var s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 90) return 'just now'; if (s < 5400) return Math.round(s / 60) + ' min ago'; if (s < 129600) return Math.round(s / 3600) + ' h ago'; return Math.round(s / 86400) + ' days ago';
  }
  function utc(iso) { return iso ? new Date(iso).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : ''; }
  function qs(extra) {
    var p = new URLSearchParams();
    if (state.protocol) p.set('protocol', state.protocol); if (state.country) p.set('country', state.country); if (state.maxms) p.set('maxms', state.maxms);
    Object.keys(extra || {}).forEach(function (k) { p.set(k, extra[k]); });
    var s = p.toString(); return s ? '?' + s : '';
  }
  function syncUrl() {
    var p = new URLSearchParams(); if (state.protocol) p.set('protocol', state.protocol); if (state.country) p.set('country', state.country); if (state.maxms) p.set('maxms', state.maxms); if (state.page > 1) p.set('page', state.page);
    var s = p.toString(); try { history.replaceState(null, '', location.pathname + (s ? '?' + s : '')); } catch (e) { /* ignore */ }
  }
  function updateDownloads() {
    els.dlTxt.setAttribute('href', API + qs({ format: 'txt', download: 1 }));
    els.dlCsv.setAttribute('href', API + qs({ format: 'csv', download: 1 }));
    els.dlJson.setAttribute('href', API + qs({ format: 'json', download: 1 }));
  }
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var t = h('textarea', { 'aria-hidden': 'true' }); t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand('copy') ? resolve() : reject(new Error('copy failed')); } catch (e) { reject(e); } t.remove();
    });
  }
  function flash(btn, ok) { var old = btn.getAttribute('data-label') || btn.textContent; btn.setAttribute('data-label', old); btn.textContent = ok ? 'Copied' : 'Press Ctrl+C'; btn.classList.toggle('done', ok); setTimeout(function () { btn.textContent = old; btn.classList.remove('done'); }, 1400); }

  function protoCell(r) {
    var td = h('td');
    if (r.protocol === 'socks5') td.appendChild(h('span', { class: 'fp-tag s5', text: 'SOCKS5' }));
    else if (r.protocol === 'socks4') td.appendChild(h('span', { class: 'fp-tag s4', text: 'SOCKS4' }));
    else { td.appendChild(h('span', { class: 'fp-tag h', text: 'HTTP' })); if (r.https) td.appendChild(h('span', { class: 'fp-tag hs', text: 'HTTPS' })); }
    return td;
  }
  function row(r) {
    var ms = r.ms === null || r.ms === undefined ? '-' : r.ms + ' ms';
    var cls = r.ms < 800 ? 'fast' : r.ms < 2000 ? 'mid' : 'slow';
    var btn = h('button', { class: 'fp-copy', type: 'button', text: 'Copy', 'aria-label': 'Copy ' + r.ip + ':' + r.port });
    btn.addEventListener('click', function () { copy(r.ip + ':' + r.port).then(function () { flash(btn, true); }, function () { flash(btn, false); }); });
    return h('tr', null, [
      h('td', { class: 'ip', text: r.ip }), h('td', { class: 'port', text: String(r.port) }),
      h('td', null, [h('span', { class: 'fp-cc', text: r.country || '??' }), cname(r.country)]),
      protoCell(r), h('td', null, [h('span', { class: 'fp-ms ' + cls, text: ms })]),
      h('td', { title: utc(r.checked), text: ago(r.checked) }), h('td', null, [btn]),
    ]);
  }
  function fillFacets(f) {
    if (facetsDone) return; facetsDone = true;
    var sel = els.country; clear(sel); sel.appendChild(h('option', { value: '', text: 'All countries' }));
    f.countries.slice().sort(function (a, b) { return cname(a.code).localeCompare(cname(b.code)); }).forEach(function (c) { sel.appendChild(h('option', { value: c.code, text: cname(c.code) + ' (' + c.count + ')' })); });
    sel.value = state.country;
    var labels = { '': 'All protocols', http: 'HTTP', https: 'HTTPS', socks4: 'SOCKS4', socks5: 'SOCKS5' };
    Array.prototype.forEach.call(els.proto.options, function (o) { var n = o.value ? f.protocols[o.value] : null; o.textContent = labels[o.value] + (n !== null && n !== undefined ? ' (' + n + ')' : ''); });
    els.proto.value = state.protocol;
  }
  function pager(d) {
    clear(els.pager); if (d.pages <= 1) return;
    var prev = h('button', { class: 'fp-btn', type: 'button', text: 'Previous' }), next = h('button', { class: 'fp-btn', type: 'button', text: 'Next' });
    if (d.page <= 1) prev.setAttribute('disabled', ''); if (d.page >= d.pages) next.setAttribute('disabled', '');
    prev.addEventListener('click', function () { state.page = d.page - 1; load(true); }); next.addEventListener('click', function () { state.page = d.page + 1; load(true); });
    els.pager.appendChild(prev); els.pager.appendChild(h('span', { text: 'Page ' + d.page + ' of ' + d.pages })); els.pager.appendChild(next);
  }
  function empty(msg) { clear(els.body); els.body.appendChild(h('tr', null, [h('td', { colspan: '7', class: 'fp-empty', text: msg })])); clear(els.pager); }

  async function askRefresh() {
    if (refreshAsked) return; refreshAsked = true;
    try { var r = await fetch('/api/proxy-refresh', { method: 'POST' }); var d = await r.json(); if (d && d.ran) { facetsDone = false; load(false); } } catch (e) { /* the list stays as it is */ }
  }
  async function load(scroll) {
    var my = ++seq; syncUrl(); updateDownloads();
    try {
      var r = await fetch(API + qs({ page: state.page, per: 50 })); if (!r.ok) throw new Error('bad status');
      var d = await r.json(); if (my !== seq) return;
      fillFacets(d.facets);
      els.summary.textContent = '';
      var bits = d.available ? [h('b', { text: d.total + ' working proxies' }), ' match your filters (' + d.available + ' in the list from ' + d.facets.countries.length + ' countries). Updated ' + ago(d.updatedAt) + '. HTTP ' + d.facets.protocols.http + ', SOCKS5 ' + d.facets.protocols.socks5 + ', SOCKS4 ' + d.facets.protocols.socks4 + '.'] : [];
      bits.forEach(function (b) { els.summary.appendChild(typeof b === 'string' ? document.createTextNode(b) : b); });
      if (!d.rows.length) {
        if (!d.available) { empty(d.stale ? 'Collecting and testing the first proxies. This takes about a minute, please wait or reload shortly.' : 'No working proxies right now. Please check back in a few minutes.'); els.summary.textContent = ''; }
        else empty('No proxies match these filters. Try another country or protocol.');
      } else {
        clear(els.body); d.rows.forEach(function (x) { els.body.appendChild(row(x)); }); pager(d);
      }
      if (d.stale) askRefresh();
      if (scroll) els.body.closest('.fp-scroll').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { if (my === seq) { empty('The list could not be loaded. Please try again in a moment.'); els.summary.textContent = ''; } }
  }

  els.proto.value = state.protocol; els.speed.value = state.maxms;
  [['proto', 'protocol'], ['country', 'country'], ['speed', 'maxms']].forEach(function (p) { els[p[0]].addEventListener('change', function () { state[p[1]] = els[p[0]].value; state.page = 1; load(false); }); });
  els.reset.addEventListener('click', function () { state = { protocol: '', country: '', maxms: '', page: 1 }; els.proto.value = ''; els.country.value = ''; els.speed.value = ''; load(false); });
  els.copyAll.addEventListener('click', async function () {
    try { var r = await fetch(API + qs({ format: 'txt' })); var t = await r.text(); await copy(t.trim()); flash(els.copyAll, true); } catch (e) { flash(els.copyAll, false); }
  });
  load(false);
})();
