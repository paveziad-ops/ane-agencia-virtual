'use strict';
(function(){
  const approvedLoginHeader=header;
  authPage=function(){
    const safeHeader=approvedLoginHeader().replace(/<span class="demo-label">[\s\S]*?<\/span>/,'');
    const err=window.realANE?.error?'<div class="auth-final-error" role="alert">'+esc(window.realANE.error)+'</div>':'';
    const loading=Boolean(window.realANE?.busy);
    const personIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20v-2.1a7 7 0 0 1 14 0V20"/></svg>';
    const lockIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 15v2"/></svg>';
    const eyeIcon='<svg class="eye-open" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12S5.5 6 12 6s10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="3"/></svg><svg class="eye-closed" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6.5 0 10 6 10 6a16 16 0 0 1-3.1 3.6M6 8c-2.7 1.8-4 4-4 4s3.5 6 10 6c1.9 0 3.5-.5 4.8-1.1M10 10a3 3 0 0 0 4 4"/></svg>';
    const drop='<svg class="auth-final-watermark" viewBox="0 0 560 680" aria-hidden="true" focusable="false"><path class="auth-drop-outline" d="M255 30C179 136 68 284 32 392C-19 544 80 645 258 651C416 652 518 560 480 405C452 294 337 138 255 30Z"/><path class="auth-drop-fill" d="M300 163C218 281 120 388 79 488C-9 699 245 750 410 621C479 561 435 434 400 357C368 291 329 214 300 163Z"/></svg>';
    return safeHeader+
      '<main class="auth-final-page">'+drop+
      '<div class="auth-final-content"><div class="auth-final-hero"><div class="auth-final-hero-logo">'+logo(true)+'</div>'+
      '<h1>Seu atendimento começa aqui.</h1>'+
      '<p>Identificação simples, dados protegidos e acesso aos seus imóveis.</p></div>'+
      '<section class="auth-final-card" aria-labelledby="auth-final-title">'+
      '<div class="auth-final-kicker">ENTRAR NA MINHA CONTA</div>'+
      '<h2 id="auth-final-title">Acesse seus imóveis</h2>'+
      '<p class="auth-final-intro">Use o CPF/CNPJ e sua senha cadastrada no VerSan. Seus imóveis serão identificados automaticamente.</p>'+
      '<form onsubmit="realANELogin(event)" class="auth-final-form">'+
      '<label for="cpf">CPF ou CNPJ</label>'+
      '<div class="auth-final-input-row">'+personIcon+
      '<input id="cpf" name="documento" type="text" inputmode="numeric" autocomplete="username" maxlength="18" placeholder="000.000.000-00" oninput="realANEFormatDocumento(this)" required>'+
      '</div>'+
      '<label for="senha">Senha</label>'+
      '<div class="auth-final-input-row">'+lockIcon+
      '<input id="senha" name="senha" type="password" placeholder="Sua senha" autocomplete="current-password" required>'+
      '<button type="button" class="auth-final-eye" aria-label="Mostrar senha" aria-pressed="false" onclick="realANEToggleSenha(this)">'+eyeIcon+'</button></div>'+
      '<div class="auth-final-links">'+
      '<button type="button" class="auth-final-link" onclick="realANEAuthHelp(&quot;recuperar&quot;)">'+lockIcon+' Esqueci minha senha</button>'+
      '<button type="button" class="auth-final-link" onclick="realANEAuthHelp(&quot;primeiro&quot;)">'+personIcon+' Primeiro acesso</button>'+
      '</div>'+
      '<div class="auth-final-help" id="auth-final-help" hidden role="status" aria-live="polite"></div>'+
      err+
      '<button type="submit" id="realANEButton" class="auth-final-submit" '+(loading?'disabled':'')+'>'+
      (loading?'Autenticando...':'Entrar e acessar meus imóveis <span aria-hidden="true">→</span>')+'</button>'+
      '</form></section></div></main>'+bottom();
  };
  window.realANEToggleSenha=function(button){
    const input=document.getElementById('senha');
    if(!input)return;
    const visible=input.type==='password';
    input.type=visible?'text':'password';
    button.setAttribute('aria-pressed',visible?'true':'false');
    button.setAttribute('aria-label',visible?'Ocultar senha':'Mostrar senha');
  };
  window.realANEFormatDocumento=function(input){
    const before=String(input.value||'');
    const digits=before.replace(/\D/g,'').slice(0,14);
    let formatted;
    if(digits.length<=11){
      formatted=digits.replace(/^(\d{3})(\d)/,'$1.$2')
        .replace(/^(\d{3})\.(\d{3})(\d)/,'$1.$2.$3')
        .replace(/\.(\d{3})(\d)/,'.$1-$2');
    }else{
      formatted=digits.replace(/^(\d{2})(\d)/,'$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3')
        .replace(/\.(\d{3})(\d)/,'.$1/$2')
        .replace(/(\d{4})(\d)/,'$1-$2');
    }
    if(input.value!==formatted)input.value=formatted;
  };
  window.realANEAuthHelp=function(kind){
    const box=document.getElementById('auth-final-help');
    if(!box)return;
    box.textContent=kind==='recuperar'?
      'A recuperação de senha ainda não está disponível neste canal. Para orientações, procure os canais oficiais de atendimento.':
      'O cadastro de primeiro acesso depende da integração com o VerSan. Para orientações, procure os canais oficiais de atendimento.';
    box.hidden=false;
  };
  if(route()==='entrar' && !state.logged)render();
})();