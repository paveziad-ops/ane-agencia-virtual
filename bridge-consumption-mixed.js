

/* Histórico de consumo: gráfico combinado faturado (coluna) x medido (linha).
   Apenas a rota autenticada de consumo. Usa os campos reais de getHistoricoConsumo. */
(function(){
  'use strict';
  const session=window.realANE;
  let selectedYear=null;
  let selectedForUser=null;
  const months=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const nf=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1});
  const show=x=>nf.format(x);
  const currentYear=()=>new Date().getFullYear();

  function year(){
    if(selectedForUser!==session.user){
      selectedForUser=session.user;
      selectedYear=Number(state.year)||currentYear();
    }
    return selectedYear;
  }
  function numberOrNull(input){
    if(input===null||input===undefined||input==='')return null;
    const parsed=typeof input==='number'?input:Number(String(input).trim().replace(',','.'));
    return Number.isFinite(parsed)&&parsed>=0?parsed:null;
  }
  function monthOf(input){
    const str=String(input??'').trim();
    let m=str.match(/^(\d{2})\/(\d{4})$/);
    if(m)return{month:Number(m[1]),year:Number(m[2])};
    m=str.match(/^(\d{4})(\d{2})$/);
    if(m)return{month:Number(m[2]),year:Number(m[1])};
    m=str.match(/^(\d{4})[-/](\d{2})(?:[-/]\d{2})?$/);
    return m?{month:Number(m[2]),year:Number(m[1])}:null;
  }
  function historyFor(yr){
    const cdc=String(state.current);
    const key=cdc+'/'+String(yr)+'/consumo';
    if(session.cache.has(key))return session.cache.get(key);
    if(!session.pending.has(key)){
      const requestedUser=session.user;
      session.pending.add(key);
      window.realApi('consumo',{ano:Number(yr)}).then(data=>{
        if(session.user!==requestedUser)return;
        session.cache.set(key,{data});
        if(state.logged&&route()==='consumo'&&String(state.current)===cdc&&year()===yr)render();
      }).catch(()=>{
        if(session.user!==requestedUser)return;
        session.cache.set(key,{error:'Consulta indisponível no momento.'});
        if(state.logged&&route()==='consumo'&&String(state.current)===cdc&&year()===yr)render();
      }).finally(()=>session.pending.delete(key));
    }
    return null;
  }
  function rowsFor(data,yr){
    const entries=Array.isArray(data?.meses)?data.meses:[];
    const map=new Map();
    let repeated=0;
    for(const x of entries){
      const ref=monthOf(x.referencia);
      if(!ref||ref.year!==yr||ref.month<1||ref.month>12)continue;
      if(map.has(ref.month)){repeated++;continue;}
      map.set(ref.month,{
        month:ref.month,
        billed:numberOrNull(x.volumeFaturado),
        measured:numberOrNull(x.volumeMedido)
      });
    }
    return {rows:[...map.values()].sort((a,b)=>a.month-b.month),repeated};
  }

  function person(){
    const u=session.user||{},p=Array.isArray(u.imoveis)?
      u.imoveis.find(x=>String(x.cdc)===String(state.current))||{}:{};
    const candidates=[u.nomeCompleto,u.nomePessoa,u.nomeTitular,u.nome,u.pessoa?.nome,
      u.cliente?.nome,u.cadastro?.nome,u.aPessoa?.[0]?.nome,u.pessoas?.[0]?.nome,
      p.nomeCompleto,p.nomeTitular,p.nomeCliente,p.pessoa?.nome];
    const complete=candidates.find(s=>typeof s==='string'&&s.trim().split(/\s+/).length>1&&
      s.trim().length<=160&&!/^(im[oó]vel|cliente|consumidor)\b/i.test(s.trim()));
    const fallback=typeof u.primeiroNome==='string'&&u.primeiroNome.trim()||
      typeof u.nome==='string'&&u.nome.trim()||'Nome não informado';
    return complete?.trim()||fallback;
  }

  function avg(rows,field){
    const nums=rows.map(x=>x[field]).filter(x=>x!==null);
    return nums.length?show(nums.reduce((a,b)=>a+b,0)/nums.length)+' m³':'—';
  }
  function tickStep(top){
    if(top<=10)return 2;
    const raw=top/4,mag=Math.pow(10,Math.floor(Math.log10(raw)));
    for(const n of [1,2,5,10])if(raw<=n*mag)return n*mag;
    return mag*10;
  }
  function graph(rows){
    const plot={x:54,right:948,top:38,bottom:274};
    const values=rows.flatMap(x=>[x.billed,x.measured]).filter(v=>v!==null);
    const peak=values.length?Math.max(...values):0;
    const step=tickStep(Math.max(10,peak));
    const scaleTop=Math.max(10,Math.ceil(peak/step)*step);
    const h=plot.bottom-plot.top,w=plot.right-plot.x;
    const count=rows.length,slot=w/count,barW=Math.min(79,slot*.8);
    const y=v=>plot.bottom-(v/scaleTop)*h;
    const p=[];
    // A single y-axis represents both indicators, in cubic metres.
    for(let v=0;v<=scaleTop+step*.01;v+=step){
      const yy=y(v).toFixed(2);
      p.push('<line x1="'+plot.x+'" x2="'+plot.right+'" y1="'+yy+'" y2="'+yy+
        '" class="mixed-chart-grid"/><text class="mixed-chart-y" x="42" y="'+
        (Number(yy)+4)+'" text-anchor="end">'+show(v)+'</text>');
    }
    const coords=rows.map((item,i)=>{
      const center=plot.x+(i+.5)*slot;
      return {...item,cx:center,by:item.billed===null?null:y(item.billed),
        my:item.measured===null?null:y(item.measured)};
    });
    for(const item of coords){
      if(item.billed!==null){
        const bh=plot.bottom-item.by;
        p.push('<rect class="mixed-chart-column" x="'+(item.cx-barW/2).toFixed(2)+
          '" y="'+item.by.toFixed(2)+'" width="'+barW.toFixed(2)+
          '" height="'+Math.max(0,bh).toFixed(2)+
          '" rx="4" fill="url(#mixed-volume-gradient)">'+
          '<title>'+months[item.month-1]+': volume faturado '+show(item.billed)+' m³</title></rect>');
        p.push('<text class="mixed-chart-billed" text-anchor="middle" x="'+item.cx.toFixed(2)+
          '" y="'+Math.max(18,item.by-11).toFixed(2)+'">'+show(item.billed)+'</text>');
      }
      p.push('<text class="mixed-chart-x" text-anchor="middle" x="'+item.cx.toFixed(2)+
        '" y="299">'+months[item.month-1]+'</text>');
    }
    // Do not join points across months without a measured value.
    let segment=[];
    const flush=()=>{
      if(segment.length>=2){
        let d='M '+segment[0].cx.toFixed(2)+' '+segment[0].my.toFixed(2);
        for(let i=1;i<segment.length;i++){
          const prev=segment[i-1],next=segment[i],mid=(prev.cx+next.cx)/2;
          d+=' C '+mid.toFixed(2)+' '+prev.my.toFixed(2)+' '+
            mid.toFixed(2)+' '+next.my.toFixed(2)+' '+
            next.cx.toFixed(2)+' '+next.my.toFixed(2);
        }
        p.push('<path d="'+d+'" class="mixed-chart-line"/>');
      }
      segment=[];
    };
    for(const item of coords){
      if(item.my===null){flush();continue;}
      // A gap in the monthly series is not an observed measurement.
      if(segment.length&&item.month!==segment[segment.length-1].month+1)flush();
      segment.push(item);
    }
    flush();
    for(const item of coords){
      if(item.measured===null)continue;
      const center=item.cx.toFixed(2),cy=item.my.toFixed(2);
      p.push('<circle class="mixed-chart-dot-halo" cx="'+center+'" cy="'+cy+'" r="7"/>'+
        '<circle class="mixed-chart-dot" cx="'+center+'" cy="'+cy+'" r="4.5">'+
        '<title>'+months[item.month-1]+': volume medido '+show(item.measured)+' m³</title></circle>');
      const labelY=Math.min(268,Math.max(36,item.my+22));
      p.push('<text class="mixed-chart-measured" x="'+center+'" y="'+
        labelY.toFixed(2)+'" text-anchor="middle">'+show(item.measured)+'</text>');
    }
    return '<div class="mixed-chart-scroll"><svg class="mixed-chart-svg" viewBox="0 0 1000 318" role="img" '+
      'aria-label="Volumes faturado e medido comparados por mês, em metros cúbicos">'+
      '<defs><linearGradient id="mixed-volume-gradient" x1="0" x2="0" y1="0" y2="1">'+
      '<stop offset="0%" stop-color="#24afe0"/><stop offset="100%" stop-color="#244b87"/>'+
      '</linearGradient></defs>'+p.join('')+'</svg></div>';
  }
  function yearControl(yr){
    const max=currentYear();
    let options='';
    for(let n=max;n>=2022;n--)options+='<option value="'+n+'"'+(n===yr?' selected':'')+'>'+n+'</option>';
    return '<label class="mixed-year-label" for="mixed-year">Ano <select id="mixed-year" '+
      'onchange="chooseConsumptionYear(this.value)" aria-label="Ano do histórico de consumo">'+
      options+'</select></label>';
  }
  function summary(rows){
    return '<div class="mixed-summary">'+
      '<div class="mixed-summary-block"><span class="mixed-summary-icon mixed-summary-icon-blue" aria-hidden="true">'+
      '<svg viewBox="0 0 24 24"><path d="M4 20v-7M10 20V5M16 20v-10M22 20v-5"/></svg></span>'+
      '<div><div class="mixed-summary-title">Média do volume faturado</div>'+
      '<strong>'+avg(rows,'billed')+'</strong></div></div>'+
      '<div class="mixed-summary-block"><span class="mixed-summary-icon mixed-summary-icon-green" aria-hidden="true">'+
      '<svg viewBox="0 0 24 24"><path d="m3 16 6-6 4 4 8-9"/></svg></span>'+
      '<div><div class="mixed-summary-title">Média do volume medido</div>'+
      '<strong>'+avg(rows,'measured')+'</strong></div></div></div>';
  }

  function chartContent(){
    const yr=year(),result=historyFor(yr);
    let content='';
    if(!result){
      content='<div class="mixed-chart-loading" role="status">Consultando o histórico real no VerSan...</div>';
    }else if(result.error){
      content='<div class="mixed-chart-loading" role="alert">'+esc(result.error)+'</div>';
    }else{
      const {rows,repeated}=rowsFor(result.data,yr);
      if(!rows.length){
        content='<div class="mixed-chart-loading">Nenhum histórico disponível para '+yr+'.</div>';
      }else{
        content=graph(rows)+summary(rows);
        if(!rows.some(x=>x.measured!==null))
          content+='<p class="mixed-chart-note">O VerSan não retornou volumes medidos para esse exercício.</p>';
        if(repeated)content+='<p class="mixed-chart-note">Foram encontrados registros repetidos para uma mesma competência. Os valores devem ser conferidos com o VerSan.</p>';
      }
    }
    return '<section class="module consumption-mixed">'+
      '<div class="mixed-top"><div class="mixed-header">'+
      '<div class="kicker">HISTÓRICO DE CONSUMO</div>'+
      '<h2>Volume faturado x medido por mês</h2>'+
      '<p>Comparativo mensal de volumes em '+yr+' (m³).</p></div>'+
      '<div class="mixed-tools"><div class="mixed-legend" aria-label="Legenda do gráfico">'+
      '<span class="mixed-legend-item"><i class="mixed-legend-bar"></i>Volume faturado (m³)</span>'+
      '<span class="mixed-legend-item"><i class="mixed-legend-line"></i>Volume medido (m³)</span>'+
      '</div>'+yearControl(yr)+'</div></div>'+content+'</section>';
  }

  consumptionPage=function(){
    if(!state.logged||route()!=='consumo')return layout('Histórico de consumo',
      'Acompanhe seu consumo ao longo dos meses.','');
    const name=person(),cdc=esc(String(state.current||''));
    const identity='<div class="docs-real-identity" aria-label="Identificação do consumidor e do imóvel">'+
      '<div><span>CONSUMIDOR</span><strong>'+esc(name)+'</strong></div>'+
      '<div><span>MATRÍCULA</span><strong>CDC '+cdc+'</strong></div>'+
      '<div><span>INDICADORES EXIBIDOS</span><strong>Volume faturado e medido (m³)</strong></div></div>';
    let html=layout('Histórico de consumo','Acompanhe seu consumo ao longo dos meses.',chartContent());
    html=html.replace('ÁREA DO CONSUMIDOR · DEMONSTRAÇÃO','ÁREA DO CONSUMIDOR');
    html=html.replace(/<div class="banner-demo" style="margin-bottom:18px">Você está explorando uma [\s\S]*?<\/div>/,identity);
    html=html.replace(/(<div class="user-brief"><b>)[\s\S]*?(<\/b>)/,
      (_match,left,right)=>left+esc(name)+right);
    html=html.replace('Sair da demonstração','Sair da conta');
    return html;
  };
  window.chooseConsumptionYear=function(value){
    const yr=Number(value),max=currentYear();
    if(!state.logged||!Number.isInteger(yr)||yr<2022||yr>max)return;
    selectedForUser=session.user;
    selectedYear=yr;
    if(route()==='consumo')render();
  };
})();
