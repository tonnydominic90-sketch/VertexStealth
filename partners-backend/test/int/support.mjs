// proxy: /rest/v1/* -> PostgREST ; mock Resend on :3999 ; JWT minting
import http from 'node:http'; import crypto from 'node:crypto';
export const SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
export function jwt(payload) { const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64({ ...payload, exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`; }
if (process.argv[2] === 'jwt') { const [role, sub] = process.argv.slice(3); console.log(jwt(sub ? { role, sub } : { role })); process.exit(0); }
const sent = [];
http.createServer((req, res) => { let d = ''; req.on('data', (c) => d += c); req.on('end', () => {
  if (req.method === 'GET') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(sent)); }
  if (req.method === 'DELETE') { sent.length = 0; return res.end('ok'); }
  try { sent.push({ auth: req.headers.authorization, ...JSON.parse(d) }); } catch {} res.setHeader('content-type', 'application/json'); res.end('{"id":"mock"}'); }); }).listen(3999);
http.createServer((req, res) => {
  const cors = { 'access-control-allow-origin': req.headers.origin || '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (req.url.startsWith('/auth/v1/token')) {  // mock GoTrue password login for the admin page test
    let d = ''; req.on('data', (c) => d += c); return req.on('end', () => {
      const b = JSON.parse(d || '{}'); res.setHeader('content-type', 'application/json'); Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));
      if (b.email === 'admin@x.com' && b.password === 'pw') { res.end(JSON.stringify({ access_token: jwt({ role: 'authenticated', sub: process.env.TEST_ADMIN_ID }) })); }
      else if (b.email === 'user@x.com' && b.password === 'pw') { res.end(JSON.stringify({ access_token: jwt({ role: 'authenticated', sub: process.env.TEST_USER_ID }) })); }
      else { res.statusCode = 400; res.end(JSON.stringify({ error_description: 'Invalid login credentials' })); } }); }
  const url = req.url.replace(/^\/rest\/v1/, '') || '/';
  const p = http.request({ host: 'localhost', port: 3000, path: url, method: req.method, headers: { ...req.headers, host: 'localhost:3000' } }, (r) => { res.writeHead(r.statusCode, { ...r.headers, ...cors }); r.pipe(res); });
  p.on('error', (e) => { res.writeHead(502); res.end(String(e)); }); req.pipe(p);
}).listen(54321);
console.log('support up');
