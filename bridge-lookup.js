'use strict';
(function(){
 const approvedHeader=header;
 header=function(){
  return approvedHeader().replace('VERSÃO DEMONSTRATIVA','HOMOLOGAÇÃO ANE');
 };
 const approvedHome=publicHome;
 publicHome=function(){
  return approvedHome()
   .replace('Informe apenas a matrícula para consultar suas faturas disponíveis.','Informe a matrícula; por segurança, confirme seu CPF e senha para consultar as faturas reais.')
   .replace('Não precisa fazer login','Acesso protegido por CPF e senha');
 };
 let pendingCDC=null, selecting=false;
 const approvedActivation=window.realANEActivate;
 async function selectCDC(cdc){
  if(selecting)return;
  if(!state.logged){
   pendingCDC=cdc;
   startLogin();
   return;
  }
  const owner=window.realANE?.user?.imoveis;
  if(!Array.isArray(owner)||!owner.some(p=>String(p.cdc)===cdc)){
   toast('O CDC '+cdc+' não consta entre os imóveis vinculados ao seu acesso.');
   change('imoveis');
   return;
  }
  selecting=true;
  try{
   const updated=await window.realApi('selecionar',{cdc});
   window.realANE.user=updated;
   window.realANE.cache?.clear();
   window.realANE.pending?.clear();
   state.current=String(updated.cdcSelecionado);
   change('faturas');
  }catch(e){
   if(e.status===401){
    state.logged=false;
    pendingCDC=cdc;
    toast('Sua sessão expirou. Entre novamente.');
    startLogin();
   }else{
    toast('Não foi possível consultar o CDC '+cdc+': '+e.message);
   }
  }finally{selecting=false}
 }
 window.realANEActivate=function(data){
  const value=approvedActivation(data);
  if(pendingCDC!==null){
   const requested=pendingCDC;
   pendingCDC=null;
   Promise.resolve().then(()=>selectCDC(requested));
  }
  return value;
 };
 lookup=function(){
  const input=document.getElementById('cdc');
  const out=document.getElementById('lookup-out');
  const raw=String(input?.value||'').trim();
  if(!/^\d{1,10}$/.test(raw)||Number(raw)<1){
   if(out){out.style.display='block';out.textContent='Informe um CDC numérico válido para iniciar a consulta.'}
   return;
  }
  const cdc=String(Number(raw));
  if(!state.logged){
   pendingCDC=cdc;
   startLogin();
  }else{
   pendingCDC=null;
   void selectCDC(cdc);
  }
 };
})();