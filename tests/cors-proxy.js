// Simula o VerSan de QA com CORS liberado (como o Celso está configurando): repassa ao VerSan simulado
// (porta 9090) e responde à pré-verificação OPTIONS sem exigir autenticação.
// Uso: ORIGEM_PERMITIDA=http://localhost:8083 PORT=9091 node tests/cors-proxy.js
const http = require('http');
const ORIGEM = process.env.ORIGEM_PERMITIDA || 'http://localhost:8083';
http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': ORIGEM, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept', 'Vary': 'Origin' };
  if (req.headers.origin && req.headers.origin !== ORIGEM) { res.writeHead(403); return res.end(); }
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const p = http.request({ host: '127.0.0.1', port: 9090, path: req.url, method: req.method, headers: req.headers }, r => {
    res.writeHead(r.statusCode, Object.assign({}, r.headers, cors)); r.pipe(res);
  });
  req.pipe(p);
}).listen(Number(process.env.PORT || 9091), () => console.log('cors-proxy :' + (process.env.PORT || 9091)));
