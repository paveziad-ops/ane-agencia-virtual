
/* Faturas e Pix: identidade, resumo por valores e historico por exercicio.
   Restrito a pagina autenticada de faturas. Nenhuma API ou acao de pagamento
   existente e modificada. */
(function(){
 'use strict';
 const session=window.realANE;
 const months=['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
 const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
 const selected={user:null,year:null,expanded:false,records:new Map(),loading:new Set()};
 const currentYear=()=>new Date().getFullYear();
 const idFor=x=>{
  const n=Number(x?.idFatura??x?.id);
  return Number.isSafeInteger(n)&&n>0?n:null;
 };
 const amount=x=>{
  if(typeof x==='number')return Number.isFinite(x)?x:null;
  if(typeof x==='string'&&/^-?\d+(?:[.,]\d{1,2})?$/.test(x.trim())){
    const n=Number(x.trim().replace(',','.'));return Number.isFinite(n)?n:null;
  }
  return null;
 };
 function dateParts(raw){
  const s=String(raw||'').trim();
  let m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(m)return{year:Number(m[3]),month:Number(m[2]),day:Number(m[1]),
    sort:m[3]+m[2]+m[1]};
  m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  return m?{year:Number(m[1]),month:Number(m[2]),day:Number(m[3]),
    sort:m[1]+m[2]+m[3]}:null;
 }
 function dateLabel(v){
  const x=dateParts(v);
  if(!x)return v?esc(String(v)):'—';
  return String(x.day).padStart(2,'0')+'/'+String(x.month).padStart(2,'0')+'/'+x.year;
 }
 function dateKey(v){return dateParts(v)?.sort||'00000000'}
 function reference(v){
  const s=String(v??'').trim();
  let match=s.match(/^(\d{4})(0[1-9]|1[0-2])$/);
  if(match)return months[Number(match[2])-1]+'/'+match[1];
  match=s.match(/^(0[1-9]|1[0-2])\/(\d{4})$/);
  if(match)return months[Number(match[1])-1]+'/'+match[2];
  return s?esc(s):'';
 }
 function todayKey(){
  // Data civil brasileira, independente do fuso do navegador do consumidor.
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',
   year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const get=k=>parts.find(x=>x.type===k)?.value||'';
  return get('year')+get('month')+get('day');
 }
 function overdue(row){
  if(typeof row?.vencidaPorData==='boolean')return row.vencidaPorData;
  if(typeof row?.vencida==='boolean')return row.vencida;
  const x=dateKey(row?.dataVencimento);
  return x!=='00000000'&&x<todayKey();
 }
 function invoiceYear(){
  if(selected.user!==session.user){
   selected.user=session.user;
   selected.year=currentYear();
   selected.expanded=false;
   selected.records.clear();
   selected.loading.clear();
  }
  return selected.year;
 }
 function getData(type,yr){
  invoiceYear();
  const currentUser=session.user,cdc=String(state.current||'');
  const yearPart=type==='pagas'?yr:Number(state.year)||currentYear();
  const key=cdc+'/'+yearPart+'/'+type;
  // A fonte compartilhada com o painel continua tendo prioridade.
  const existing=session.cache.get(key);
  if(existing)return existing;
  if(selected.records.has(key))return selected.records.get(key);
  if(session.pending.has(key)||selected.loading.has(key))return null;
  selected.loading.add(key);
  window.realApi(type,type==='pagas'?{ano:yr}:{}).then(data=>{
   if(session.user!==currentUser||!state.logged)return;
   if(!Array.isArray(data?.faturas))
    selected.records.set(key,{error:'O VerSan retornou um formato de consulta inesperado.'});
   else selected.records.set(key,{data});
  }).catch(()=>{
   if(session.user===currentUser&&state.logged)
    selected.records.set(key,{error:'Não foi possível consultar as faturas no momento.'});
  }).finally(()=>{
   // O resultado de uma sessao encerrada nao interfere na nova.
   if(session.user!==currentUser||!state.logged)return;
   selected.loading.delete(key);
   if(route()==='faturas'&&String(state.current)===cdc&&
      (type!=='pagas'||invoiceYear()===yr))render();
  });
  return null;
 }
 function rowsOf(record){
  return Array.isArray(record?.data?.faturas)?record.data.faturas:[];
 }
 function nameFor(){
  const u=session.user||{},p=Array.isArray(u.imoveis)?
   u.imoveis.find(x=>String(x.cdc)===String(state.current))||{}:{};
  const choices=[u.nomeCompleto,u.nomePessoa,u.nomeTitular,u.nome,u.pessoa?.nome,
   u.cliente?.nome,u.cadastro?.nome,u.aPessoa?.[0]?.nome,u.pessoas?.[0]?.nome,
   p.nomeCompleto,p.nomeTitular,p.nomeCliente,p.pessoa?.nome];
  const full=choices.find(v=>typeof v==='string'&&v.trim().length<=160&&
   v.trim().split(/\s+/).length>1&&!/^(im[oó]vel|cliente|consumidor)\b/i.test(v.trim()));
  return full?.trim()||u.primeiroNome||u.nome||'Nome não informado';
 }
 function billingStatus(){
  const u=session.user||{},p=Array.isArray(u.imoveis)?
   u.imoveis.find(x=>String(x.cdc)===String(state.current))||{}:{};
  // A session-level status may refer to another CDC after changing property.
  const providers=[p];
  if(String(u.cdcSelecionado||'')===String(state.current))providers.push(u);
  for(const x of providers){
   const labels=[x.situacaoCobranca,x.situacaoDaCobranca,x.descricaoSituacaoCobranca];
   for(const item of labels){
    const str=typeof item==='string'?item:typeof item?.situacaoCobranca==='string'?
     item.situacaoCobranca:typeof item?.descricao==='string'?item.descricao:'';
    if(str&&str.trim().length<85)return str.trim();
   }
  }
  return 'Não informada pela API';
 }
 function summaryFor(rows){
  if(!Array.isArray(rows))return{sum:null,count:null,incomplete:false};
  let total=0,missing=false;
  for(const row of rows){
   const n=amount(row.valor);
   if(n===null)missing=true;
   else total+=n;
  }
  return{sum:missing?null:total,count:rows.length,incomplete:missing};
 }
 function card(title,sub,record,filter,variant){
  let sum,count,explain;
  if(!record){sum=null;count=null;explain='Consultando VerSan...'}
  else if(record.error){sum=null;count=null;explain='Consulta indisponível'}
  else{
   const full=rowsOf(record);
   const rows=filter?full.filter(filter):full;
   const s=summaryFor(rows);
   sum=s.sum;count=s.count;
   explain=count===1?'1 fatura retornada':count+' faturas retornadas';
   if(s.incomplete)explain+=' · valor indisponível';
   const reported=Number(record.data?.total);
   if(!filter&&Number.isFinite(reported)&&reported>full.length)
    explain+=' · lista parcial';
  }
  return '<div class="inv-summary-card '+(variant||'')+'">'+
   '<span class="inv-summary-title">'+title+'</span>'+
   '<strong>'+((sum===null)?'—':money.format(sum))+'</strong>'+
   '<small>'+esc(explain)+'</small></div>';
 }
 function buttons(id){
  if(id===null)return'';
  // Mesmas acoes aprovadas, sem mudanca na API nem no processamento de pagamento.
  return '<div class="inv-actions">'+
   '<button type="button" class="inv-action inv-action-main" onclick="realANEPayment(&#39;pix&#39;,'+id+')">Pix</button>'+
   '<button type="button" class="inv-action" onclick="realANEPayment(&#39;barra&#39;,'+id+')">Código de barras</button>'+
   '<button type="button" class="inv-action" onclick="realANEPayment(&#39;pdf&#39;,'+id+')">Segunda via PDF</button>'+
   '</div>';
 }
 function activeRow(row){
  const id=idFor(row),isLate=overdue(row),ref=reference(row.referencia);
  const n=amount(row.valor);
  const title=ref||'Fatura'+(id===null?'':' nº '+id);
  return '<div class="inv-open-row">'+
   '<div class="inv-open-main"><div class="inv-open-title">'+
   '<div><strong>'+title+'</strong>'+
   (id===null?'':'<span class="inv-invoice-id">Fatura nº '+id+'</span>')+
   '<span class="inv-date">Vencimento '+dateLabel(row.dataVencimento)+'</span></div>'+
   '<div class="inv-open-right"><strong class="inv-money">'+(n===null?'Valor indisponível':money.format(n))+'</strong>'+
   '<span class="inv-status '+(isLate?'inv-status-late':'inv-status-open')+'">'+
   (isLate?'VENCIDA':'EM ABERTO')+'</span></div></div></div>'+
   buttons(id)+'</div>';
 }
 function paidTable(record){
  if(!record)return'<div class="inv-empty" role="status">Consultando histórico de pagamentos...</div>';
  if(record.error)return '<div class="inv-empty inv-error" role="alert">'+esc(record.error)+'</div>';
  const entries=rowsOf(record).slice().sort((a,b)=>
   dateKey(b.dataVencimento).localeCompare(dateKey(a.dataVencimento))||
   (idFor(b)||0)-(idFor(a)||0));
  if(!entries.length)return'<div class="inv-empty">Nenhuma fatura paga retornada para o ano selecionado.</div>';
  const display=selected.expanded?entries:entries.slice(0,8);
  const tbody=display.map(row=>{
   const id=idFor(row),ref=reference(row.referencia),n=amount(row.valor);
   const pdf=id===null?'':'<button type="button" class="inv-action inv-paid-pdf" '+
    'onclick="realANEPayment(&#39;pdf&#39;,'+id+')">Baixar PDF</button>';
   return '<tr><td><strong>'+(id===null?'Fatura sem número informado':'Fatura nº '+id)+'</strong>'+
    (ref?'<small>Referência: '+ref+'</small>':'')+'</td>'+
    '<td><span>Venc. '+dateLabel(row.dataVencimento)+'</span>'+
    '<small>Pagamento '+dateLabel(row.dataPagamento)+'</small></td>'+
    '<td class="inv-table-value">'+(n===null?'—':money.format(n))+'</td>'+
    '<td><div class="inv-paid-actions"><span class="inv-status inv-status-paid">PAGA</span>'+pdf+'</div></td></tr>';
  }).join('');
  return '<div class="inv-table-scroll"><table class="inv-history-table">'+
   '<thead><tr><th scope="col">Fatura</th><th scope="col">Datas</th><th scope="col">Valor</th>'+
   '<th scope="col">Situação / documento</th></tr></thead><tbody>'+tbody+'</tbody></table></div>'+
   (entries.length>8?'<button class="inv-show-more" type="button" onclick="toggleInvoicesPaid()">'+
    (selected.expanded?'Mostrar menos':'Mostrar todas as '+entries.length+' faturas pagas')+'</button>':'');
 }
 function years(){
  let h='';
  for(let yr=currentYear();yr>=2022;yr--)h+='<option value="'+yr+'"'+
    (yr===invoiceYear()?' selected':'')+'>'+yr+'</option>';
  return '<label class="inv-year" for="inv-paid-year">Ano <select id="inv-paid-year" '+
    'onchange="chooseInvoicesYear(this.value)" aria-label="Ano das faturas pagas">'+h+'</select></label>';
 }
 invoicePage=function(){
  if(!state.logged||route()!=='faturas')
   return layout('Faturas e Pix','Consulte valores, segunda via, Pix e histórico.','');
  const yr=invoiceYear(),due=getData('debitos',yr),paid=getData('pagas',yr);
  const debts=rowsOf(due);
  const identity='<div class="docs-real-identity inv-identity" aria-label="Consumidor e matrícula">'+
   '<div><span>CONSUMIDOR</span><strong>'+esc(String(nameFor()))+'</strong></div>'+
   '<div><span>MATRÍCULA</span><strong>CDC '+esc(String(state.current||''))+'</strong></div>'+
   '<div><span>SITUAÇÃO COBRANÇA</span><strong>'+esc(billingStatus())+'</strong></div></div>';
  const stats='<div class="inv-financial" aria-label="Resumo financeiro por valores">'+
   card('FATURAS EM ABERTO','',due,null,'inv-card-open')+
   card('FATURAS VENCIDAS','',due,overdue,'inv-card-overdue')+
   card('PAGAS · '+yr,'',paid,null,'inv-card-paid')+'</div>';
  let active;
  if(!due)active='<div class="inv-empty" role="status">Consultando faturas em aberto...</div>';
  else if(due.error)active='<div class="inv-empty inv-error" role="alert">'+esc(due.error)+'</div>';
  else if(!debts.length)
   active='<div class="inv-empty">Nenhuma fatura em débito retornada nesta consulta. Esse resultado não substitui uma declaração oficial de quitação.</div>';
  else active=debts.slice().sort((a,b)=>{
   const av=overdue(a),bv=overdue(b);
   if(av!==bv)return av?-1:1;
   return dateKey(a.dataVencimento).localeCompare(dateKey(b.dataVencimento));
  }).map(activeRow).join('');
  const header='<div class="inv-section-title"><div><div class="kicker">FATURAS E PAGAMENTOS</div>'+
   '<h2>Minhas faturas</h2>'+
   '<p>Valores e documentos do imóvel selecionado.</p></div></div>';
  const html='<section class="module invoices-refined">'+header+stats+
   '<section class="inv-group inv-open-group" aria-label="Faturas em aberto">'+
   '<div class="inv-group-head"><h3>Faturas em aberto</h3>'+
   '<span class="inv-group-sub">Pix, código de barras e segunda via</span></div>'+
   active+'</section>'+
   '<section class="inv-group inv-paid-group" aria-label="Histórico de faturas pagas">'+
   '<div class="inv-group-head"><div><h3>Faturas pagas</h3>'+
   '<p>Histórico do ano consultado</p></div>'+years()+'</div>'+
   paidTable(paid)+'</section>'+
   '<p class="inv-payment-note">Antes de pagar, confira os dados da fatura e do beneficiário.</p>'+
   '</section>';
  let page=layout('Faturas e Pix','Consulte suas faturas e opções de pagamento.',html);
  page=page.replace('ÁREA DO CONSUMIDOR · DEMONSTRAÇÃO','ÁREA DO CONSUMIDOR');
  page=page.replace(/<div class="banner-demo" style="margin-bottom:18px">Você está explorando uma [\s\S]*?<\/div>/,identity);
  page=page.replace(/(<div class="user-brief"><b>)[\s\S]*?(<\/b>)/,
   (_match,left,right)=>left+esc(String(nameFor()))+right);
  page=page.replace('Sair da demonstração','Sair da conta');
  return page;
 };
 window.chooseInvoicesYear=function(value){
  const yr=Number(value);
  if(!state.logged||!Number.isInteger(yr)||yr<2022||yr>currentYear())return;
  invoiceYear();selected.year=yr;selected.expanded=false;
  if(route()==='faturas')render();
 };
 window.toggleInvoicesPaid=function(){
  if(!state.logged||route()!=='faturas')return;
  selected.expanded=!selected.expanded;render();
 };
})();
