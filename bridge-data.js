'use strict';
(function(){
 const s=window.realANE,call=window.realApi;
 if(!s||!call)return;
 const originals={dashboard:dashboardPage,invoices:invoicePage,consumption:consumptionPage,profile:profilePage};
 const brl=x=>typeof x==='number'?x.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—';
 const nfmt=x=>Number(x).toLocaleString('pt-BR',{maximumFractionDigits:1});
 function dataFor(type){
  const k=String(state.current)+'/'+String(state.year)+'/'+type;
  if(s.cache.has(k))return s.cache.get(k);
  if(!s.pending.has(k)){
   s.pending.add(k);
   call(type,(type==='pagas'||type==='consumo')?{ano:Number(state.year)}:{}).then(data=>{
    s.cache.set(k,{data});if(state.logged&&['painel','faturas','consumo'].includes(route()))render();
   }).catch(e=>{
    s.cache.set(k,{error:e.message});if(state.logged&&['painel','faturas','consumo'].includes(route()))render();
   }).finally(()=>s.pending.delete(k));
  }
  return null;
 }
 function notice(title,details){
  return '<section class="module"><div class="kicker">DADOS REAIS · VER SAN</div><h2>'+esc(title)+'</h2><p>'+esc(details)+'</p></section>';
 }
 function bill(x,paid){
  const id=Number(x.idFatura);
  let h='<div class="bill"><div><b>'+esc(paid?'Fatura '+id:x.referencia||'Fatura '+id)+'</b><p>Vencimento '+esc(x.dataVencimento||'—')+(paid?' · Pagamento '+esc(x.dataPagamento||'—'):'')+'</p></div>'+
  '<span class="amount">'+brl(x.valor)+'</span><span class="pill">'+(paid?'PAGA':x.vencidaPorData?'VENCIDA':'EM ABERTO')+'</span></div>';
  if(!paid&&Number.isInteger(id)&&id>0){
   h+='<div style="display:flex;gap:7px;flex-wrap:wrap;margin:8px 0 18px">'+
   btn('Pix',"realANEPayment('pix',"+id+")",'light tiny')+
   btn('Código de barras',"realANEPayment('barra',"+id+")",'light tiny')+
   btn('Segunda via PDF',"realANEPayment('pdf',"+id+")",'outline tiny')+'</div>';
  }
  return h;
 }
 dashboardPage=function(){
  const debts=dataFor('debitos'),paid=dataFor('pagas'),usage=dataFor('consumo');
  let h=originals.dashboard();
  const begin=h.indexOf('<div class="metrics">'),end=h.indexOf('<section class="quick-section">');
  if(begin<0||end<=begin)return h;
  const nDebt=debts?.error?'Indisponível':debts?debts.data.total+' em aberto':'Consultando...';
  const nPaid=paid?.error?'Indisponível':paid?paid.data.total+' pagas':'Consultando...';
  const months=usage?.data?.meses||[],last=months[months.length-1];
  const nUse=usage?.error?'Indisponível':usage?(last&&last.volumeFaturado!=null?nfmt(last.volumeFaturado)+' m³':'Sem consumo'):'Consultando...';
  const cards='<div class="metrics"><div class="metric primary"><div class="metric-row"><span class="iconbox">'+icon('check','lg')+'</span><span class="eyebrow">SITUAÇÃO FINANCEIRA</span></div><h3>'+nDebt+'</h3><p>Faturas reais do CDC '+esc(state.current)+' · VerSan/ANE</p></div>'+
   metric('ÚLTIMO CONSUMO',nUse,'Volume faturado na base ANE','bars')+
   metric('FATURAS PAGAS',nPaid,'Exercício '+esc(state.year),'receipt')+'</div>';
  return h.slice(0,begin)+cards+h.slice(end);
 };
 invoicePage=function(){
  const due=dataFor('debitos'),paid=dataFor('pagas');
  if(due?.error)return layout('Faturas e pagamentos','Consulte valores, segunda via, Pix e histórico.',notice('Consulta indisponível',due.error));
  let out='<section class="module"><div class="kicker">FATURAS REAIS · VER SAN / ANE</div><h2>Minhas faturas</h2><p>CDC '+esc(state.current)+' · Informações financeiras da base ANE.</p>';
  if(!due)out+='<p>Carregando faturas em aberto...</p>';
  else if(!due.data.faturas?.length)out+='<div class="deliver-banner">Nenhuma fatura em débito encontrada.</div>';
  else out+=(due.data.faturas||[]).map(x=>bill(x,false)).join('');
  if(paid?.error)out+='<p>Histórico pago indisponível: '+esc(paid.error)+'</p>';
  else if(!paid)out+='<p>Carregando histórico de pagamentos...</p>';
  else out+='<h3 style="margin:24px 0 14px">Faturas pagas · '+esc(state.year)+'</h3>'+
    (paid.data.faturas?.length?paid.data.faturas.map(x=>bill(x,true)).join(''):'<p>Nenhuma fatura paga para o exercício.</p>');
  out+='<div class="deliver-banner">Códigos de pagamento retornados diretamente pelo VerSan. Confira os dados antes de pagar.</div></section>';
  return layout('Faturas e pagamentos','Consulte valores, segunda via, Pix e histórico.',out);
 };
 consumptionPage=function(){
  const d=dataFor('consumo');
  if(d?.error)return layout('Histórico de consumo','Acompanhe seu consumo ao longo dos meses.',notice('Consulta indisponível',d.error));
  if(!d)return layout('Histórico de consumo','Acompanhe seu consumo ao longo dos meses.',notice('Consultando VerSan','Carregando dados reais de consumo.'));
  const parse=x=>{const v=String(x||''),m=v.match(/^(\d{2})\/(\d{4})$/);return m?m[2]+m[1]:v};
  const v=[...(d.data.meses||[])].sort((a,b)=>parse(a.referencia).localeCompare(parse(b.referencia)));
  const max=Math.max(10,...v.map(x=>Number(x.volumeFaturado)||0));
  const bars=v.length?'<div class="consumption-bars">'+v.map(x=>{
   const n=Number(x.volumeFaturado)||0,ref=String(x.referencia||''),month=ref.match(/^(\d{2})\//)?.[1]||ref.slice(-2);
   return '<div class="bar" data-label="'+esc(month)+'" data-value="'+nfmt(n)+' m³" title="'+esc(ref)+': '+nfmt(n)+' m³" style="height:'+Math.max(2,Math.round(100*n/max))+'%"></div>';
  }).join('')+'</div>':'<p>Nenhum histórico encontrado.</p>';
  const nums=v.map(x=>x.volumeFaturado).filter(x=>typeof x==='number');
  const avg=nums.length?nfmt(nums.reduce((a,b)=>a+b,0)/nums.length)+' m³':'—';
  return layout('Histórico de consumo','Acompanhe seu consumo ao longo dos meses.','<section class="module"><div class="kicker">CONSUMO REAL · ANE</div><h2>Evolução mensal</h2><p>Volumes faturados em '+esc(state.year)+', conforme getHistoricoConsumo.</p>'+bars+'<div style="margin-top:33px" class="row space"><b>Consumo médio do período</b><b>'+avg+'</b></div></section>');
 };
 profilePage=function(){
  return layout('Minha conta','Seu cadastro e imóveis vinculados.','<section class="module"><div class="kicker">CONTA AUTENTICADA · VER SAN</div><h2>'+esc(window.realANEDisplayName(s.user,'Consumidor'))+'</h2><p>CDC atual: '+esc(state.current)+'</p><p>'+locations.length+' imóvel(is) vinculados a esta conta.</p>'+btn('Ver meus imóveis '+icon('arrow','sm'),"change('imoveis')",'outline')+'</section>');
 };
 window.realANEPayment=async function(kind,id){
  try{
   const d=await call(kind,{idFatura:id});
   if(kind==='pdf'){
    const url=URL.createObjectURL(d),a=document.createElement('a');a.href=url;a.download='fatura-ane-'+id+'.pdf';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),20000);
    toast('Segunda via PDF recebida.');return;
   }
   const code=kind==='pix'?d.codigoPix:d.codigoDigitavel;
   if(typeof code!=='string'||!code)throw Error('Código não retornado.');
   showModal(kind==='pix'?'Pix copia e cola':'Código de barras','<p>Confira valor e destinatário no aplicativo bancário antes de pagar.</p><div style="word-break:break-all;padding:15px;background:#f0f6fa;border-radius:9px">'+esc(code)+'</div>');
   navigator.clipboard?.writeText(code).then(()=>toast('Código copiado.')).catch(()=>{});
  }catch(e){toast('Falha na consulta: '+e.message)}
 };
})();