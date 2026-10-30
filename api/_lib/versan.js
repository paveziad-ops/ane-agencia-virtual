'use strict';
/*
 * Cliente do VerSan (API "Agência Virtual"), conforme a collection Postman
 * "Api - VerSan - Agência Virtual".
 *
 * Fluxo de autenticação documentado:
 *  1. getSecret  (sem token)          -> dataSource (passado em todas as chamadas)
 *  2. getAutenticacaoAplicacao        -> token Bearer (validade em segundos)
 *  3. demais métodos com Authorization: Bearer <token> e { dataSource } no corpo
 *
 * Variáveis de ambiente:
 *  VERSAN_BASE_URL               padrão: https://app.versan.com.br
 *  VERSAN_APPLICATION_LOGIN      login do integrador          (obrigatória)
 *  VERSAN_APPLICATION_PASSWORD   senha do integrador          (obrigatória)
 *  VERSAN_DATASOURCE             dataSource fixo (dispensa getSecret)
 *  VERSAN_SECRET                 segredo para getSecret (se não houver VERSAN_DATASOURCE)
 *  VERSAN_SECRET_URL             URL completa de getSecret (opcional; padrão: BASE + rota documentada)
 *  VERSAN_TIMEOUT_MS             tempo-limite por chamada (padrão 25000)
 */

const PATHS = {
  getSecret: '/Autenticacao/AutenticacaoServices/getSecret',
  getAutenticacaoAplicacao: '/VerSanSegurancaService/SegurancaServices/getAutenticacaoAplicacao',
  getAutenticacaoPessoa: '/VerSanIntegracaoService/IntegracaoServices/getAutenticacaoPessoa',
  getFaturaEmDebito: '/VerSanIntegracaoService/IntegracaoServices/getFaturaEmDebito',
  getFaturaPaga: '/VerSanIntegracaoService/IntegracaoServices/getFaturaPaga',
  getHistoricoConsumo: '/VerSanIntegracaoService/IntegracaoServices/getHistoricoConsumo',
  getCodigoBarras: '/VerSanIntegracaoService/IntegracaoServices/getCodigoBarras',
  getCodigoPixEstatico: '/VerSanIntegracaoService/IntegracaoServices/getCodigoPixEstatico',
  getSegundaVia: '/VerSanIntegracaoService/RelatorioServices/getSegundaVia',
  getSegundaViaOfuscada: '/VerSanIntegracaoService/RelatorioServices/getSegundaViaOfuscada',
  getServicos: '/VerSanIntegracaoService/IntegracaoServices/getServicos'
};

class VerSanError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status || 502;
    this.code = code;
  }
}

const cache = { dataSource: null, token: null, tokenExpira: 0, tokenPromise: null };

/* Nomes alternativos aceitos (os mesmos usados no projeto de Andradas). */
const ALIASES = {
  SESSION_SECRET: ['HOMOLOGATION_SESSION_SECRET'],
  SMTP_PASS: ['SMTP_PASSWORD'],
  EMAIL_FROM: ['SMTP_FROM']
};
const DEFAULT_BASE_URL = 'https://app.versan.com.br';

function env(name) {
  for (const n of [name].concat(ALIASES[name] || [])) {
    const v = process.env[n];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function baseUrl() {
  return (env('VERSAN_BASE_URL') || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function timeoutMs() {
  const n = Number(env('VERSAN_TIMEOUT_MS'));
  return Number.isFinite(n) && n >= 3000 ? n : 25000;
}

async function rawPost(url, body, token) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  let r;
  try {
    r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs()) });
  } catch (e) {
    const timeout = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    throw new VerSanError(timeout ? 'O VerSan demorou a responder.' : 'Não foi possível conectar ao VerSan.', 504);
  }
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (r.status === 401) throw new VerSanError('Acesso não autorizado pelo VerSan.', 401, 401);
  if (r.status === 404) throw new VerSanError('Serviço do VerSan não encontrado.', 502, 404);
  if (!r.ok) throw new VerSanError((data && data.mensagem) || 'O VerSan não concluiu a operação.', 502, r.status);
  if (data === null) throw new VerSanError('O VerSan retornou uma resposta inválida.', 502);
  return data;
}

async function getDataSource() {
  if (cache.dataSource) return cache.dataSource;
  const fixed = env('VERSAN_DATASOURCE');
  if (fixed) return (cache.dataSource = fixed);
  const secret = env('VERSAN_SECRET');
  if (!secret) throw new VerSanError('Integração VerSan não configurada (VERSAN_DATASOURCE ou VERSAN_SECRET).', 503);
  const url = env('VERSAN_SECRET_URL') || baseUrl() + PATHS.getSecret;
  const d = await rawPost(url, { secret });
  if (!d || typeof d.dataSource !== 'string' || !d.dataSource) throw new VerSanError('getSecret não retornou o dataSource.', 502);
  return (cache.dataSource = d.dataSource);
}

async function fetchToken() {
  const login = env('VERSAN_APPLICATION_LOGIN'), senha = env('VERSAN_APPLICATION_PASSWORD');
  if (!login || !senha) throw new VerSanError('Integração VerSan não configurada (credenciais da aplicação).', 503);
  const dataSource = await getDataSource();
  const d = await rawPost(baseUrl() + PATHS.getAutenticacaoAplicacao, { login, senha, dataSource });
  if (!d || typeof d.token !== 'string' || !d.token) throw new VerSanError('O VerSan não emitiu o token da aplicação.', 502);
  const validade = Number(d.tokenValidade);
  const segundos = Number.isFinite(validade) && validade > 0 ? validade : 240;
  cache.token = d.token;
  cache.tokenExpira = Date.now() + Math.max(15, segundos - 20) * 1000; // margem de segurança
  return cache.token;
}

async function token(force) {
  if (!force && cache.token && Date.now() < cache.tokenExpira) return cache.token;
  if (!cache.tokenPromise) cache.tokenPromise = fetchToken().finally(() => { cache.tokenPromise = null; });
  return cache.tokenPromise;
}

/** Chama um método documentado. Renova o token uma vez em caso de 401. */
async function call(method, params) {
  const path = PATHS[method];
  if (!path) throw new VerSanError('Método VerSan desconhecido: ' + method, 500);
  const dataSource = await getDataSource();
  const body = Object.assign({}, params || {}, { dataSource });
  try {
    return await rawPost(baseUrl() + path, body, await token(false));
  } catch (e) {
    if (e.code !== 401) throw e;
    cache.token = null;
    return rawPost(baseUrl() + path, body, await token(true));
  }
}

/* ------------------------- utilidades de domínio ------------------------- */

function onlyDigits(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }

function formatDocumento(v) {
  const d = onlyDigits(v);
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  return '';
}

function parseBRDate(s) {
  const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function hojeUTC() {
  // Data civil em Brasília (UTC-3), comparada como data UTC.
  const n = new Date(Date.now() - 3 * 3600 * 1000);
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

function num(v) {
  if (typeof v === 'number') return v;
  const n = Number(String(v == null ? '' : v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Normaliza o retorno de getFaturaEmDebito. */
function normalizaDebitos(lista) {
  const hoje = hojeUTC();
  const arr = Array.isArray(lista) ? lista : [];
  return arr.filter(x => x && Number(x.id) > 0).map(x => {
    const venc = parseBRDate(x.dataVencimento);
    const situacao = x.situacaoFatura && typeof x.situacaoFatura === 'object' ? x.situacaoFatura.situacaoFatura : x.situacaoFatura;
    return {
      idFatura: Number(x.id),
      referencia: String(x.referencia || ''),
      valor: num(x.valor),
      dataVencimento: x.dataVencimento || '',
      vencimento: x.dataVencimento || '',
      dataEmissao: x.dataEmissao || '',
      diasVencido: Number(x.diasVencido) || 0,
      vencida: x.vencida === true,
      vencidaPorData: venc ? venc < hoje : false,
      situacaoCobranca: situacao || '',
      tipoFatura: x.tipoFatura && typeof x.tipoFatura === 'object' ? x.tipoFatura.tipoFatura || '' : '',
      volumeFaturado: num(x.volumeFaturado),
      volumeMedido: num(x.volumeMedido)
    };
  });
}

function normalizaPagas(lista) {
  const arr = Array.isArray(lista) ? lista : [];
  return arr.filter(x => x && Number(x.idFatura) > 0).map(x => ({
    idFatura: Number(x.idFatura),
    valor: num(x.valor),
    dataVencimento: x.dataVencimento || '',
    dataPagamento: x.dataPagamento || '',
    dataEmissao: x.dataEmissao || '',
    referencia: refDeData(x.dataEmissao || x.dataLeitura),
    situacaoCobranca: x.situacaoFatura || 'PAGO',
    volumeFaturado: num(x.volumeFaturado),
    volumeMedido: num(x.volumeMedido)
  }));
}

function refDeData(s) {
  const m = String(s || '').match(/^\d{2}\/(\d{2})\/(\d{4})$/);
  return m ? m[2] + m[1] : '';
}

function normalizaConsumo(lista) {
  const arr = Array.isArray(lista) ? lista : [];
  return arr.filter(x => x && x.referencia).map(x => ({
    referencia: String(x.referencia),
    volumeMedido: num(x.volumeMedido),
    volumeFaturado: num(x.volumeFaturado),
    leituraAnterior: num(x.leituraAnterior),
    leituraAtual: num(x.leituraAtual),
    dataLeitura: x.dataLeitura || '',
    valor: num(x.valor),
    idFatura: Number(x.idFatura) || null
  }));
}

/** Converte a resposta {codigo, mensagem: base64} em Buffer PDF validado. */
function pdfDeBase64(d) {
  const b64 = d && typeof d.mensagem === 'string' ? d.mensagem.replace(/\s+/g, '') : '';
  if (!/^JVBERi0[A-Za-z0-9+/]*={0,2}$/.test(b64)) {
    throw new VerSanError((d && typeof d.mensagem === 'string' && d.mensagem.length < 300 && d.mensagem) || 'O VerSan não retornou o PDF da fatura.', 502);
  }
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < 80 || buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new VerSanError('O arquivo retornado não é um PDF válido.', 502);
  return buf;
}

/** Lista de matrículas liberadas em homologação (vazia = sem restrição). */
function matriculasPermitidas() {
  const raw = env('HOMOLOGATION_MATRICULAS');
  if (!raw) return null;
  return new Set(raw.split(/[\s,;]+/).map(onlyDigits).filter(Boolean).map(x => String(Number(x))));
}

/**
 * HOMOLOGATION_VINCULOS: tabela "CDC:idLigacao" separada por vírgula.
 * O CDC (matrícula que o cliente conhece) nem sempre é o id da ligação no VerSan.
 * Sem a tabela, assume-se CDC = idLigacao.
 */
function vinculos() {
  const raw = env('HOMOLOGATION_VINCULOS');
  const porCdc = new Map(), porLigacao = new Map();
  if (raw) {
    for (const par of raw.split(/[\s,;]+/)) {
      const m = par.match(/^\D*(\d+)\s*[:=>-]+\s*(\d+)\D*$/);
      if (!m) continue;
      const cdc = String(Number(m[1])), lig = String(Number(m[2]));
      porCdc.set(cdc, lig); porLigacao.set(lig, cdc);
    }
  }
  return { porCdc, porLigacao };
}

/** idLigacao do VerSan para um CDC informado pelo cliente. */
function ligacaoDoCdc(cdc) {
  const c = String(Number(onlyDigits(cdc)));
  return vinculos().porCdc.get(c) || c;
}

/** CDC (matrícula exibida) para um idLigacao retornado pelo VerSan. */
function cdcDaLigacao(idLigacao) {
  const l = String(Number(idLigacao));
  return vinculos().porLigacao.get(l) || l;
}

function cdcPermitido(cdc) {
  const set = matriculasPermitidas();
  return !set || set.has(String(Number(cdc)));
}

function configurado() {
  return !!(env('VERSAN_APPLICATION_LOGIN') && env('VERSAN_APPLICATION_PASSWORD') &&
    (env('VERSAN_DATASOURCE') || env('VERSAN_SECRET')));
}

module.exports = {
  call, VerSanError, PATHS, onlyDigits, formatDocumento, normalizaDebitos, normalizaPagas, normalizaConsumo,
  pdfDeBase64, cdcPermitido, matriculasPermitidas, ligacaoDoCdc, cdcDaLigacao, configurado, env, DEFAULT_BASE_URL,
  _cache: cache
};
