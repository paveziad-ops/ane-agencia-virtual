// Servidor local: arquivos estáticos + funções /api/versan/* no formato Vercel.
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=''+require('path').resolve(__dirname,'..')+'',TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'};
http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://x');
 if(u.pathname.startsWith('/api/')){
  const f=path.join(ROOT,u.pathname+'.js');if(!f.startsWith(ROOT+'/api/')||!fs.existsSync(f)){res.statusCode=404;return res.end('{}')}
  res.status=c=>{res.statusCode=c;return res};res.json=o=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(o))};
  try{await require(f)(req,res)}catch(e){console.error(e);res.statusCode=500;res.end('{}')}return;
 }
 let p=path.join(ROOT,decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
 if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.statusCode=404;return res.end('nf')}
 res.setHeader('Content-Type',TYPES[path.extname(p)]||'application/octet-stream');fs.createReadStream(p).pipe(res);
}).listen(8083,()=>console.log('dev :8083'));
