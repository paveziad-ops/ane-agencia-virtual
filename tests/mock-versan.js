// VerSan simulado, seguindo exatamente rotas e formatos da collection Postman.
const http=require('http'),fs=require('fs');
const PDF=fs.readFileSync(__dirname+'/teste.pdf').toString('base64');
const DS='java:comp/env/jdbc/DataSource';
let tokens=new Map(),calls=[];
const pessoa={id:14,cpf:'529.982.247-25',idFisicaJuridica:1,nome:'MARIA DAS GRACAS TESTE',email:'MARIA@EXEMPLO.COM',telefone:'(83) 99999-0000',senha:'',ligacao:[],idPessoaEmail:14,idPessoaTelefone:14,idPessoaTipoTelefone:3,idPessoaTipoEmail:1};
const lig=[{id:1001,idPessoa:14,idUnidadeOperacional:1,numero:25,estado:'PB',cidade:'SANTA RITA',bairro:'CENTRO',logradouro:'RUA DAS FLORES',proprietario:true,complemento:'',cep:'',entregaPorEmail:false},
           {id:1002,idPessoa:14,idUnidadeOperacional:1,numero:80,estado:'PB',cidade:'SANTA RITA',bairro:'TIBIRI',logradouro:'AVENIDA BRASIL',proprietario:true,complemento:'CASA B',cep:'',entregaPorEmail:true}];
const deb={1001:[{id:9001,valor:56.6,valorImposto:0,referencia:'202609',dataVencimento:'18/09/2026',diasVencido:41,idSituacaoFatura:1,situacaoFatura:{id:1,situacaoFatura:'DEBITO'},tipoFatura:{id:1,tipoFatura:'FATURA NORMAL'},dataEmissao:'08/09/2026',dataLeitura:'08/09/2026',volumeMedido:12,volumeFaturado:12,leituraAtual:714,leituraAnterior:702,obs:'',vencida:true},
                {id:9002,valor:61.15,valorImposto:0,referencia:'202610',dataVencimento:'18/11/2026',diasVencido:0,idSituacaoFatura:1,situacaoFatura:{id:1,situacaoFatura:'DEBITO'},tipoFatura:{id:1,tipoFatura:'FATURA NORMAL'},dataEmissao:'08/10/2026',dataLeitura:'08/10/2026',volumeMedido:13,volumeFaturado:13,leituraAtual:727,leituraAnterior:714,obs:'',vencida:false}],
           1002:[{id:9101,valor:44.02,valorImposto:0,referencia:'202610',dataVencimento:'20/11/2026',diasVencido:0,idSituacaoFatura:1,situacaoFatura:{id:1,situacaoFatura:'DEBITO'},tipoFatura:{id:1,tipoFatura:'FATURA NORMAL'},dataEmissao:'10/10/2026',dataLeitura:'10/10/2026',volumeMedido:10,volumeFaturado:10,leituraAtual:300,leituraAnterior:290,obs:'',vencida:false}]};
const pagas={1001:{2026:[{dataPagamento:'10/08/2026',dataVencimento:'16/08/2026',valor:44.02,idFatura:8539,dataEmissao:'06/08/2026',dataLeitura:'06/08/2026',volumeMedido:10,volumeFaturado:10,leituraAtual:702,leituraAnterior:692,idSituacaoFatura:2,situacaoFatura:'PAGO'}],2025:[{dataPagamento:'12/12/2025',dataVencimento:'16/12/2025',valor:40.1,idFatura:7001,dataEmissao:'06/12/2025',dataLeitura:'06/12/2025',volumeMedido:9,volumeFaturado:9,leituraAtual:600,leituraAnterior:591,idSituacaoFatura:2,situacaoFatura:'PAGO'}]}};
const consumo=[1,2,3,4,5,6,7,8,9,10].map(m=>({referencia:String(m).padStart(2,'0')+'/2026',volumeMedido:8+m%5,leituraAnterior:600+m*10,leituraAtual:610+m*10,dataLeitura:'05/'+String(m).padStart(2,'0')+'/2026',dataEmissao:'05/'+String(m).padStart(2,'0')+'/2026',volumeFaturado:8+m%5,valor:40+m,rubrica:[{rubrica:'TARIFA DE ÁGUA RES',valor:40+m}],idFatura:5000+m}));
function j(res,s,o){res.writeHead(s,{'Content-Type':'application/json'});res.end(JSON.stringify(o))}
http.createServer((req,res)=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{
 const p=req.url,body=b?JSON.parse(b):{};const m=p.split('/').pop();calls.push(m);
 if(p==='/__calls')return j(res,200,calls);
 if(m==='getSecret'){return body.secret==='segredo-teste'?j(res,200,{idUnidadeOperacional:1,dataSource:DS,code:200}):j(res,401,{})}
 if(body.dataSource!==DS)return j(res,500,{mensagem:'dataSource ausente'});
 if(m==='getAutenticacaoAplicacao'){if(body.login!=='integrador'||body.senha!=='senha-int')return j(res,401,{});const t='tok'+Math.random();tokens.set(t,Date.now()+240e3);return j(res,200,{token:t,tokenValidade:'240'})}
 const auth=(req.headers.authorization||'').replace('Bearer ','');if(!tokens.has(auth)||tokens.get(auth)<Date.now())return j(res,401,{});
 switch(m){
  case 'getAutenticacaoPessoa': return body.numeroDocumento==='529.982.247-25'&&body.senha==='4725'?j(res,200,{aPessoa:[pessoa],aLigacao:lig}):j(res,200,{codigo:1,mensagem:'Usuário ou senha inválidos.'});
  case 'getFaturaEmDebito': { const l=deb[body.idLigacao]||[]; if(body.idInquilino!==undefined&&!lig.some(x=>x.id===body.idLigacao&&x.idPessoa===body.idInquilino))return j(res,200,[]); return j(res,200,l)}
  case 'getFaturaPaga': return j(res,200,(pagas[body.idLigacao]||{})[body.ano]||[]);
  case 'getHistoricoConsumo': return j(res,200,body.ano===2026?consumo:[]);
  case 'getCodigoBarras': return j(res,200,{codigoLeitor:'8263000000012001655202203080000000000000'+body.idFatura,codigoDigitavel:'826300000005 120016552024 203080000003 0000000'+body.idFatura});
  case 'getCodigoPixEstatico': return j(res,200,{codigoPix:'00020126580014BR.GOV.BCB.PIX0136798b3a23-6287-48b3-b882-8ac5e28c6bb9520400005303986540412.05802BR5921AGUAS DO NORDESTE S.A6010SANTA RITA62290525FAT'+body.idFatura+'6304B6B0'});
  case 'getSegundaVia': case 'getSegundaViaOfuscada': return j(res,200,{codigo:0,mensagem:PDF,codigo2:0});
  default: return j(res,404,{});
 }})}).listen(9090,()=>console.log('mock VerSan :9090'));
