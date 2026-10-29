'use strict';
(function(){
  const installed='__anePublicOccurrenceIntroV1';
  if(window[installed])return;
  window[installed]=true;

  const storageKey='ane:av:public-occurrence-intro:v1';
  let dialog=null;
  let originalFocus=null;
  let sessionAccepted=false;
  let authenticationChecked=false;
  let authenticationPending=false;
  let authenticated=false;

  function wasAcknowledged(){
    if(sessionAccepted)return true;
    try{return window.sessionStorage?.getItem(storageKey)==='1'}catch{return false}
  }

  function rememberAcknowledgment(){
    sessionAccepted=true;
    try{window.sessionStorage?.setItem(storageKey,'1')}catch{}
  }

  function eligible(){
    return !authenticated &&
      !state.logged &&
      route()==='inicio' &&
      !wasAcknowledged() &&
      !document.getElementById('av-os-intro-overlay') &&
      !document.getElementById('av-os-overlay') &&
      !document.querySelector('.lookup.qp') &&
      !document.body.classList.contains('av-os-locked');
  }

  function close(restoreFocus){
    if(!dialog)return;
    dialog.remove();
    dialog=null;
    document.body.classList.remove('av-os-locked');
    if(restoreFocus!==false && originalFocus?.isConnected){
      try{originalFocus.focus()}catch{}
    }
    originalFocus=null;
  }

  function show(){
    if(!eligible())return;
    originalFocus=document.activeElement;
    const outer=document.createElement('div');
    outer.id='av-os-intro-overlay';
    outer.className='av-os-overlay av-os-public-intro-overlay';
    outer.innerHTML=
      '<section class="av-os-dialog av-os-intro-dialog" role="dialog" aria-modal="true" aria-labelledby="av-os-intro-title" aria-describedby="av-os-intro-description">'+
        '<div class="av-os-top"><span class="av-os-eyebrow">ATENDIMENTO À COMUNIDADE <b>PRÉVIA</b></span></div>'+
        '<div class="av-os-intro-emblem" aria-hidden="true">⌖</div>'+
        '<h2 id="av-os-intro-title">Encontrou um problema na rua?</h2>'+
        '<p id="av-os-intro-description" class="av-os-lead">Comunique vazamentos nas redes de água e esgoto ou problemas no pavimento após intervenções da concessionária.</p>'+
        '<p class="av-os-intro-no-cdc">Não é necessário informar CDC.</p>'+
        '<div class="av-os-intro-actions">'+
          '<button type="button" class="av-os-primary av-os-intro-report" data-av-os-intro="report">Comunicar ocorrência</button>'+
          '<button type="button" class="av-os-intro-dismiss" data-av-os-intro="dismiss">Agora não</button>'+
        '</div>'+
        '<p class="av-os-intro-note">A comunicação de ocorrências está em demonstração. Nenhuma ordem de serviço real será aberta nesta versão.</p>'+
      '</section>';
    document.body.appendChild(outer);
    document.body.classList.add('av-os-locked');
    dialog=outer;

    const report=outer.querySelector('[data-av-os-intro="report"]');
    const dismiss=outer.querySelector('[data-av-os-intro="dismiss"]');
    dismiss.addEventListener('click',()=>{
      rememberAcknowledgment();
      close(true);
    });
    report.addEventListener('click',()=>{
      rememberAcknowledgment();
      close(false);
      if(typeof window.avOSPreview?.openPublic==='function'){
        window.avOSPreview.openPublic();
      }else{
        document.querySelector('[data-os-open-public]')?.click();
      }
    });
    outer.addEventListener('keydown',event=>{
      if(event.key==='Escape'){
        event.preventDefault();
        rememberAcknowledgment();
        close(true);
        return;
      }
      if(event.key!=='Tab')return;
      const focused=document.activeElement;
      if(event.shiftKey && focused===report){event.preventDefault();dismiss.focus()}
      else if(!event.shiftKey && focused===dismiss){event.preventDefault();report.focus()}
    });
    report.focus();
  }

  async function afterPublicAuthenticationCheck(){
    if(authenticationChecked||authenticationPending)return;
    authenticationPending=true;
    try{
      if(typeof window.realApi==='function'){
        await window.realApi('status');
        // Status succeeded: this is an authenticated session. Let the
        // existing bridge render the customer pages instead of showing the public invitation.
        authenticated=true;
      }
    }catch(e){
      // A 401 is the expected result for guests; other errors are not
      // proof that a customer is signed out.
      if(e?.status!==401 && e?.code!=='SESSAO')authenticated=true;
    }finally{
      authenticationChecked=true;
      authenticationPending=false;
      if(eligible())show();
    }
  }

  function tryOpen(){
    if(wasAcknowledged()||state.logged||route()!=='inicio')return;
    if(authenticationChecked){if(eligible())show()}
    else void afterPublicAuthenticationCheck();
  }

  window.addEventListener('hashchange',tryOpen);
  window.addEventListener('pageshow',tryOpen);
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',tryOpen,{once:true});
  }else tryOpen();
})();
