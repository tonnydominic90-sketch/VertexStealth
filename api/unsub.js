'use strict';
const crypto = require('crypto');
const { sb, fromB64u, unsubToken, SITE } = require('./_lib/common');

function page(res, status, title, text) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(`<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:12vh auto;padding:0 20px;color:#1b2a3a"><h1 style="font-size:24px">${title}</h1><p style="line-height:1.6">${text}</p><p><a href="${SITE()}" style="color:#0875c9">Back to VertexStealth</a></p></body>`);
}

module.exports = async (req, res) => {
  try {
    const q = new URL(req.url, 'http://x').searchParams;
    const email = fromB64u(q.get('e') || '').toLowerCase();
    const token = q.get('t') || '';
    const good = unsubToken(email);
    const ok = email && token.length === good.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(good));
    if (!ok) return page(res, 400, 'Link not valid', 'This unsubscribe link is not valid. Contact support and we will remove you by hand.');
    if (req.method === 'GET' || req.method === 'POST') {
      await sb('/email_optouts?on_conflict=email', { method: 'POST', prefer: 'resolution=ignore-duplicates', body: { email } });
      return page(res, 200, 'You are unsubscribed', 'You will no longer receive product news from VertexStealth. You will still receive important account and service messages, such as security and billing notices.');
    }
    return page(res, 405, 'Not allowed', 'Method not allowed.');
  } catch (e) {
    return page(res, 500, 'Something went wrong', 'Please try again later or contact support.');
  }
};
