'use strict';
(function(){
  const mark='__avOsNoticePreview2026';
  if(window[mark])return;
  window[mark]=true;
  const closed=new Set();
  let overlay=null,sourceFocus=null,position=null;
  const safe=(x)=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const cdcKey=(cdc)=>'EXEMPLO-OS-001:'+String(cdc||'');
  function attach(html,cls){
    dismiss();
    sourceFocus=document.activeElement;
    overlay=document.createElement('div');
    overlay.id='av-os-overlay';overlay.className='av-os-overlay';
    overlay.innerHTML='<div class="av-os-dialog '+(cls||'')+'" role="dialog" aria-modal="true" aria-labelledby="av-os-title">'+html+'</div>';
    document.body.appendChild(overlay);
    document.body.classList.add('av-os-locked');
    const close=overlay.querySelector('[data-os-close]');
    if(close)close.focus();
  }
  function dismiss(){
    if(!overlay)return;
    overlay.remove();overlay=null;document.body.classList.remove('av-os-locked');
    try{sourceFocus?.focus()}catch{}
  }
  function showExample(cdc){
    const key=cdcKey(cdc);
    if(closed.has(key))return;
    const html='<div class="av-os-top"><span class="av-os-eyebrow">AVISO DE SERVIÇO <b>DEMONSTRAÇÃO</b></span><button type="button" data-os-close="example" class="av-os-x" aria-label="Fechar aviso">×</button></div>'+
      '<div class="av-os-hero-icon" aria-hidden="true">!</div>'+
      '<h2 id="av-os-title">Há um serviço em andamento nas proximidades</h2>'+
      '<p class="av-os-lead">Nossa equipe está realizando uma atividade que pode afetar a sua região.</p>'+
      '<div class="av-os-detail"><strong>Exemplo: manutenção na rede de abastecimento</strong><span><i></i> Em execução</span></div>'+
      '<p class="av-os-disclaimer">Esta é uma prévia visual. Nenhuma ordem de serviço real foi consultada. O aviso só será ativado quando o VerSan confirmar a localização e a situação da ocorrência.</p>'+
      '<div class="av-os-actions"><button type="button" data-os-close="example" class="av-os-primary">Entendi, fechar aviso</button></div>';
    attach(html,'av-os-warning');
    overlay.dataset.cdcKey=key;
  }
  function promo(){
    return '<section class="av-os-promo" aria-label="Comunicar problema na via pública">'+
       '<div class="av-os-promo-symbol" aria-hidden="true">📍</div>'+
       '<div class="av-os-promo-text"><span>ATENDIMENTO À COMUNIDADE</span><h2>Encontrou um problema na rua?</h2>'+
       '<p>Comunique um vazamento na rede ou um problema no pavimento após intervenção da concessionária. Não é necessário informar CDC.</p></div>'+
       '<button type="button" class="av-os-cta" data-os-open-public="1">Comunicar ocorrência <span aria-hidden="true">↗</span></button>'+
       '</section>';
  }
  function publicScreen(){
    position=null;
    const html='<div class="av-os-top"><span class="av-os-eyebrow">COMUNICAÇÃO DE OCORRÊNCIA <b>PRÉVIA</b></span><button type="button" data-os-close="public" class="av-os-x" aria-label="Fechar formulário">×</button></div>'+
      '<h2 id="av-os-title">O que está acontecendo?</h2>'+
      '<p class="av-os-lead">Ajude-nos a identificar o problema e seu local. Primeiro verificaremos se já existe atendimento aberto na região.</p>'+
      '<form id="av-os-public-form" class="av-os-form">'+
        '<label for="av-os-type">Tipo de ocorrência</label>'+
        '<select id="av-os-type" required><option value="">Selecione</option><option>Vazamento na rede de água</option><option>Vazamento de esgoto</option><option>Pavimento após intervenção da concessionária</option><option>Outro problema na infraestrutura de água ou esgoto</option></select>'+
        '<div class="av-os-loc-row"><span>Onde está acontecendo?</span><button type="button" data-os-locate="1">⌖ Usar minha localização</button></div>'+
        '<div id="av-os-location-feedback" class="av-os-help" role="status">Você também pode informar o endereço manualmente.</div>'+
        '<div class="av-os-fields"><div><label for="av-os-street">Rua ou avenida</label><input id="av-os-street" maxlength="120" autocomplete="street-address" placeholder="Ex.: Rua das Flores"></div><div><label for="av-os-number">Número ou referência</label><input id="av-os-number" maxlength="65" placeholder="Número, esquina ou referência"></div></div>'+
        '<label for="av-os-district">Bairro</label><input id="av-os-district" maxlength="75" placeholder="Informe o bairro">'+
        '<label for="av-os-description">Descrição (opcional)</label><textarea id="av-os-description" rows="2" maxlength="350" placeholder="Descreva o que observou"></textarea>'+
        '<div class="av-os-disclaimer">Demonstração de interface: ainda não há consulta de OS nem abertura de protocolo nesta prévia. A localização será solicitada somente se você clicar no botão acima.</div>'+
        '<p class="av-os-help" id="av-os-form-feedback" role="status"></p>'+
        '<button type="submit" class="av-os-primary av-os-submit">Verificar atendimento existente</button>'+
      '</form>';
    attach(html,'av-os-form-dialog');
    const form=overlay.querySelector('#av-os-public-form');
    form.addEventListener('submit',e=>{
      e.preventDefault();
      const kind=form.querySelector('#av-os-type').value;
      const street=form.querySelector('#av-os-street').value.trim();
      const district=form.querySelector('#av-os-district').value.trim();
      const output=form.querySelector('#av-os-form-feedback');
      if(!kind){output.textContent='Selecione o tipo de ocorrência.';return}
      if(!position&&!street&&!district){output.textContent='Autorize a localização ou informe rua e bairro.';return}
      output.textContent='Prévia concluída. Na integração definitiva, o VerSan verificará serviços no local antes de permitir o registro. Nenhuma OS foi aberta.';
    });
  }
  function locate(){
    const feedback=overlay?.querySelector('#av-os-location-feedback');
    if(!feedback)return;
    if(!navigator.geolocation){feedback.textContent='Localização indisponível. Informe o endereço manualmente.';return}
    feedback.textContent='Solicitando autorização de localização ao navegador…';
    navigator.geolocation.getCurrentPosition(
      pos=>{position={latitude:pos.coords.latitude,longitude:pos.coords.longitude};if(feedback.isConnected)feedback.textContent='Localização autorizada nesta prévia. Nenhum dado foi transmitido ao VerSan.'},
      ()=>{position=null;if(feedback.isConnected)feedback.textContent='Não foi possível obter a localização. Informe o endereço manualmente.'},
      {enableHighAccuracy:false,timeout:12000,maximumAge:60000}
    );
  }
  document.addEventListener('click',e=>{
    const close=e.target.closest?.('[data-os-close]');
    if(close&&overlay?.contains(close)){
      const key=overlay.dataset.cdcKey;
      if(key)closed.add(key);
      dismiss();return;
    }
    if(e.target.closest?.('[data-os-open-public]')){publicScreen();return}
    if(e.target.closest?.('[data-os-locate]')){locate()}
  });
  const home=publicHome;
  publicHome=function(){const markup=home.apply(this,arguments);return markup.replace('</main>',promo()+'</main>')};
  const publicCatalog=publicServices;
  publicServices=function(){const markup=publicCatalog.apply(this,arguments);return markup.replace('</main>',promo()+'</main>')};
  const activate=window.realANEActivate;
  if(typeof activate==='function'){
    window.realANEActivate=function(data){
      const result=activate.apply(this,arguments);
      setTimeout(()=>{
        if(state.logged&&route()==='painel'&&state.current)showExample(state.current);
      },200);
      return result;
    };
  }
  const select=pickProperty;
  pickProperty=async function(cdc){
    const result=await select.apply(this,arguments);
    if(state.logged&&String(state.current)===String(cdc)&&route()==='painel')setTimeout(()=>showExample(cdc),80);
    return result;
  };
  const previousLogout=logOut;
  logOut=async function(){
    closed.clear();position=null;dismiss();
    return previousLogout.apply(this,arguments);
  };
  window.avOSPreview={showExample:()=>showExample(state.current||'EXEMPLO'),openPublic:publicScreen};
  if(!state.logged&&route()==='inicio')render();
})();
