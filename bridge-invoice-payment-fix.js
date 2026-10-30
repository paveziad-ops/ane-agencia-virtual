/* Faturas e Pix: restaura a experiencia aprovada da segunda via no acesso autenticado.
   Nao altera API, autenticação ou a consulta rapida publica. */
(function(){
'use strict';
const previousPayment=window.realANEPayment;
const previousInvoices=invoicePage;
const el=(name,klass,txt)=>{
 const node=document.createElement(name);
 if(klass)node.className=klass;
 if(txt!==undefined)node.textContent=String(txt);
 return node;
};
let active=null,token=0,qrPromise=null,pdfURL=null,pdfOwner=null;
const secureId=x=>Number.isSafeInteger(Number(x))&&Number(x)>0?Number(x):null;
function safeText(s){return esc(String(s==null?'':s))}
function capture(id,kind){
 const button=[...document.querySelectorAll('.inv-open-row .inv-actions button')]
  .find(x=>x.getAttribute('onclick')==="realANEPayment('"+kind+"',"+id+")");
 const row=button?.closest('.inv-open-row');
 return{
  id,cdc:String(state.current),user:window.realANE?.user,
  reference:row?.querySelector('.inv-open-title strong')?.textContent?.trim()||'Fatura nº '+id,
  amount:row?.querySelector('.inv-money')?.textContent?.trim()||'Consulte a fatura',
  due:row?.querySelector('.inv-date')?.textContent?.trim()?.replace(/^Vencimento\s*/, '')||'—',
  kind
 };
}
function paymentHTML(info){
 const summary=[
  ['Referência',info.reference],['Valor',info.amount],
  ['Vencimento',info.due],['Matrícula (CDC)',info.cdc]
 ].map(([label,value])=>'<div><small>'+safeText(label)+'</small><strong>'+safeText(value)+'</strong></div>').join('');
 return '<section class="module qp invoice-payment-screen" aria-label="Pagamento da fatura">'+
  '<button type="button" class="qp-back" onclick="invoicePaymentBack()">← Voltar às faturas</button>'+
  '<h2>Segunda via da fatura</h2>'+
  '<p class="qp-sub">Escolha a forma de pagamento da sua fatura.</p>'+
  '<div class="qp-id">Fatura nº '+info.id+'</div>'+
  '<div class="qp-summary">'+summary+'</div>'+
  '<div class="qp-tabs" role="tablist" aria-label="Formas de pagamento">'+
  '<button type="button" class="qp-tab" id="invoice-tab-pix" role="tab" aria-selected="'+
     (info.kind==='pix')+'" onclick="invoicePaymentTab(&#39;pix&#39;)">'+
  '<span class="qp-pix-icon" aria-hidden="true"></span><span>Pix</span></button>'+
  '<button type="button" class="qp-tab" id="invoice-tab-barra" role="tab" aria-selected="'+
     (info.kind==='barra')+'" onclick="invoicePaymentTab(&#39;barra&#39;)">'+
  '<span class="qp-bar-icon" aria-hidden="true"></span><span>Código de barras</span></button>'+
  '</div><div class="qp-panel '+(info.kind==='pix'?'pix':'')+
   '" role="tabpanel" id="invoice-payment-panel" aria-live="polite">'+
  '<p class="qp-desc">Consultando o VerSan...</p></div>'+
  '<div class="qp-footer invoice-payment-footer">'+
  '<button type="button" class="qp-download" onclick="realANEPayment(&#39;pdf&#39;,'+info.id+
    ')">↓  Baixar fatura</button>'+
  '<button type="button" class="qp-download invoice-email-send" onclick="window.qpeOpenFor&&window.qpeOpenFor('+JSON.stringify(String(info.cdc)).replace(/"/g,'&quot;')+','+info.id+',this)">✉  Enviar fatura por e-mail</button>'+
  '<p class="qp-desc">Segunda via vinculada à sua conta autenticada.</p>'+
  '</div></section>';
}
invoicePage=function(){
 const html=previousInvoices();
 if(!active||!state.logged||route()!=='faturas')return html;
 if(String(state.current)!==active.cdc||window.realANE?.user!==active.user){active=null;return html}
 const beginning=html.indexOf('<section class="module invoices-refined">');
 const mainEnd=html.indexOf('</main>',beginning);
 const finish=html.lastIndexOf('</section>',mainEnd);
 if(beginning<0||mainEnd<0||finish<=beginning)return html;
 return html.slice(0,beginning)+paymentHTML(active)+html.slice(finish+'</section>'.length);
};
function ensureQR(){
 if(typeof window.QRCode==='function')return Promise.resolve(window.QRCode);
 if(!qrPromise){
  qrPromise=new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   script.src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
   script.integrity='sha384-3zSEDfvllQohrq0PHL1fOXJuC/jSOO34H46t6UQfobFOmxE5BpjjaIJY5F2/bMnU';
   script.crossOrigin='anonymous';
   script.onload=()=>typeof window.QRCode==='function'?resolve(window.QRCode):
     reject(Error('O gerador de QR Code está indisponível'));
   script.onerror=()=>reject(Error('O gerador de QR Code não pôde ser carregado'));
   document.head.appendChild(script);
  }).catch(ex=>{qrPromise=null;throw ex});
 }
 return qrPromise;
}
async function copy(code,status,input){
 try{
  if(!navigator.clipboard?.writeText)throw Error('clipboard');
  await navigator.clipboard.writeText(code);
  status.textContent='Código copiado. Confira os dados no aplicativo bancário.';
 }catch{
  input.focus();input.select();
  status.textContent='Selecione e copie o código manualmente.';
 }
}
function displayCode(target,code,isPix){
 const content=el('div','');
 const heading=el('h3','qp-title',isPix?'Pagar com Pix':'Pagar com código de barras');
 const description=el('p','qp-desc',isPix?
  'Escaneie o QR Code no app do banco ou copie o Pix abaixo.':
  'Copie a linha digitável para pagar no aplicativo bancário.');
 const input=el('input','qp-code');
 input.readOnly=true;input.value=code;
 input.setAttribute('aria-label',isPix?'Pix copia e cola':'Linha digitável do código de barras');
 const b=el('button','qp-primary',isPix?'Copiar Pix':'Copiar código');
 b.type='button';
 const alert=el('p','qp-warning','Confira beneficiário e valor antes de confirmar o pagamento.');
 b.onclick=()=>copy(code,alert,input);
 content.append(heading,description,input,b,alert);
 target.appendChild(content);
}
window.invoicePaymentTab=async function(which){
 if(!active||route()!=='faturas'||!state.logged||window.realANE?.user!==active.user||!['pix','barra'].includes(which))return;
 const info=active,txn=++token;
 info.kind=which;
 const panel=document.getElementById('invoice-payment-panel');
 if(!panel)return;
 const tabPix=document.getElementById('invoice-tab-pix'),
  tabBar=document.getElementById('invoice-tab-barra');
 tabPix?.setAttribute('aria-selected',String(which==='pix'));
 tabBar?.setAttribute('aria-selected',String(which==='barra'));
 panel.classList.toggle('pix',which==='pix');
 panel.replaceChildren(el('p','qp-desc','Consultando '+(which==='pix'?'Pix':'código de barras')+' no VerSan...'));
 try{
  // Somente rota autenticada; valor e beneficiario continuam definidos pelo VerSan.
  const result=await window.realApi(which,{idFatura:info.id});
  if(active!==info||txn!==token||route()!=='faturas'||window.realANE?.user!==info.user||String(state.current)!==info.cdc||
     !panel.isConnected)return;
  const code=which==='pix'?result?.codigoPix:result?.codigoDigitavel;
  if(typeof code!=='string'||code.length<20)throw Error('O código de pagamento não foi retornado.');
  panel.replaceChildren();
  if(which==='pix'){
   const qr=el('div','qp-qr','Gerando QR Code...');const details=el('div');
   displayCode(details,code,true);panel.append(qr,details);
   try{
    const QR=await ensureQR();
    if(active!==info||txn!==token||!qr.isConnected)return;
    qr.replaceChildren();
    new QR(qr,{text:code,width:148,height:148,colorDark:'#101820',colorLight:'#ffffff',
      correctLevel:QR.CorrectLevel.M});
   }catch(ex){qr.textContent='QR Code indisponível. Utilize o Pix copia e cola.'}
  }else{
   displayCode(panel,code,false);
  }
 }catch(ex){
  if(active===info&&txn===token&&panel.isConnected)
   panel.replaceChildren(el('p','qp-warning',
    'Não foi possível consultar este meio de pagamento. Tente novamente ou consulte o atendimento.'));
 }
};
window.invoicePaymentBack=function(){
 ++token;active=null;
 if(route()==='faturas')render();
};
function removeOldPdf(){
 if(pdfURL){
  try{URL.revokeObjectURL(pdfURL)}catch{}
  pdfURL=null;pdfOwner=null;
 }
}
async function pdfBlob(data){
 let b=null;
 if(data instanceof Blob)b=data;
 else if(data&&typeof data==='object'){
  // A API documentada tambem admite Base64 em "mensagem".
  const value=typeof data.mensagem==='string'?data.mensagem:
    typeof data.base64==='string'?data.base64:
    typeof data.pdfBase64==='string'?data.pdfBase64:null;
  if(value){
   const raw=value.replace(/\s+/g,'');
   if(!/^JVBERi0[A-Za-z0-9+/]*={0,2}$/.test(raw))
    throw Error('O VerSan não retornou um PDF.');
   const decoded=atob(raw),bytes=new Uint8Array(decoded.length);
   for(let i=0;i<decoded.length;i++)bytes[i]=decoded.charCodeAt(i);
   b=new Blob([bytes],{type:'application/pdf'});
  }
 }
 if(!b||b.size<80)throw Error('O VerSan não retornou o documento PDF.');
 const header=new Uint8Array(await b.slice(0,5).arrayBuffer());
 if(String.fromCharCode(...header)!=='%PDF-')throw Error('O arquivo recebido não é um PDF.');
 return b;
}
function pdfResult(id){
 const selected=active&&route()==='faturas';
 const clicked=[...document.querySelectorAll('.inv-paid-pdf,.inv-open-row .inv-action')]
   .find(button=>button.getAttribute('onclick')==="realANEPayment('pdf',"+id+")");
 // A resposta aparece na mesma linha escolhida; a mensagem nunca fica escondida
 // depois de uma tabela extensa de outras faturas.
 const area=selected?document.querySelector('.invoice-payment-footer'):
   clicked?.closest('td')||clicked?.closest('.inv-open-row')||
   document.querySelector('.invoices-refined');
 if(!area)return null;
 let host=document.getElementById('invoice-pdf-result');
 if(host&&host.parentElement!==area){host.remove();host=null}
 if(!host){host=el('div','invoice-pdf-result');host.id='invoice-pdf-result';
   host.setAttribute('role','status');area.appendChild(host)}
 return host;
}
async function downloadPDF(id){
 const host=pdfResult(id);
 if(!host)return;
 const currentCDC=String(state.current),currentUser=window.realANE?.user;
 host.replaceChildren(el('p','qp-desc','Consultando o PDF no VerSan...'));
 try{
  const result=await window.realApi('pdf',{idFatura:id});
  const b=await pdfBlob(result);
  if(!state.logged||String(state.current)!==currentCDC||
     window.realANE?.user!==currentUser||!host.isConnected)return;
  removeOldPdf();
  pdfURL=URL.createObjectURL(b);pdfOwner={cdc:currentCDC,user:currentUser};
  const a=el('a','invoice-pdf-direct-link','Baixar PDF da fatura nº '+id);
  a.href=pdfURL;a.download='fatura-'+id+'.pdf';
  const msg=el('span','invoice-pdf-success','PDF pronto. Caso o download não comece, use o link ao lado.');
  host.replaceChildren(msg,a);
  // Tentar download normal e manter link visível caso o navegador bloqueie.
  a.click();
 }catch(ex){
  if(!host.isConnected||String(state.current)!==currentCDC)return;
  const paid=!active&&!![...document.querySelectorAll('.inv-paid-pdf')].find(button=>
   button.getAttribute('onclick')==="realANEPayment('pdf',"+id+")");
  const generic=paid?'O PDF desta fatura paga não foi disponibilizado pelo VerSan. A emissão de documentos quitados precisa ser confirmada na integração.':
   'O PDF desta fatura não foi disponibilizado pelo VerSan. Tente novamente em instantes.';
  host.replaceChildren(el('p','invoice-pdf-error',generic));
  console.warn('Falha ao receber segunda via de fatura no acesso autenticado:',ex?.message||'erro');
 }
}
// Mantem as acoes existentes em todas as demais rotas.
window.realANEPayment=function(kind,id){
 if(route()!=='faturas'||!state.logged)return previousPayment(kind,id);
 const n=secureId(id);
 if(!n)return;
 if(kind==='pdf')return downloadPDF(n);
 if(kind!=='pix'&&kind!=='barra')return previousPayment(kind,n);
 const next=capture(n,kind);
 ++token;active=next;
 render();
 return window.invoicePaymentTab(kind);
};
window.addEventListener('hashchange',()=>{
 if(route()!=='faturas'){active=null;++token;removeOldPdf()}
});
})();
