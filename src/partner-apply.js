'use strict';
(function () {
  const form = document.getElementById('partner-form');
  if (!form) return;
  const endpoint = form.dataset.endpoint || '';
  const review = form.dataset.review || '3 business days';
  const status = form.querySelector('.pp-status');
  const btn = form.querySelector('button[type="submit"]');
  const say = (text, kind) => { status.className = 'pp-status' + (kind ? ' ' + kind : ''); status.textContent = text; };
  const val = (n) => (form.elements[n] ? String(form.elements[n].value || '').trim() : '');
  let busy = false;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    const body = {
      name: val('name'), email: val('email').toLowerCase(), country: val('country'),
      channel_url: val('channel_url'), promotion_plan: val('promotion_plan'), company_website: val('company_website'),
    };
    if (body.name.length < 2) return say('Please enter your full name.', 'err');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) return say('Please enter a valid email address.', 'err');
    if (body.country.length < 2) return say('Please enter your country.', 'err');
    if (body.channel_url && !/^https?:\/\//i.test(body.channel_url)) return say('The website or channel link must start with https://', 'err');
    if (body.promotion_plan.length < 40) return say('Please tell us a little more about how you plan to share your link (at least a couple of sentences).', 'err');
    if (!form.elements.agree.checked) return say('Please confirm that you agree to the Partner Program Terms.', 'err');

    busy = true; btn.disabled = true; say('Sending your application…');
    let res = null, data = null;
    try {
      res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      try { data = await res.json(); } catch (x) { /* ignore */ }
    } catch (x) { /* network error */ }
    busy = false; btn.disabled = false;

    if (res && res.ok) {
      form.reset();
      form.querySelectorAll('input, textarea, button').forEach((el) => { el.disabled = true; });
      say('Thank you! Your application has been received. We reply within ' + review + ', and we will email you either way. Please also check your spam folder.', 'ok');
      return;
    }
    const msg = (data && data.message) || (res ? 'Something went wrong. Please try again.' : 'Could not reach the server. Check your connection and try again.');
    say(msg, 'err');
  });
})();
