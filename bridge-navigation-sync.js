'use strict';
(function(){
  if(window.__aneNavigationSyncV1)return;
  window.__aneNavigationSyncV1=true;
  const app=document.getElementById('app');
  if(!app)return;
  const previousNavBottom=navBottom;
  let scheduled=false;

  function serviceSectionIsCurrent(){
    const target=app.querySelector('.public-section');
    if(!target)return false;
    const rect=target.getBoundingClientRect();
    const top=app.querySelector('.topbar')?.getBoundingClientRect().height||66;
    return rect.top<=top+36&&rect.bottom>top+36;
  }

  function activeDestination(){
    const view=route();
    if(!state.logged&&view==='inicio'){
      // Public second-copy lookup is an in-page flow; the URL remains #inicio.
      if(app.querySelector('.lookup.qp'))return 'faturas';
      if(serviceSectionIsCurrent())return 'servicos';
      return 'inicio';
    }
    if(view==='painel'||view==='inicio')return 'inicio';
    if(view==='faturas'||view==='entrega')return 'faturas';
    if(view==='servicos'||view==='documentos'||view==='protocolos')return 'servicos';
    if(view==='consumo')return 'consumo';
    if(view==='perfil'||view==='conta'||view==='imoveis')return 'conta';
    return null;
  }

  function refreshBottomNavigation(){
    const current=activeDestination();
    for(const button of app.querySelectorAll('.bottom-nav button')){
      const match=String(button.getAttribute('onclick')||'').match(/navBottom\(['"]([a-z]+)['"]\)/);
      if(!match)continue;
      const active=Boolean(current&&match[1]===current);
      button.classList.toggle('active',active);
      if(active)button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    }
  }

  function refreshLogout(){
    const logged=Boolean(state.logged);
    document.body.classList.toggle('av-nav-logged',logged);
    if(!logged)return;
    const action=app.querySelector('.topbar .header-action');
    if(!action||action.querySelector('.av-nav-logout'))return;
    const button=document.createElement('button');
    button.type='button';
    button.className='av-nav-logout';
    button.textContent='Sair';
    button.setAttribute('aria-label','Sair da minha conta');
    button.addEventListener('click',async()=>{
      if(button.disabled)return;
      button.disabled=true;
      try{await logOut()}
      finally{button.disabled=false;schedule()}
    });
    action.appendChild(button);
  }

  function refresh(){
    refreshLogout();
    refreshBottomNavigation();
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;refresh()});
  }

  // Public Faturas must lead to the public CDC lookup, not force a login.
  navBottom=function(key){
    if(key==='faturas'&&!state.logged){
      if(route()==='inicio'&&app.querySelector('.lookup.qp'))return;
      if(typeof window.openPublicInvoice==='function')return window.openPublicInvoice();
      return gotoPublic();
    }
    return previousNavBottom.apply(this,arguments);
  };

  new MutationObserver(schedule).observe(app,{subtree:true,childList:true});
  window.addEventListener('hashchange',schedule);
  window.addEventListener('scroll',schedule,{passive:true});
  window.addEventListener('resize',schedule,{passive:true});
  schedule();
})();
