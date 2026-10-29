'use strict';
/*
 * Regras comuns da "2ª via fácil" (consulta pública só com a matrícula/CDC).
 * Conforme a documentação de getFaturaEmDebito: "Para a 2ª via fácil, informar somente o idLigacao".
 * Toda fatura pedida (Pix, código de barras, PDF, e-mail) precisa estar entre os débitos do CDC informado.
 */
const V = require('./versan');
const H = require('./http');

function cdcValido(v) {
  const d = V.onlyDigits(v);
  if (!/^\d{1,10}$/.test(d) || Number(d) < 1) throw new V.VerSanError('Informe uma matrícula (CDC) válida.', 400);
  const cdc = String(Number(d));
  if (!V.cdcPermitido(cdc)) throw new V.VerSanError('Matrícula não liberada neste ambiente de homologação.', 403);
  return cdc;
}

function idFaturaValido(v) {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n <= 0) throw new V.VerSanError('Fatura inválida.', 400);
  return n;
}

function limitar(req, res, nome, max) {
  if (H.rateLimit('pub:' + nome + ':' + H.clientIp(req), max, 10 * 60 * 1000)) return true;
  H.send(res, 429, { mensagem: 'Muitas consultas seguidas. Aguarde alguns minutos.' });
  return false;
}

async function debitosPublicos(cdc) {
  const d = await V.call('getFaturaEmDebito', { idLigacao: Number(cdc) });
  return V.normalizaDebitos(d);
}

/** Garante que a fatura pertence ao CDC e devolve seus dados. */
async function faturaDoCdc(cdc, idFatura) {
  const f = (await debitosPublicos(cdc)).find(x => x.idFatura === idFatura);
  if (!f) throw new V.VerSanError('Fatura não encontrada entre os débitos desta matrícula.', 404);
  return f;
}

/** Somente o necessário para escolher e pagar a fatura. */
function resumo(f) {
  return { idFatura: f.idFatura, referencia: f.referencia, valor: f.valor, vencimento: f.vencimento, vencida: f.vencida || f.vencidaPorData };
}

module.exports = { cdcValido, idFaturaValido, limitar, debitosPublicos, faturaDoCdc, resumo };
