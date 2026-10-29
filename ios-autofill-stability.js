'use strict';
(function(){
  if(window.__aneIosAutofillViewportFix)return;
  window.__aneIosAutofillViewportFix=true;

  function resetHorizontalViewport(){
    const page=location.hash.split('?')[0];
    if(page!=='#imoveis'&&page!=='#painel')return;
    document.documentElement.scrollLeft=0;
    document.body.scrollLeft=0;
    try{window.scrollTo({left:0,top:0,behavior:'instant'})}
    catch{window.scrollTo(0,0)}
  }

  // When iOS completes password autofill, blur the active field before
  // the existing authentication handler swaps the login view for the
  // properties page. Password manager and Face ID remain enabled.
  document.addEventListener('submit',event=>{
    if(!event.target?.matches?.('#app .auth-final-form'))return;
    const current=document.activeElement;
    if(current?.matches?.('#cpf, #senha'))current.blur();
  },true);

  // The existing renderer resets the vertical position after login but
  // leaves the horizontal visual viewport offset untouched in some iOS
  // embedded browsers. Re-align only on authenticated route transitions.
  window.addEventListener('hashchange',()=>{
    const page=location.hash.split('?')[0];
    if(page!=='#imoveis'&&page!=='#painel')return;
    requestAnimationFrame(()=>{
      resetHorizontalViewport();
      requestAnimationFrame(resetHorizontalViewport);
    });
    // iOS password sheet may finish its own viewport transition later.
    window.setTimeout(resetHorizontalViewport,180);
  });
})();
