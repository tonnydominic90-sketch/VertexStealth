'use strict';
const { env } = require('./common');

// Sends through Brevo (https://developers.brevo.com/reference/sendtransacemail).
// BREVO_API_KEY = an API key (v3) from Brevo > SMTP & API > API Keys.
// EMAIL_FROM    = "VertexStealth <you@yourdomain.com>"; the address MUST be a verified sender in Brevo.
const from = () => env('EMAIL_FROM', 'VertexStealth <support@vertexstealth.top>');
const replyTo = () => env('EMAIL_REPLY_TO', '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** "Name <a@b.c>" or "a@b.c" -> { name, email } */
function parseAddress(s) {
  const m = String(s || '').match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || undefined, email: m[2].trim() };
  return { email: String(s || '').trim() };
}

function toBrevo(m) {
  const body = { sender: parseAddress(from()), to: [{ email: m.to }], subject: m.subject, htmlContent: m.html };
  if (m.text) body.textContent = m.text;
  const rt = replyTo(); if (rt) body.replyTo = parseAddress(rt);
  if (m.headers && Object.keys(m.headers).length) body.headers = m.headers; // e.g. List-Unsubscribe
  return body;
}

// emails: [{ to, subject, html, text, headers }]
async function sendBatch(emails) {
  const key = env('BREVO_API_KEY');
  if (!key) throw Object.assign(new Error('BREVO_API_KEY is not set on the server.'), { status: 500 });
  let sent = 0, failed = 0; const errors = [];
  const PARALLEL = 5; // gentle on Brevo's rate limits
  for (let i = 0; i < emails.length; i += PARALLEL) {
    const chunk = emails.slice(i, i + PARALLEL);
    await Promise.all(chunk.map(async (m) => {
      try {
        const res = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': key, 'Content-Type': 'application/json', accept: 'application/json' }, body: JSON.stringify(toBrevo(m)) });
        if (res.ok) { sent++; return; }
        const data = await res.json().catch(() => ({}));
        failed++; errors.push(data.message || ('Brevo error ' + res.status));
      } catch (e) { failed++; errors.push(String(e.message || e)); }
    }));
    if (i + PARALLEL < emails.length) await sleep(250);
  }
  return { sent, failed, errors: [...new Set(errors)].slice(0, 3) };
}

module.exports = { sendBatch, from, parseAddress };
