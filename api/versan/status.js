'use strict';
// GET /api/versan/status — diagnóstico de configuração (não expõe valores, só se existem).
const V=require('../_lib/versan');
module.exports=function(req,res){
 res.setHeader('Cache-Control','private,no-store,max-age=0');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({erro:'Metodo nao permitido'})}
 const has=k=>!!V.env(k);
 const identity=has('VERSAN_APPLICATION_LOGIN')&&has('VERSAN_APPLICATION_PASSWORD');
 const dataSource=has('VERSAN_DATASOURCE')||has('VERSAN_SECRET');
 const sessao=V.env('SESSION_SECRET').length>=32;
 const email=has('SMTP_HOST')&&has('EMAIL_FROM');
 return res.status(200).json({
  ambiente:'homologacao',base:'ANE',origem:'VerSan',
  servidorVerSan:(V.env('VERSAN_BASE_URL')||V.DEFAULT_BASE_URL),
  apis:['cliente','segunda-via-publica','pix-rapido','conferencia-fatura','enviar-fatura-email'],
  configuracao:{credenciaisAplicacao:identity,fonteDados:dataSource,sessao,matriculasRestritas:has('HOMOLOGATION_MATRICULAS'),email},
  consultaRealDisponivel:identity&&dataSource,
  loginDisponivel:identity&&dataSource&&sessao,
  envioEmailDisponivel:email
 });
};
