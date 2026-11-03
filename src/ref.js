'use strict';
(function () {
  const root = document.getElementById('ref');
  if (!root) return;
  const fn = root.dataset.fn || '';
  const m = location.pathname.match(/\/r\/([A-Za-z0-9]{8})\/?$/);
  const code = m ? m[1].toUpperCase() : '';
  const go = () => location.replace('/download');
  if (!code) return go();
  let counted = false;
  try { counted = !!sessionStorage.getItem('vs_clicked_' + code); } catch (e) { /* ignore */ }
  const timeout = new Promise((res) => setTimeout(() => res(null), 2500));
  // a refresh does not count twice: only call the server once per browser session
  const call = () => (!fn ? Promise.resolve(null) : fetch(fn + '/partner-click', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
  }).then((r) => r.json()).catch(() => null));
  Promise.race([counted ? Promise.resolve({ valid: true }) : call(), timeout]).then((res) => {
    if (res && res.valid) {
      try {
        localStorage.setItem('vs_ref', JSON.stringify({ code, ts: Date.now() }));
        sessionStorage.setItem('vs_clicked_' + code, '1');
      } catch (e) { /* ignore */ }
    }
    go();
  });
})();
