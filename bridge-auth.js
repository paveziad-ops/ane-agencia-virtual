'use strict';
(function(){
const old={auth:authPage,properties:propertiesPage,pick:pickProperty,logout:logOut,aside:aside,footer:footer};
const session={user:null,error:'',busy:false,cache:new Map(),pending:new Set()};
window.realANE=session;
window.realApi=async function(acao,values={}){
 const r=await fetch('/api/versan/cliente',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({acao,...values})});
 if((r.headers.get('content-type')||'').includes('application/pdf'))return r.blob();
 let d;try{d=await r.json()}catch{d={mensagem:'Resposta inválida do servidor'}};
 if(!r.ok){const e=new Error(d.mensagem||'VerSan não concluiu a operação');e.code=d.codigo;e.status=r.status;throw e}
 return d;
};
window.realANEActivate=function(data){
 if(!Array.isArray(data.imoveis)||!data.imoveis.length)throw Error('O VerSan não informou imóveis vinculados');
 session.user=data;session.error='';
 locations.splice(0,locations.length,...data.imoveis.map((p,i)=>({id:String(p.cdc),name:'Imóvel '+(i+1),street:p.endereco?String(p.endereco).split(' · ')[0]:'CDC '+p.cdc,district:p.endereco?'CDC '+p.cdc+' · '+String(p.endereco).split(' · ').slice(1).join(' · '):'Matrícula vinculada',status:'Ativa',services:'Consultar serviços'})));
 state.logged=true;state.current=String(data.cdcSelecionado||locations[0].id);
 state.propertyFilter='all';state.propertyTerm='';session.cache.clear();session.pending.clear();
};
footer=function(){return old.footer().replace('Sem conexão ativa com dados de consumidores','')};
window.realANEDisplayName=function(user,fallback){
 const u=user&&typeof user==='object'?user:{};
 const candidates=[
  u.nomeCompleto,u.nomePessoa,u.aPessoa?.[0]?.nome,u.pessoa?.nome,
  u.pessoas?.[0]?.nome,u.cliente?.nome,u.cadastro?.nome,u.nome,u.nomeTitular
 ];
 const full=candidates.find(v=>typeof v==='string'&&
  v.trim().split(/\s+/).length>=2&&v.trim().length<=160&&
  !/^(im[oó]vel|cliente|consumidor)\b/i.test(v.trim()));
 return full?.trim().replace(/\s+/g,' ')||
  (typeof u.primeiroNome==='string'&&u.primeiroNome.trim())||
  fallback||'Consumidor';
};
aside=function(){return old.aside().replace('Consumidor de demonstração',esc(window.realANEDisplayName(session.user,'Consumidor ANE')))};
authPage=function(){
 const error=session.error?'<p class="error" role="alert">'+esc(session.error)+'</p>':'';
 return header()+'<main class="auth-wrap"><div class="auth-hero"><div>'+logo(true)+'</div><h1>Seu atendimento começa aqui.</h1><p>Identificação simples, dados protegidos e acesso aos seus imóveis.</p></div>'+
 '<section class="auth-card"><div class="kicker">ENTRAR NA MINHA CONTA</div><h2>Acesse seus imóveis</h2><p>Use o CPF/CNPJ e sua senha cadastrada no VerSan. Seus imóveis serão identificados automaticamente.</p>'+
 '<form onsubmit="realANELogin(event)"><div class="field"><label for="cpf">CPF ou CNPJ</label><input class="input" id="cpf" placeholder="000.000.000-00" inputmode="numeric" autocomplete="username" required></div>'+
 '<div class="field"><label for="senha">Senha</label><input class="input" id="senha" type="password" autocomplete="current-password" placeholder="Sua senha" required></div>'+error+
 '<div class="stack" style="margin-top:18px"><button type="submit" class="btn primary full" id="realANEButton" '+(session.busy?'disabled':'')+'>'+(session.busy?'Autenticando...':'Entrar e acessar meus imóveis '+icon('arrow','sm'))+'</button></div></form>'+
 '<div class="progress-note">'+icon('shield','sm')+' Acesso protegido</div></section></main>'+footer()+bottom();
};
window.realANELogin=async function(event){
 event.preventDefault();if(session.busy)return;session.busy=true;session.error='';
 const doc=document.getElementById('cpf')?.value||'',password=document.getElementById('senha')?.value||'';
 const button=document.getElementById('realANEButton');if(button){button.disabled=true;button.textContent='Autenticando no VerSan...'}
 try{const data=await realApi('entrar',{numeroDocumento:doc,senha:password});
  const field=document.getElementById('senha');if(field)field.value='';
  realANEActivate(data);change('imoveis');
 }catch(e){session.error=e.message+(e.code?' ('+e.code+')':'');const field=document.getElementById('senha');if(field)field.value='';toast(session.error)}
 finally{session.busy=false;if(!state.logged)render()}
};
propertiesPage=function(){
 let content=old.properties();const n=locations.length;
 content=content.replace('MINHA CONTA · DEMONSTRAÇÃO','MINHA CONTA')
 .replace('Seus imóveis vinculados aparecerão aqui após a autenticação real do VerSan.','Imóveis vinculados à sua conta, conforme autenticação real no VerSan.')
 .replace('<div class="banner-demo" style="margin-bottom:21px">Os três imóveis abaixo são <strong>fictícios</strong> e servem apenas para demonstrar a navegação.</div>','')
 .replace('Todos (3)','Todos ('+n+')')
 .replace('Ativos (2)','Vinculados ('+n+')')
 .replace('Inativos (1)','Outros (0)');
 return content;
};
pickProperty=async function(cdc){
 if(!locations.some(x=>x.id===String(cdc)))return;
 try{const data=await realApi('selecionar',{cdc:String(cdc)});session.user=data;state.current=String(data.cdcSelecionado);session.cache.clear();session.pending.clear();change('painel')}
 catch(e){toast('Não foi possível selecionar o imóvel: '+e.message)}
};
logOut=async function(){
 try{await realApi('sair')}catch{}
 state.logged=false;session.user=null;session.cache.clear();session.pending.clear();
 locations.splice(0,locations.length);change('inicio');toast('Sessão encerrada.');
};
realApi('status').then(d=>{realANEActivate(d);if(route()==='inicio'||route()==='entrar')change('painel');else render()}).catch(()=>{});
})();