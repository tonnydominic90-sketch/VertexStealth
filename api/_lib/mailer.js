'use strict';
const { env } = require('./common');

const from = () => env('EMAIL_FROM', 'VertexStealth <support@vertexstealth.top>');
const replyTo = () => env('EMAIL_REPLY_TO', 'support@vertexstealth.top');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// emails: [{ to, subject, html, text, headers }]
async function sendBatch(emails) {
  const key = env('RESEND_API_KEY');
  if (!key) throw Object.assign(new Error('RESEND_API_KEY is not set on the server.'), { status: 500 });
  let sent = 0, failed = 0; const errors = [];
  for (let i = 0; i < emails.length; i += 100) {
    const chunk = emails.slice(i, i + 100).map((m) => ({ from: from(), reply_to: replyTo(), to: [m.to], subject: m.subject, html: m.html, text: m.text, headers: m.headers }));
    try {
      const res = await fetch('https://api.resend.com/emails/batch', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(chunk) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) sent += chunk.length; else { failed += chunk.length; errors.push(data.message || ('Resend error ' + res.status)); }
    } catch (e) { failed += chunk.length; errors.push(String(e.message || e)); }
    if (i + 100 < emails.length) await sleep(650); // stay under Resend's default 2 requests/second
  }
  return { sent, failed, errors: [...new Set(errors)].slice(0, 3) };
}

module.exports = { sendBatch, from };
