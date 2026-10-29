'use strict';
(function(){
  // Only augments the already-approved login card. No other route or API is modified.
  const approvedAuthPage=authPage;
  const approvedHelp=window.realANEAuthHelp;
  const approvedStartLogin=startLogin;
  let firstAccessOpen=false;
  let firstAccessStep=1;

  const shield='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 20 6v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/><path d="m8 12 2.5 2.5 5-5"/></svg>';
  const back='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
  const person='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20v-2.1a7 7 0 0 1 14 0V20"/></svg>';
  const property='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 20v-6h8v6M8 9h2M14 9h2"/></svg>';

  function headerProgress(){
    return '<div class="first-progress" aria-label="Etapas do primeiro acesso">'+
      '<span class="first-progress-step'+(firstAccessStep===1?' is-current':' is-done')+'">1 <span>Identificação</span></span>'+
      '<span class="first-progress-line'+(firstAccessStep>1?' is-done':'')+'"></span>'+
      '<span class="first-progress-step'+(firstAccessStep>1?' is-current':'')+'">2 <span>Verificação</span></span>'+
      '<span class="first-progress-line"></span>'+
      '<span class="first-progress-step">3 <span>Nova senha</span></span></div>';
  }

  function firstCard(){
    let content;
    if(firstAccessStep===1){
      content='<div class="auth-final-kicker">PRIMEIRO ACESSO</div>'+
        '<h2 id="auth-final-title">Ative sua conta</h2>'+
        '<p class="auth-final-intro">Identifique-se para iniciar seu acesso à Agência Virtual da ANE.</p>'+
        headerProgress()+
        '<form class="auth-final-form" onsubmit="firstAccessNext(event)" novalidate>'+
        '<label for="first-doc">CPF ou CNPJ</label>'+
        '<div class="auth-final-input-row">'+person+
        '<input id="first-doc" name="documento" type="text" inputmode="numeric" autocomplete="username" maxlength="18" placeholder="000.000.000-00" oninput="realANEFormatDocumento(this)" required>'+
        '</div>'+
        '<label for="first-cdc">Matrícula (CDC) de um dos seus imóveis</label>'+
        '<div class="auth-final-input-row">'+property+
        '<input id="first-cdc" name="cdc" type="text" inputmode="numeric" maxlength="10" pattern="[0-9]*" autocomplete="off" placeholder="Digite sua matrícula" required>'+
        '</div>'+
        '<div class="first-notice">'+shield+
        '<p>A criação da senha exigirá confirmação de identidade para proteger seus dados e imóveis.</p>'+
        '</div>'+
        '<div id="first-error" class="auth-final-error" role="alert" hidden></div>'+
        '<button class="auth-final-submit" type="submit">Continuar <span aria-hidden="true">→</span></button>'+
        '</form>';
    }else{
      content='<div class="auth-final-kicker">PRIMEIRO ACESSO</div>'+
        '<h2 id="auth-final-title">Confirme sua identidade</h2>'+
        '<p class="auth-final-intro">Antes de permitir a criação de uma senha, precisamos confirmar que o acesso pertence ao consumidor autorizado.</p>'+
        headerProgress()+
        '<div class="first-next-card">'+shield+
        '<strong>Verificação adicional necessária</strong>'+
        '<p>Estamos definindo com o VerSan um procedimento seguro de confirmação de identidade. Esta etapa ainda não está disponível.</p>'+
        '</div>'+
        '<p class="first-activation-note">Nenhuma senha foi criada ou alterada. Seus dados não foram enviados ao VerSan nesta etapa.</p>'+
        '<button class="auth-final-submit" disabled type="button">Concluir ativação · Indisponível</button>'+
        '<button type="button" class="first-back" onclick="firstAccessPrevious()">'+back+' Voltar à identificação</button>';
    }
    content+='<button type="button" class="first-to-login" onclick="firstAccessCancel()">Já tenho senha · Voltar ao login</button>';
    return '<section class="auth-final-card first-access-card" aria-labelledby="auth-final-title">'+content+'</section>';
  }

  authPage=function(){
    const existing=approvedAuthPage();
    if(!firstAccessOpen)return existing;
    const regex=/<section class="auth-final-card"[\s\S]*?<\/section>/;
    if(!regex.test(existing)){
      console.error('Primeiro acesso: estrutura de login indisponível');
      return existing;
    }
    return existing.replace(regex,firstCard());
  };

  window.realANEAuthHelp=function(kind){
    if(kind!=='primeiro')return approvedHelp(kind);
    // First access currently uses the same existing VerSan login as any other access.
    // Do not present a nonfunctional identity-verification or password-reset workflow.
    firstAccessOpen=false;
    firstAccessStep=1;
    const box=document.getElementById('auth-final-help');
    if(!box)return;
    box.textContent='Para o primeiro acesso, informe CPF/CNPJ e a senha inicial do VerSan (os quatro últimos dígitos do documento). Depois clique em Entrar. Se já alterou a senha, utilize sua senha atual.';
    box.hidden=false;
  };

  startLogin=function(){
    firstAccessOpen=false;
    firstAccessStep=1;
    return approvedStartLogin();
  };

  window.firstAccessCancel=function(){
    firstAccessOpen=false;firstAccessStep=1;render();
    document.getElementById('cpf')?.focus();
  };
  window.firstAccessPrevious=function(){firstAccessStep=1;render()};

  function validCPF(s){
    if(s.length!==11||/^(\d)\1+$/.test(s))return false;
    for(let length=9;length<11;length++){
      const total=[...s.slice(0,length)].reduce((acc,ch,i)=>acc+Number(ch)*(length+1-i),0);
      const digit=(total*10)%11%10;
      if(digit!==Number(s[length]))return false;
    }
    return true;
  }
  function validCNPJ(s){
    if(s.length!==14||/^(\d)\1+$/.test(s))return false;
    const weights=[[5,4,3,2,9,8,7,6,5,4,3,2],[6,5,4,3,2,9,8,7,6,5,4,3,2]];
    for(let pos=12;pos<14;pos++){
      const total=weights[pos-12].reduce((sum,n,i)=>sum+n*Number(s[i]),0);
      const remainder=total%11;
      const digit=remainder<2?0:11-remainder;
      if(Number(s[pos])!==digit)return false;
    }
    return true;
  }

  window.firstAccessNext=function(event){
    event.preventDefault();
    const doc=document.getElementById('first-doc')?.value.replace(/\D/g,'')||'';
    const cdc=document.getElementById('first-cdc')?.value.trim()||'';
    const error=document.getElementById('first-error');
    const warning=(message)=>{
      if(error){error.hidden=false;error.textContent=message}
    };
    if(!(validCPF(doc)||validCNPJ(doc))){
      warning('Confira o CPF ou CNPJ informado.');return;
    }
    if(!/^\d{1,10}$/.test(cdc)||Number(cdc)===0){
      warning('Informe um CDC numérico válido, como aparece na sua fatura.');return;
    }
    // Identity has NOT been verified here. Never treat this local check as authorization.
    // Do not send, retain, or log the entered CPF/CNPJ or CDC.
    firstAccessStep=2;
    render();
  };

  window.addEventListener('hashchange',()=>{
    if(route()!=='entrar'){firstAccessOpen=false;firstAccessStep=1}
  });
})();
