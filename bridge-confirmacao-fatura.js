'use strict';
(function(){
 const root=document.getElementById('app');if(!root)return;
 const endpoint='/api/versan/conferencia-fatura';
 const sanitize=el=>String(el?.textContent||'').trim();
 function findInvoice(summary){
  const card=summary.closest('.lookup.qp');
  if(!card)return null;
  const header=card.querySelector('.qp-id');
  const id=String(header?.textContent||'').match(/Fatura\s*n[°ºo]?\s*(\d{1,12})/i)?.[1];
  const cell=Array.from(summary.children).find(x=>/matr[ií]cula\s*\(cdc\)/i.test(sanitize(x.querySelector('small'))));
  const cdc=sanitize(cell?.querySelector('strong'));
  if(!/^[1-9]\d{0,9}$/.test(cdc)||!/^[1-9]\d{0,11}$/.test(id||''))return null;
  return {card,cdc,id};
 }
 function makeCard(){
  const section=document.createElement('section');
  section.className='av-confirmacao-dados';
  section.setAttribute('aria-label','Conferência do titular e endereço antes do pagamento');
  const icon=document.createElement('div');icon.className='av-confirmacao-icon';icon.setAttribute('aria-hidden','true');icon.textContent='⌂';
  const details=document.createElement('div');details.className='av-confirmacao-details';
  const status=document.createElement('p');status.className='av-confirmacao-status';status.setAttribute('role','status');status.textContent='Consultando identificação da fatura...';
  const footer=document.createElement('p');footer.className='av-confirmacao-footer';footer.textContent='Dados exibidos parcialmente para conferência antes do pagamento.';
  details.append(status,footer);section.append(icon,details);
  return {section,details,status,footer};
 }
 function renderValue(label,value){
  const div=document.createElement('div');div.className='av-confirmacao-field';
  const small=document.createElement('span');small.className='av-confirmacao-label';small.textContent=label;
  const b=document.createElement('strong');b.className='av-confirmacao-value';b.textContent=value;
  div.append(small,b);return div;
 }
 function fillCard(info,answer){
  if(!info.section.isConnected)return;
  info.status.remove();
  if(answer?.ok&&typeof answer.titularOfuscado==='string'&&typeof answer.enderecoOfuscado==='string'){
   info.details.insertBefore(renderValue('Titular',answer.titularOfuscado),info.footer);
   info.details.insertBefore(renderValue('Endereço',answer.enderecoOfuscado),info.footer);
  }else{
   const message=document.createElement('p');message.className='av-confirmacao-status';
   message.textContent='Nome e endereço indisponíveis no momento. Confira a segunda via antes de efetuar o pagamento.';
   info.details.insertBefore(message,info.footer);
   info.footer.textContent='Se houver dúvidas, confirme a matrícula com o responsável pela conta.';
  }
 }
 async function bind(summary){
  if(summary.dataset.avConferencia==='1')return;
  const data=findInvoice(summary);
  if(!data)return;
  summary.dataset.avConferencia='1';
  const info=makeCard();
  summary.insertAdjacentElement('afterend',info.section);
  try{
   const res=await fetch(endpoint,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({cdc:data.cdc,idFatura:data.id}),signal:AbortSignal.timeout(33000)});
   const body=await res.json();
   fillCard(info,res.ok?body:null);
  }catch{fillCard(info,null)}
 }
 let timer=null;
 const refresh=()=>{
  if(timer)return;
  timer=requestAnimationFrame(()=>{
   timer=null;
   for(const summary of root.querySelectorAll('.lookup.qp .qp-summary'))void bind(summary);
  });
 };
 new MutationObserver(refresh).observe(root,{childList:true,subtree:true});
 refresh();
})();
