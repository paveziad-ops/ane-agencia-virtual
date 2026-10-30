'use strict';
(function(){
const previousHome=publicHome;
publicHome=function(){return previousHome().replace('Informe a matrícula; por segurança, confirme seu CPF e senha para consultar as faturas reais.','Informe apenas a matrícula para consultar sua segunda via e escolher como pagar.').replace('Acesso protegido por CPF e senha','Não precisa fazer login')};
const css=[
'#app .lookup.qp{padding:25px 26px}',
'#app .qp h2{font-size:25px;letter-spacing:-.03em;line-height:1.16;margin:12px 0 6px;color:#183d62}',
'#app .qp p{font-size:12px;color:#708aa1;line-height:1.55}',
'#app .qp-back{border:0;background:transparent;color:#1c75b8;font-weight:800;font-size:11px;cursor:pointer;padding:0}',
'#app .qp-sub{margin-bottom:14px!important}',
'#app .qp-id{font-size:10px;color:#718da6;margin-top:9px}',
'#app .qp-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;padding:13px 11px;border-radius:10px;border:1px solid #dce9f2;background:#f0f7fc;margin:15px 0 12px}',
'#app .qp-summary small{display:block;font-size:10px;color:#7991a9}',
'#app .qp-summary strong{display:block;color:#1b4164;font-size:12px;overflow-wrap:anywhere}',
'#app .qp-tabs{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #d8e7f0}',
'#app .qp-tab{display:flex;align-items:center;gap:8px;justify-content:center;padding:14px 4px;background:transparent;border:0;border-bottom:2px solid transparent;font-size:12px;font-weight:800;color:#526477;cursor:pointer}',
'#app .qp-tab[aria-selected=true]{color:#126bb7;border-color:#168cd4}',
'#app .qp-pix-icon{width:16px;height:16px;transform:rotate(45deg);background:linear-gradient(45deg,#2bd0b3 0 45%,transparent 45% 55%,#2bd0b3 55%);border-radius:4px}',
'#app .qp-bar-icon{width:24px;height:20px;background:repeating-linear-gradient(90deg,#334353 0px,#334353 2px,transparent 2px,transparent 4px);}',
'#app .qp-panel{padding:20px 0 12px;min-height:165px}',
'#app .qp-panel.pix{display:grid;grid-template-columns:164px minmax(0,1fr);gap:14px;align-items:center}',
'#app .qp-qr{min-height:166px;display:flex;align-items:center;justify-content:center;background:white;border:1px solid #dbe6ef;border-radius:10px;padding:7px;max-width:166px}',
'#app .qp-qr img,#app .qp-qr canvas{max-width:100%!important;height:auto!important;image-rendering:pixelated}',
'#app .qp-title{font-size:18px;color:#173e62;margin:0 0 7px;letter-spacing:-.02em;font-weight:800}',
'#app .qp-desc{font-size:11px!important;color:#69839b!important}',
'#app .qp-code{width:100%;min-width:0;margin:10px 0 8px;height:40px;padding:9px;background:#f5f9fc;border:1px solid #d5e2ec;border-radius:8px;color:#24435e;font-size:11px;text-overflow:ellipsis}',
'#app .qp-primary,#app .qp-download{width:100%;border:0;min-height:41px;padding:10px;border-radius:8px;font-size:12px;font-weight:800;cursor:pointer}',
'#app .qp-primary{background:#1b79c7;color:white}',
'#app .qp-download{background:#e0f1fd;color:#135789}',
'#app .qp-primary:disabled,#app .qp-download:disabled{opacity:.6;cursor:wait}',
'#app .qp-warning{font-size:10px!important;color:#b65f2b!important;margin-top:10px!important}',
'#app .qp-footer{border-top:1px solid #dce8f0;padding-top:14px;margin-top:12px}',
'#app .qp-chosen-cdc{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:14px;padding:10px 12px;background:#f0f7fc;border:1px solid #dce9f2;border-radius:9px}',
'#app .qp-chosen-cdc span{font-size:10px;color:#6283a1;font-weight:700}',
'#app .qp-chosen-cdc strong{font-size:13px;color:#194777;font-weight:800;white-space:nowrap}',
'#app .qp-list{display:grid;gap:8px;margin-top:16px}',
'#app .qp-item{display:flex;justify-content:space-between;align-items:center;gap:10px;background:#f6fbff;border:1px solid #dce8f3;border-radius:10px;padding:13px}',
'#app .qp-item strong{font-size:12px;color:#244768}',
'#app .qp-item small{font-size:10px;color:#72889f;display:block}',
'#app .qp-item button{background:#1e77bb;color:white;border:0;border-radius:7px;padding:9px;font-size:11px;font-weight:800;cursor:pointer}',
'@media(max-width:1250px){#app .qp-summary{grid-template-columns:repeat(2,minmax(0,1fr))}#app .qp-panel.pix{grid-template-columns:140px minmax(0,1fr);gap:10px}#app .qp-qr{max-width:140px;min-height:145px}}',
'@media(max-width:660px){#app .qp-panel.pix{grid-template-columns:1fr}#app .qp-qr{margin:0 auto;max-width:184px;min-height:184px}}'
].join('');
const style=document.createElement('style');style.textContent=css;style.id='qp-styles';document.head.appendChild(style);
let changeToken=0,fetchToken=0,qrLib=null,pendingCDC=null;
const e=(tag,klass,text)=>{const x=document.createElement(tag);if(klass)x.className=klass;if(text!==undefined)x.textContent=String(text);return x};
const append=(root,...nodes)=>{for(const n of nodes)root.appendChild(n);return root};
const money=v=>typeof v==='number'?v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—';
const ref=v=>{const s=String(v||'');const m=s.match(/^(\d{4})(\d\d)$/);return m?m[2]+'/'+m[1]:s||'—'};
async function request(acao,cdc,fatura){
const path=acao==='pix'?'/api/versan/pix-rapido':'/api/versan/segunda-via-publica';
const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({acao,cdc,...(fatura?{idFatura:fatura}:{})})});
if(r.ok&&(r.headers.get('Content-Type')||'').includes('application/pdf'))return r.blob();
let d;try{d=await r.json()}catch{throw Error('O VerSan retornou uma resposta inesperada')};
if(!r.ok)throw Error(d.mensagem||'Consulta indisponível');
return d;
}
function ensureQR(){
if(typeof window.QRCode==='function')return Promise.resolve(window.QRCode);
if(!qrLib){qrLib=new Promise((resolve,reject)=>{
const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
s.integrity='sha384-3zSEDfvllQohrq0PHL1fOXJuC/jSOO34H46t6UQfobFOmxE5BpjjaIJY5F2/bMnU';
s.crossOrigin='anonymous';s.onload=()=>typeof window.QRCode==='function'?resolve(window.QRCode):reject(Error('QRCode indisponível'));
s.onerror=()=>reject(Error('Não foi possível carregar o gerador de QR Code'));
document.head.appendChild(s);
})}
return qrLib;
}
function title(card,label,subtitle,backLabel,back){
const b=e('button','qp-back','← '+backLabel);b.type='button';b.onclick=back;
append(card,b,e('h2','',label),e('p','qp-sub',subtitle));
}
function restore(card,original){
changeToken++;card.classList.remove('qp');card.innerHTML=original;
card.querySelector('#cdc')?.focus();
}
function selector(card,cdc,items,original){
changeToken++;card.classList.add('qp');card.replaceChildren();
title(card,'Segunda via da fatura','Selecione a fatura que deseja pagar.','Nova consulta',()=>restore(card,original));
const chosen=e('div','qp-chosen-cdc');
append(chosen,e('span','','Matrícula consultada'),e('strong','','CDC '+cdc));
card.appendChild(chosen);
const list=e('div','qp-list');
for(const item of items){
const box=e('div','qp-item'),labels=e('div');
append(labels,e('strong','',ref(item.referencia)+' · '+money(item.valor)),e('small','','Vencimento '+(item.vencimento||'—')+' · Fatura '+item.idFatura));
const b=e('button','','Selecionar');b.type='button';b.onclick=()=>payment(card,cdc,item,items,original);
append(box,labels,b);list.appendChild(box);
}
card.appendChild(list);
}
function summary(card,cdc,bill){
const wrap=e('div','qp-summary');
for(const [label,value] of [['Referência',ref(bill.referencia)],['Valor',money(bill.valor)],['Vencimento',bill.vencimento||'—'],['Matrícula (CDC)',String(cdc)]]){
const cell=e('div');append(cell,e('small','',label),e('strong','',value));wrap.appendChild(cell);
}
card.appendChild(wrap);
}
async function copy(code,msg,input){
try{if(!navigator.clipboard?.writeText)throw Error('Sem clipboard');await navigator.clipboard.writeText(code);msg.textContent='Código copiado. Confira os dados no banco.'}
catch{input.focus();input.select();msg.textContent='Selecione e copie o código manualmente.'}
}
function codeDisplay(parent,code,titleText,isPix){
const heading=e('h3','qp-title',titleText);
const note=e('p','qp-desc',isPix?'Escaneie o QR Code no app do banco ou copie o Pix abaixo.':'Copie a linha digitável para pagar no seu aplicativo bancário.');
const input=e('input','qp-code');input.value=code;input.readOnly=true;input.setAttribute('aria-label',isPix?'Pix copia e cola':'Linha digitável do código de barras');
const msg=e('p','qp-warning','Confira beneficiário e valor antes de confirmar o pagamento.');
const b=e('button','qp-primary',isPix?'Copiar Pix':'Copiar código');b.type='button';b.onclick=()=>copy(code,msg,input);
append(parent,heading,note,input,b,msg);
}
function payment(card,cdc,item,items,original){
const my=++changeToken;card.classList.add('qp');card.replaceChildren();
const goBack=items.length>1?()=>selector(card,cdc,items,original):()=>restore(card,original);
title(card,'Segunda via da fatura','Escolha a forma de pagamento da sua fatura.',items.length>1?'Voltar às faturas':'Nova consulta',goBack);
card.appendChild(e('div','qp-id','Fatura nº '+item.idFatura+''));
summary(card,cdc,item);
const tabs=e('div','qp-tabs');tabs.setAttribute('role','tablist');
const pixTab=e('button','qp-tab');pixTab.type='button';pixTab.setAttribute('role','tab');
append(pixTab,e('span','qp-pix-icon'),e('span','','Pix'));
const barTab=e('button','qp-tab');barTab.type='button';barTab.setAttribute('role','tab');
append(barTab,e('span','qp-bar-icon'),e('span','','Código de barras'));
append(tabs,pixTab,barTab);card.appendChild(tabs);
const panel=e('div','qp-panel');panel.setAttribute('role','tabpanel');card.appendChild(panel);
const footer=e('div','qp-footer'),download=e('button','qp-download','↓  Baixar fatura');
download.type='button';const fNote=e('p','qp-desc','Segunda via com dados pessoais ofuscados, emitida pelo VerSan.');
// The public-email API has not yet been delivered. Display the approved action,
// but never simulate or attempt an unsecured send. Only a masked PDF can be sent here.
const emailButton=e('button','qp-download','✉  Enviar fatura por e-mail · Em breve');
emailButton.type='button';emailButton.disabled=true;
emailButton.setAttribute('aria-label','Enviar fatura ofuscada por e-mail, disponível em breve');
emailButton.title='Aguardando integração de envio da segunda via ofuscada pelo VerSan';
emailButton.style.marginTop='9px';
append(footer,download,emailButton,fNote);card.appendChild(footer);
download.onclick=async()=>{
download.disabled=true;download.textContent='Baixando fatura...';
try{
const pdf=await request('segundaVia',cdc,item.idFatura);
if(pdf.size<100||!pdf.type.includes('pdf'))throw Error('Arquivo PDF inválido');
const u=URL.createObjectURL(pdf),a=e('a');a.href=u;a.download='segunda-via-ofuscada-'+item.idFatura+'.pdf';
document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),30000);
fNote.textContent='PDF recebido. Confira o documento antes de pagar.';
}catch(ex){fNote.textContent=ex.message}
finally{download.disabled=false;download.textContent='↓  Baixar fatura'}
};
async function choose(which){
pixTab.setAttribute('aria-selected',String(which==='pix'));barTab.setAttribute('aria-selected',String(which==='barra'));
const turn=++fetchToken;panel.classList.toggle('pix',which==='pix');
panel.replaceChildren(e('p','qp-desc','Consultando '+(which==='pix'?'Pix':'código de barras')+' no VerSan...'));
try{
const result=await request(which==='pix'?'pix':'codigoBarras',cdc,item.idFatura);
if(turn!==fetchToken||!document.contains(card)||!panel.isConnected)return;
const code=which==='pix'?result.codigoPix:result.codigoDigitavel;
if(typeof code!=='string'||code.length<20)throw Error('O código de pagamento não foi retornado.');
panel.replaceChildren();
if(which==='pix'){
const qr=e('div','qp-qr','Gerando QR Code...'),details=e('div');
codeDisplay(details,code,'Pagar com Pix',true);append(panel,qr,details);
try{
const QR=await ensureQR();
if(turn!==fetchToken||!qr.isConnected)return;
qr.replaceChildren();new QR(qr,{text:code,width:148,height:148,colorDark:'#101820',colorLight:'#ffffff',correctLevel:QR.CorrectLevel.M});
}catch(ex){qr.textContent='QR Code indisponível. Utilize o Pix copia e cola.'}
}else{const details=e('div');codeDisplay(details,code,'Pagar com código de barras',false);panel.appendChild(details)}
}catch(ex){if(turn===fetchToken)panel.replaceChildren(e('p','qp-warning',ex.message+' Tente novamente selecionando esta opção.'))}
}
pixTab.onclick=()=>choose('pix');barTab.onclick=()=>choose('barra');void choose('pix');
}
function warnUnknownCDC(out){
  out.replaceChildren();
  const title=document.createElement('strong');
  title.textContent='Atenção: confira o CDC informado.';
  const description=document.createElement('div');
  description.textContent='Nenhuma fatura foi encontrada para esta matrícula. Confira o número do CDC na sua conta de água. Esse resultado não confirma ausência de débitos.';
  description.style.marginTop='5px';
  out.appendChild(title);
  out.appendChild(description);
  out.setAttribute('role','alert');
  out.style.backgroundColor='#fff7e9';
  out.style.border='1px solid #ecd19d';
  out.style.color='#885629';
}
lookup=async function(){
const card=document.querySelector('.lookup'),input=document.getElementById('cdc'),out=document.getElementById('lookup-out');
if(!card||!input||!out)return;
const cdc=String(input.value||'').trim();
out.style.display='block';
out.style.backgroundColor='';
out.style.border='';
out.style.color='';
out.removeAttribute('role');
if(!/^\d{1,10}$/.test(cdc)||Number(cdc)<1){out.textContent='Informe uma matrícula válida.';return}
if(pendingCDC===cdc)return;
pendingCDC=cdc;
const original=card.innerHTML,requestId=++changeToken;
out.textContent='Buscando suas faturas. Aguarde um instante...';
try{
const result=await request('consultar',cdc);
if(requestId!==changeToken||!document.contains(card))return;
const invoices=Array.isArray(result.faturas)?result.faturas.filter(x=>Number.isSafeInteger(Number(x.idFatura))&&Number(x.idFatura)>0):[];
if(!invoices.length){warnUnknownCDC(out);return}
if(invoices.length>1)selector(card,cdc,invoices,original);
else payment(card,cdc,invoices[0],invoices,original);
}catch(ex){if(requestId===changeToken)out.textContent=ex.message}
finally{if(pendingCDC===cdc)pendingCDC=null}
};
document.addEventListener('keydown',event=>{
if(event.key==='Enter'&&event.target?.id==='cdc'){event.preventDefault();void lookup()}
});
})();