'use strict';
// Tiny local preview server for dist/ (mimics Vercel cleanUrls). Run: npm run build && npm start
const http = require('http'), fs = require('fs'), path = require('path');
const dist = path.resolve(__dirname, '..', 'dist');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  let file = path.join(dist, p);
  if (!file.startsWith(dist)) { res.writeHead(403); return res.end(); }
  if (!path.extname(file)) file += '.html';
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': types['.html'] });
      return fs.createReadStream(path.join(dist, '404.html')).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(process.env.PORT || 3000, () => console.log('Preview on http://localhost:' + (process.env.PORT || 3000)));
