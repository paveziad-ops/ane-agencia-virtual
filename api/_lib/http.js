'use strict';
/*
 * Utilidades HTTP comuns às funções /api/versan/*:
 * cabeçalhos de segurança, leitura do corpo JSON, verificação de origem,
 * limite simples de requisições e sessão em cookie cifrado (AES-256-GCM).
 *
 * Variáveis de ambiente:
 *  SESSION_SECRET (ou HOMOLOGATION_SESSION_SECRET)  segredo longo e aleatório do cookie de sessão (obrigatória para login)
 *  SESSION_MAX_MINUTES  duração da sessão inativa (padrão 30)
 *  ALLOWED_ORIGINS      origens extras aceitas, separadas por vírgula (opcional)
 */
const crypto = require('crypto');
const { VerSanError, env } = require('./versan');

const COOKIE = 'ane_av_sessao';

function secure(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function send(res, status, obj) {
  secure(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

function sendPdf(res, buf, nome) {
  secure(res);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', String(buf.length));
  res.setHeader('Content-Disposition', 'attachment; filename="' + nome.replace(/[^\w.-]/g, '') + '"');
  res.end(buf);
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let raw = '';
  if (typeof req.body === 'string') raw = req.body;
  else if (Buffer.isBuffer(req.body)) raw = req.body.toString('utf8');
  else {
    raw = await new Promise((resolve, reject) => {
      let s = '';
      req.on('data', c => { s += c; if (s.length > 32768) { reject(new VerSanError('Requisição muito grande.', 413)); req.destroy(); } });
      req.on('end', () => resolve(s));
      req.on('error', reject);
    });
  }
  if (!raw) return {};
  try { const o = JSON.parse(raw); return o && typeof o === 'object' ? o : {}; }
  catch { throw new VerSanError('JSON inválido.', 400); }
}

/** Aceita somente POST e, se o navegador informar Origin, exige a mesma origem. */
function guard(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    send(res, 405, { mensagem: 'Método não permitido' });
    return false;
  }
  const origin = req.headers.origin;
  if (origin) {
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    const extras = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    let ok = false;
    try { ok = new URL(origin).host === host || extras.includes(origin); } catch { ok = false; }
    if (!ok) { send(res, 403, { mensagem: 'Origem não autorizada.' }); return false; }
  }
  return true;
}

function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || req.socket?.remoteAddress || 'desconhecido';
}

/* Limite em memória por instância (melhor esforço; para produção, usar um store compartilhado). */
const buckets = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now > b.reset) { b = { n: 0, reset: now + windowMs }; buckets.set(key, b); }
  b.n++;
  if (buckets.size > 5000) for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
  return b.n <= max;
}

/* ------------------------------ sessão ------------------------------ */

function key() {
  const s = env('SESSION_SECRET');
  if (s.length < 32) throw new VerSanError('Sessão não configurada (SESSION_SECRET com 32+ caracteres).', 503);
  return crypto.createHash('sha256').update(s).digest();
}

function maxAgeSec() {
  const m = Number(process.env.SESSION_MAX_MINUTES);
  return (Number.isFinite(m) && m >= 5 && m <= 240 ? m : 30) * 60;
}

function seal(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64url');
}

function unseal(token) {
  try {
    const raw = Buffer.from(token, 'base64url');
    if (raw.length < 29) return null;
    const d = crypto.createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8'));
  } catch { return null; }
}

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function isLocal(req) {
  const h = String(req.headers.host || '');
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(h);
}

function setSession(req, res, data) {
  const exp = Date.now() + maxAgeSec() * 1000;
  const v = seal(Object.assign({}, data, { exp }));
  res.setHeader('Set-Cookie', COOKIE + '=' + v + '; Path=/api/versan; HttpOnly; SameSite=Strict; Max-Age=' + maxAgeSec() + (isLocal(req) ? '' : '; Secure'));
}

function clearSession(req, res) {
  res.setHeader('Set-Cookie', COOKIE + '=; Path=/api/versan; HttpOnly; SameSite=Strict; Max-Age=0' + (isLocal(req) ? '' : '; Secure'));
}

function getSession(req) {
  const v = cookies(req)[COOKIE];
  if (!v) return null;
  const s = unseal(v);
  if (!s || typeof s.exp !== 'number' || Date.now() > s.exp) return null;
  return s;
}

/** Converte qualquer erro em resposta JSON sem vazar detalhes internos. */
function fail(res, e) {
  const status = e instanceof VerSanError ? e.status : 500;
  const mensagem = e instanceof VerSanError ? e.message : 'Erro interno ao consultar o VerSan.';
  if (!(e instanceof VerSanError)) console.error('[api/versan]', e && e.stack || e);
  send(res, status, { mensagem, codigo: e && e.code });
}

module.exports = { send, sendPdf, readBody, guard, clientIp, rateLimit, setSession, clearSession, getSession, fail };
