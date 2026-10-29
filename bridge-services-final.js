'use strict';
(function(){
  const oldHeader=header, oldFooter=footer, oldHome=publicHome, oldNavBottom=navBottom, oldActivate=window.realANEActivate;
  let consumptionAfterLogin=false;

  header=function(){
    let html=oldHeader();
    // A final consumer-facing product must not show the technical testing environment.
    html=html.replace(/<span class="demo-label">[\s\S]*?<\/span>/,'');
    if(!state.logged){
      html=html.replace('<a href="#inicio">Início</a>',
        '<a href="#inicio">Início</a><a href="#inicio" onclick="return openPublicInvoice(event)">Segunda via</a>');
      html=html.replace('<a href="#servicos">Serviços</a>',
        '<a href="#inicio" onclick="return openServiceSection(event)">Serviços</a>');
    }
    return html;
  };

  footer=function(){
    return oldFooter().replace(/<span>Ambiente de homologação[\s\S]*?<\/span>/,'');
  };

  function scrollToServices(){
    const target=document.querySelector('.public-section');
    if(!target)return;
    if(typeof target.scrollIntoView==='function')target.scrollIntoView({behavior:'smooth',block:'start'});
    else if(typeof window.scrollTo==='function')window.scrollTo(0,0);
  }

  window.openPublicInvoice=function(event){
    if(event)event.preventDefault();
    gotoPublic();
    return false;
  };
  window.openServiceSection=function(event){
    if(event)event.preventDefault();
    if(state.logged){change('servicos');return false;}
    if(route()!=='inicio'){
      change('inicio');
      setTimeout(scrollToServices,100);
    }else{
      scrollToServices();
    }
    return false;
  };
  navBottom=function(key){
    if(key==='servicos'&&!state.logged){
      window.openServiceSection();
      return;
    }
    oldNavBottom(key);
  };

  window.openCustomerConsumption=function(){
    if(state.logged){
      change('consumo');
    }else{
      consumptionAfterLogin=true;
      startLogin();
    }
  };
  window.realANEActivate=function(data){
    const value=oldActivate(data);
    if(consumptionAfterLogin){
      consumptionAfterLogin=false;
      Promise.resolve().then(()=>{
        if(state.logged)change('consumo');
      });
    }
    return value;
  };
  window.addEventListener('hashchange',()=>{
    if(!state.logged&&route()!=='entrar')consumptionAfterLogin=false;
  });
  // The approved login header has its own preserved markup; route its Services link to the landing section.
  document.addEventListener('click',event=>{
    const target=event.target&&event.target.closest?.('.toplinks a[href="#servicos"]');
    if(target&&!state.logged)window.openServiceSection(event);
  });

  const disabledLabels=new Set([
    'Troca de titularidade',
    'Solicitar serviços'
  ]);
  publicHome=function(){
    let html=oldHome();

    // Preserve the approved cards, descriptions and grid geometry.
    const begin=html.indexOf('<div class="service-preview">');
    if(begin<0)throw Error('Central de Serviços não encontrada');
    const end=html.indexOf('</div>',begin);
    if(end<0)throw Error('Fim da Central de Serviços não encontrado');
    let list=html.slice(begin,end+6);
    let count=0,coming=0;
    list=list.replace(/<button class="tile" onclick="([^"]*)">([\s\S]*?)<\/button>/g,(full,action,inner)=>{
      const label=inner.match(/<strong>([^<]+)<\/strong>/)?.[1]||'';
      // Sending an invoice is an action on a selected bill, not a standalone service.
      if(label==='Enviar fatura por e-mail')return '';
      count++;
      if(disabledLabels.has(label)){
        coming++;
        const marked=inner.replace(/<span class="arrow">[\s\S]*?<\/span>/,
          '<span class="service-soon-tag" aria-hidden="true">Em breve</span>');
        return '<button type="button" class="tile tile-soon" disabled aria-disabled="true" title="'+esc(label)+' — em breve">'+marked+'</button>';
      }
      if(label==='Declarações'){
        // Document issuance will be built inside the authenticated area in later steps.
        // For now only require the approved VerSan login.
        return '<button class="tile" type="button" onclick="startLogin()">'+inner+'</button>';
      }
      if(label==='Meu consumo'){
        return '<button class="tile" type="button" onclick="openCustomerConsumption()">'+inner+'</button>';
      }
      return full;
    });
    if(count!==5||coming!==2)throw Error('Catálogo de serviços inesperado após retirar envio avulso de fatura');
    // New seventh card: same approved tile design, disabled until the guide exists.
    const understandTile='<button type="button" class="tile tile-soon" disabled aria-disabled="true" title="Entenda a sua Conta — em breve">'+
      '<span class="iconbox">'+icon('info','lg')+'</span>'+
      '<strong>Entenda a sua Conta</strong>'+
      '<small>Saiba como ler e entender sua fatura</small>'+
      '<span class="service-soon-tag" aria-hidden="true">Em breve</span></button>';
    if(!list.endsWith('</div>'))throw Error('Grade de serviços incompleta');
    list=list.slice(0,-6)+understandTile+'</div>';
    html=html.slice(0,begin)+list+html.slice(end+6);

    // Remove only the demonstrative notices from the approved public landing.
    html=html.replace('<span class="demo-label search-mobile">PRÉVIA INTERATIVA</span>','');
    html=html.replace(/<div class="banner-demo" style="margin-top:25px">[\s\S]*?<\/div>/,'');
    html=html.replace('Quer conhecer a experiência completa?','Sua conta de água, ainda mais simples');
    html=html.replace('Experimente o acesso, os imóveis e a central de atendimento.',
      'Entre para consultar seus imóveis, faturas e histórico de consumo.');
    html=html.replace('Explorar demonstração','Acessar minha conta');
    return html;
  };

  // The original app renders before bridge scripts load; refresh only the public landing.
  if(!state.logged && route()==='inicio')render();
})();

/* Autenticado: dados e análise da Central de Documentos.
   Isolado desta rota; não altera consulta rápida, pagamentos ou autenticação. */
(function(){
  'use strict';
  const previousDocuments=documentsPage;
  const annual={
    cdc:null,userRef:null,open:false,year:Math.max(2022,new Date().getFullYear()-1),
    loading:false,result:null,error:'',sequence:0
  };

  function linkedProperty(){
    const u=window.realANE?.user||{};
    return Array.isArray(u.imoveis)?u.imoveis.find(x=>String(x.cdc)===String(state.current))||null:null;
  }
  function accountName(){
    const u=window.realANE?.user||{},p=linkedProperty()||{};
    const candidates=[
      u.nomeCompleto,u.nomePessoa,u.nomeTitular,u.nome,
      u.pessoa?.nome,u.cliente?.nome,u.cadastro?.nome,
      u.aPessoa?.[0]?.nome,u.pessoas?.[0]?.nome,
      p.nomeCompleto,p.nomeTitular,p.nomeCliente,p.pessoa?.nome
    ];
    const full=candidates.find(v=>typeof v==='string'&&v.trim().split(/\s+/).length>=2&&
      !/^(im[oó]vel|cliente|consumidor)\b/i.test(v.trim())&&v.trim().length<=160);
    const short=(typeof u.primeiroNome==='string'&&u.primeiroNome.trim()||
      typeof u.nome==='string'&&u.nome.trim()||'');
    return {name:full?.trim()||short||'Nome não informado',complete:Boolean(full)};
  }
  function supplyStatus(){
    const p=linkedProperty()||{},u=window.realANE?.user||{};
    // Somente situação operacional explicitamente informada; débitos e status
    // cadastral "Ativa" não permitem inferir corte do fornecimento.
    const sources=[p];
    if(String(u.cdcSelecionado||'')===String(state.current))sources.push(u);
    for(const obj of sources){
      for(const key of ['cortada','cortado','fornecimentoCortado','ligacaoCortada','corteEfetivado']){
        if(obj[key]===true)return {label:'Cortado',found:true};
        if(obj[key]===false)return {label:'Sem corte registrado',found:true};
      }
      for(const key of ['situacaoFornecimento','situacaoLigacao','situacaoOperacional','statusFornecimento']){
        const value=obj[key];
        if(typeof value!=='string')continue;
        if(/\b(CORTAD[AO]|SUSPENS[AO]|DESLIGAD[AO])\b/i.test(value))
          return {label:'Cortado',found:true};
        if(/\b(LIGAD[AO]|RELIGAD[AO]|NORMAL)\b/i.test(value))
          return {label:'Ligado',found:true};
      }
    }
    return {label:'Não informado pela API',found:false};
  }
  function syncProperty(){
    const cdc=String(state.current||'');
    const user=window.realANE?.user||null;
    if(annual.cdc!==cdc||!state.logged||annual.userRef!==user){
      annual.sequence++;annual.cdc=cdc;annual.userRef=user;annual.open=false;annual.loading=false;
      annual.result=null;annual.error='';
      annual.year=Math.max(2022,new Date().getFullYear()-1);
    }
  }
  function identity(){
    const person=accountName(),status=supplyStatus();
    const nameComment=person.complete?'':'<small>Nome completo não disponível no retorno atual.</small>';
    const statusComment=status.found?'':'<small>A API de autenticação não documenta a situação de corte.</small>';
    return '<div class="docs-real-identity" aria-label="Identificação do imóvel e situação do fornecimento">'+
      '<div><span>CONSUMIDOR</span><strong>'+esc(person.name)+'</strong>'+nameComment+'</div>'+
      '<div><span>MATRÍCULA</span><strong>CDC '+esc(String(state.current||''))+'</strong></div>'+
      '<div><span>FORNECIMENTO</span><strong>'+esc(status.label)+'</strong>'+statusComment+'</div>'+
      '</div>';
  }
  const ptMoney=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v);
  function yearAnalysis(){
    if(!annual.open)return '';
    const y=annual.year,upper=new Date().getFullYear();
    let options='';
    for(let yr=upper;yr>=Math.max(2022,upper-6);yr--)
      options+='<option value="'+yr+'"'+(yr===y?' selected':'')+'>'+yr+(yr===upper?' (em andamento)':'')+'</option>';
    let out='';
    if(annual.loading){
      out='<p class="docs-loading" role="status">Consultando faturas pagas no VerSan...</p>';
    }else if(annual.error){
      out='<p class="docs-error" role="alert">'+esc(annual.error)+'</p>';
    }else if(annual.result){
      const invoices=annual.result.faturas;
      const amounts=invoices.map(x=>Number(x.valor)).filter(Number.isFinite);
      const count=invoices.length;
      out='<div class="docs-year-summary"><b>'+count+' registro(s) de faturas pagas</b>'+
        '<span>Valores retornados: '+(amounts.length?ptMoney(amounts.reduce((a,b)=>a+b,0)):'não informados')+'</span></div>';
      if(count){
        out+='<div class="docs-year-rows" aria-label="Faturas pagas retornadas pelo VerSan">'+
          invoices.slice(0,25).map(x=>
            '<div class="docs-year-row"><span>Fatura '+esc(String(x.idFatura||'—'))+
            '<small>Venc. '+esc(String(x.dataVencimento||'—'))+
            (x.dataPagamento?' · Pago em '+esc(String(x.dataPagamento)):'')+'</small></span>'+
            '<b>'+esc(Number.isFinite(Number(x.valor))?ptMoney(Number(x.valor)):'Valor não informado')+'</b></div>'
          ).join('')+'</div>'+
          (count>25?'<p class="docs-year-note">Mostrando as primeiras 25 faturas desta consulta.</p>':'');
      }else{
        out+='<p class="docs-year-note">Nenhuma fatura paga retornada para o ano selecionado.</p>';
      }
      out+='<p class="docs-year-note">Esta consulta reúne registros de faturas pagas. Ela não comprova quitação integral do exercício e não é a declaração oficial.</p>';
    }else{
      out='<p class="docs-year-note">Selecione um exercício para consultar os pagamentos registrados no VerSan.</p>';
    }
    return '<div class="docs-year-panel" id="docs-year-panel">'+
      '<div class="docs-year-controls"><div class="docs-year-field"><label for="docs-year">Ano de referência</label>'+
      '<select id="docs-year" class="select" onchange="documentsChooseYear(this.value)">'+options+'</select></div>'+
      '<button class="btn outline tiny" type="button" onclick="documentsQueryPaid()"'+(annual.loading?' disabled':'')+'>Consultar pagamentos</button></div>'+
      out+'</div>';
  }
  documentsPage=function(){
    const original=previousDocuments();
    if(!state.logged)return original;
    syncProperty();
    let html=original;
    html=html.replace('ÁREA DO CONSUMIDOR · DEMONSTRAÇÃO','ÁREA DO CONSUMIDOR · VER SAN');
    html=html.replace(/<div class="banner-demo" style="margin-bottom:18px">Você está explorando uma [\s\S]*?<\/div>/,identity());
    html=html.replace(/(<div class="user-brief"><b>)[\s\S]*?(<\/b>)/,
      (_m,left,right)=>left+esc(accountName().name)+right);
    html=html.replace('Sair da demonstração','Sair da conta');
    html=html.replace('As declarações geradas pelo VerSan serão disponibilizadas aqui para emissão autenticada.',
      'Consulte registros reais do VerSan. A emissão das declarações oficiais ainda depende de integração.');
    html=html.replace('Selecionar exercício e gerar PDF oficial',
      'Consulte as faturas pagas do exercício. O documento oficial ainda depende de integração.');
    const card=html.indexOf('<h2>Central de documentos</h2>');
    const close=html.indexOf('</section>',card);
    if(card<0||close<0)throw Error('Central de documentos não localizada');
    return html.slice(0,close)+yearAnalysis()+html.slice(close);
  };

  // The preexisting "Selecionar ano" button now opens real paid-invoice analysis.
  showYear=function(){
    if(!state.logged){startLogin();return}
    syncProperty();annual.open=true;annual.result=null;annual.error='';
    render();
    window.documentsQueryPaid();
  };
  window.documentsChooseYear=function(value){
    const yr=Number(value),max=new Date().getFullYear();
    if(!Number.isInteger(yr)||yr<2022||yr>max)return;
    annual.year=yr;annual.result=null;annual.error='';
    render();
  };
  window.documentsQueryPaid=async function(){
    if(!state.logged||!annual.open||annual.loading)return;
    syncProperty();
    annual.loading=true;annual.result=null;annual.error='';
    const seq=++annual.sequence,cdc=String(state.current),year=annual.year;
    render();
    try{
      const data=await window.realApi('pagas',{ano:year});
      if(seq!==annual.sequence||!state.logged||String(state.current)!==cdc)return;
      if(!Array.isArray(data?.faturas))throw Error('Formato inesperado no retorno da API.');
      annual.result={faturas:data.faturas};
    }catch(err){
      if(seq!==annual.sequence||String(state.current)!==cdc)return;
      annual.error='Não foi possível consultar pagamentos deste exercício. Tente novamente.';
    }finally{
      if(seq===annual.sequence&&state.logged&&String(state.current)===cdc){
        annual.loading=false;
        if(route()==='documentos')render();
      }
    }
  };
})();


/* Consumo: apresentação autenticada e terminologia exata do indicador.
   Preserva a API, os valores, a ordenação, as barras e o cálculo da média. */
(function(){
  'use strict';
  const approvedConsumption=consumptionPage;
  function fullConsumer(){
    const u=window.realANE?.user||{};
    const link=Array.isArray(u.imoveis)?u.imoveis.find(p=>String(p.cdc)===String(state.current))||{}:{};
    const candidates=[
      u.nomeCompleto,u.nomePessoa,u.nomeTitular,u.nome,
      u.pessoa?.nome,u.cliente?.nome,u.cadastro?.nome,
      u.aPessoa?.[0]?.nome,u.pessoas?.[0]?.nome,
      link.nomeCompleto,link.nomeTitular,link.nomeCliente,link.pessoa?.nome
    ];
    const full=candidates.find(v=>typeof v==='string'&&v.trim().split(/\s+/).length>=2&&
      !/^(im[oó]vel|cliente|consumidor)\b/i.test(v.trim())&&v.trim().length<=160);
    const fallback=typeof u.primeiroNome==='string'&&u.primeiroNome.trim()||
      typeof u.nome==='string'&&u.nome.trim()||'Nome não informado';
    return {name:full?.trim()||fallback,complete:Boolean(full)};
  }
  consumptionPage=function(){
    let html=approvedConsumption();
    if(!state.logged||route()!=='consumo')return html;
    const customer=fullConsumer(),current=esc(String(state.current||''));
    // Display actual account fields only; a first name is not a full name.
    const identity='<div class="docs-real-identity" aria-label="Informações do consumo e da matrícula">'+
      '<div><span>CONSUMIDOR</span><strong>'+esc(customer.name)+'</strong>'+
      (customer.complete?'':'<small>Nome completo ainda não disponível no retorno da API.</small>')+'</div>'+
      '<div><span>MATRÍCULA</span><strong>CDC '+current+'</strong></div>'+
      '<div><span>INDICADOR EXIBIDO</span><strong>Volume faturado (m³)</strong>'+
      '<small>Não confundir com o volume medido pelo hidrômetro.</small></div></div>';

    html=html.replace('ÁREA DO CONSUMIDOR · DEMONSTRAÇÃO','ÁREA DO CONSUMIDOR · VER SAN');
    html=html.replace(/<div class="banner-demo" style="margin-bottom:18px">Você está explorando uma [\s\S]*?<\/div>/,identity);
    html=html.replace(/(<div class="user-brief"><b>)[\s\S]*?(<\/b>)/,
      (_match,left,right)=>left+esc(customer.name)+right);
    html=html.replace('Sair da demonstração','Sair da conta');
    html=html.replace('<h2>Evolução mensal</h2>','<h2>Volume faturado por mês</h2>');
    html=html.replace(/Volumes faturados em ([0-9]{4}), conforme getHistoricoConsumo\./,
      'Volumes faturados em $1 (m³), conforme o VerSan.');
    html=html.replace('Consumo médio do período','Média do volume faturado');
    return html;
  };
})();
