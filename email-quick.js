'use strict';
(function(){
const css='#qpe-shade[hidden]{display:none!important}#qpe-shade{position:fixed;inset:0;z-index:9999;background:rgba(11,38,67,.57);display:flex;align-items:center;justify-content:center;padding:18px}#qpe-window{box-sizing:border-box;width:min(100%,450px);max-height:94vh;overflow-y:auto;background:#fff;border-radius:16px;padding:25px;box-shadow:0 20px 70px rgba(7,33,64,.28);font-family:Ubuntu,Verdana,Tahoma,Arial,sans-serif;color:#1c4164}#qpe-window h2{font-size:21px;color:#1d4696;line-height:1.25;letter-spacing:-.025em;margin:0;font-weight:800}#qpe-window .qpe-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}#qpe-window .qpe-close{background:#eaf4fb;border:0;border-radius:8px;color:#1d4696;width:32px;height:32px;cursor:pointer;font-size:21px}#qpe-window .qpe-desc{font-size:12px;line-height:1.65;color:#6d8498;margin:10px 0 16px}#qpe-window .qpe-number{background:#eff7fc;border:1px solid #d9eaf4;border-radius:9px;padding:12px;display:flex;justify-content:space-between;font-size:12px;margin-bottom:17px;color:#516e86}#qpe-window .qpe-number strong{color:#1d4696}#qpe-window label.qpe-label{display:block;font-weight:800;font-size:12px;margin:0 0 7px}#qpe-window input[type=email]{box-sizing:border-box;width:100%;height:44px;border-radius:8px;border:1px solid #cbdfe9;font:500 13px Ubuntu,Verdana,Tahoma,Arial,sans-serif;padding:0 12px;background:#fff;color:#24445e}#qpe-window input[type=email]:focus{outline:2px solid #8fcbe8;outline-offset:1px}#qpe-window .qpe-note{font-size:11px;color:#69839b;line-height:1.5;margin:7px 0 15px}#qpe-window .qpe-accept{font-size:11px;line-height:1.55;color:#45647e;display:flex;gap:8px;align-items:flex-start;cursor:pointer;margin-bottom:18px}#qpe-window .qpe-accept input{accent-color:#1d4696;flex:none;margin-top:3px}#qpe-window .qpe-actions{display:flex;gap:10px}#qpe-window .qpe-actions button{border:0;border-radius:8px;min-height:43px;font:800 12px Ubuntu,Verdana,Tahoma,Arial,sans-serif;cursor:pointer}#qpe-window .qpe-cancel{background:#eaf4fb;color:#1d4696;flex:1}#qpe-window .qpe-submit{background:#326cc4;color:white;flex:2}#qpe-window .qpe-submit:disabled{opacity:.6;cursor:wait}#qpe-window .qpe-result{font-size:12px;line-height:1.5;color:#a13c27;margin-top:13px}#qpe-window .qpe-result[data-ok=true]{color:#147353}#app .qp-footer .qpe-enabled{cursor:pointer}@media(max-width:500px){#qpe-window{padding:20px;border-radius:12px}}';
const style=document.createElement('style');style.id='qpe-style';style.textContent=css;document.head.appendChild(style);
let shade=null,current=null,returnFocus=null,busy=false,oldOverflow='';
function ensureModal(){
 if(shade)return shade;
 shade=document.createElement('div');shade.id='qpe-shade';shade.hidden=true;
 shade.innerHTML='<section id="qpe-window" role="dialog" aria-modal="true" aria-labelledby="qpe-title"><div class="qpe-head"><h2 id="qpe-title">Enviar fatura por e-mail</h2><button class="qpe-close" aria-label="Fechar" type="button">×</button></div><p class="qpe-desc">Esta segunda via será enviada com os dados pessoais ofuscados. O envio é pontual e não altera seu cadastro.</p><div class="qpe-number"><span>Fatura selecionada</span><strong></strong></div><form class="qpe-form"><label class="qpe-label" for="qpe-email">Endereço de e-mail</label><input id="qpe-email" name="email" type="email" maxlength="254" placeholder="Digite o e-mail" autocomplete="email" required><p class="qpe-note">Confira o endereço antes de solicitar o envio.</p><label class="qpe-accept"><input type="checkbox" name="confirm" required><span>Confirmo que desejo receber esta fatura no endereço informado.</span></label><div class="qpe-actions"><button type="button" class="qpe-cancel">Cancelar</button><button type="submit" class="qpe-submit">Enviar fatura</button></div><p class="qpe-result" role="status" aria-live="polite"></p></form></section>';
 document.body.appendChild(shade);
 shade.querySelector('.qpe-close').onclick=close;shade.querySelector('.qpe-cancel').onclick=close;
 shade.addEventListener('click',event=>{if(event.target===shade)close()});
 shade.querySelector('form').addEventListener('submit',submit);
 document.addEventListener('keydown',event=>{if(!shade.hidden&&event.key==='Escape'&&!busy){event.preventDefault();close()}});
 return shade;
}
function invoiceFrom(button){
 const card=button.closest('.lookup.qp');
 const text=card?.querySelector('.qp-id')?.textContent||'';
 const id=text.match(/Fatura\s*n[º°o]\s*(\d{1,12})/i)?.[1]||'';
 const cells=[...(card?.querySelectorAll('.qp-summary > div')||[])];
 const part=cells.find(el=>/Matr[ií]cula\s*\(CDC\)/i.test(el.querySelector('small')?.textContent||''));
 const cdc=part?.querySelector('strong')?.textContent?.trim()||'';
 if(!/^\d{1,10}$/.test(cdc)||!/^\d{1,12}$/.test(id))return null;
 return{cdc,idFatura:id};
}
function open(button){
 const doc=invoiceFrom(button);
 if(!doc){const desc=button.closest('.qp-footer')?.querySelector('.qp-desc');if(desc)desc.textContent='Não foi possível identificar a fatura. Consulte novamente.';return;}
 current=doc;returnFocus=button;
 const m=ensureModal();const f=m.querySelector('form');f.reset();
 m.querySelector('.qpe-number strong').textContent='Nº '+doc.idFatura;
 const status=m.querySelector('.qpe-result');status.textContent='';status.removeAttribute('data-ok');
 m.querySelector('.qpe-submit').disabled=false;m.querySelector('.qpe-submit').textContent='Enviar fatura';
 oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';m.hidden=false;
 m.querySelector('#qpe-email').focus();
}
function close(){
 if(!shade||busy)return;
 shade.hidden=true;current=null;document.body.style.overflow=oldOverflow;
 if(returnFocus?.isConnected)returnFocus.focus();
}
async function submit(event){
 event.preventDefault();
 if(busy||!current)return;
 const form=event.currentTarget;if(!form.reportValidity())return;
 const status=form.querySelector('.qpe-result'),send=form.querySelector('.qpe-submit');
 const email=form.elements.email.value.trim();
 busy=true;send.disabled=true;send.textContent='Enviando...';status.removeAttribute('data-ok');
 status.textContent='Solicitando envio ao servidor...';
 try{
  const response=await fetch('/api/versan/enviar-fatura-email',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},body:JSON.stringify({...current,email}),signal:AbortSignal.timeout(35000)});
  let result={};try{result=await response.json()}catch{}
  if(!response.ok||!result.ok)throw Error(result.mensagem||'Envio indisponível. Tente novamente mais tarde.');
  status.textContent='Envio aceito pelo servidor de e-mail. Confira a caixa de entrada e o spam.';
  status.setAttribute('data-ok','true');
  send.textContent='Solicitação enviada';
 }catch(ex){
  status.textContent=ex?.name==='TimeoutError'?'O servidor demorou. Confira seu e-mail antes de tentar novamente.':ex.message;
 }finally{
  busy=false;
  if(!status.hasAttribute('data-ok')){send.disabled=false;send.textContent='Enviar fatura'}
 }
}
function enhance(){
 for(const button of document.querySelectorAll('.lookup.qp .qp-footer .qp-download')){
  if(button.dataset.qpeBound||!button.textContent.includes('Enviar fatura por e-mail'))continue;
  button.dataset.qpeBound='1';button.disabled=false;
  button.classList.add('qpe-enabled');button.removeAttribute('aria-disabled');button.removeAttribute('title');
  button.setAttribute('aria-label','Enviar fatura ofuscada por e-mail');button.textContent='✉ Enviar fatura por e-mail';
  button.addEventListener('click',()=>open(button));
 }
}
function start(){const app=document.querySelector('#app');if(!app)return;enhance();new MutationObserver(enhance).observe(app,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
