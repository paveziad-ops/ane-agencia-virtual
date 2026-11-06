// Servidor só de arquivos (como o S3): não tem /api. Registra se alguém tentar chamar /api.
const http = require('http'), fs = require('fs'), path = require('path');
const SITE = path.resolve(process.env.SITE_DIR || 'dist/site');
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png' };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) console.log('CHAMADA AO SERVIDOR (não deveria): ' + req.method + ' ' + u.pathname);
  const f = path.join(SITE, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
  if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = u.pathname.startsWith('/api/') ? 403 : 404; return res.end('nf'); }
  res.setHeader('Content-Type', T[path.extname(f)] || 'application/octet-stream'); fs.createReadStream(f).pipe(res);
}).listen(Number(process.env.PORT || 8083), () => console.log('site :' + (process.env.PORT || 8083)));
