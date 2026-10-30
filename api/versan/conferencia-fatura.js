'use strict';
/*
 * POST /api/versan/conferencia-fatura — titular e endereço OFUSCADOS para conferir antes de pagar (bridge-confirmacao-fatura.js).
 *  { cdc, idFatura } -> { ok:true, titularOfuscado, enderecoOfuscado, documentoOfuscado? }
 *
 * Fonte: a própria 2ª via ofuscada do VerSan (getSegundaViaOfuscada).
 *  - Titular: campo "Inquilino:" (ou "Proprietário:"), que o VerSan já entrega ofuscado.
 *  - CPF/CNPJ: campo "CPF/CNPJ:", quando houver (já vem parcialmente oculto pelo VerSan).
 *  - Endereço: campo "Endereço:", que vem completo; é ofuscado aqui antes de sair do servidor.
 */
const V = require('../_lib/versan');
const H = require('../_lib/http');
const P = require('../_lib/publico');
const T = require('../_lib/pdf-texto');

/** Garante ofuscação do nome mesmo que o PDF venha sem máscara. */
function ofuscaNome(nome) {
  const s = String(nome || '').trim();
  if (!s) return '';
  if (s.includes('*')) return s; // já ofuscado pelo VerSan
  return s.split(/\s+/).map((p, i) => {
    if (i > 0 && /^(DA|DE|DO|DAS|DOS|E)$/i.test(p)) return p.toUpperCase();
    const keep = i === 0 ? Math.min(p.length, 10) : 1;
    return p.slice(0, keep).toUpperCase() + (p.length > keep ? '*'.repeat(4) : '');
  }).join(' ');
}

/**
 * "RAIOS DE SOL, 503 , SOL NASCENTE - SANTA RITA - PB - 00000-115 QD:305 LT:160"
 *   -> "RAIOS D** S**, *** · SOL NASCENTE · SANTA RITA - PB"
 * Mantém a 1ª palavra da rua, o bairro, a cidade e a UF; esconde o restante da rua, número, CEP, quadra e lote.
 */
function ofuscaEndereco(end) {
  const partes = String(end || '').split(/\s+-\s+/).map(s => s.trim()).filter(Boolean);
  if (!partes.length) return '';
  const [ruaNumBairro, cidade, uf] = partes;
  const blocos = ruaNumBairro.split(',').map(s => s.trim()).filter(Boolean);
  const rua = (blocos[0] || '').split(/\s+/);
  const ruaOf = rua.length ? [rua[0].toUpperCase()].concat(rua.slice(1).map(w =>
    /^(DA|DE|DO|DAS|DOS|E)$/i.test(w) ? w.charAt(0).toUpperCase() + '*'.repeat(w.length - 1) : w.charAt(0).toUpperCase() + '**')).join(' ') : '';
  const bairro = blocos.length > 2 ? blocos[blocos.length - 1] : '';
  const local = [cidade, uf && /^[A-Z]{2}$/.test(uf) ? uf : ''].filter(Boolean).join(' - ');
  return [ruaOf ? ruaOf + ', ***' : '', bairro, local].filter(Boolean).join(' · ');
}

/**
 * CPF/CNPJ com só alguns números visíveis. Se o VerSan já mandou com "*", mantém como veio;
 * se vier completo, oculta aqui (CPF ***.456.789-**, CNPJ **.345.678/****-**). Formato estranho = não mostra.
 */
function ofuscaDocumento(doc) {
  const s = String(doc || '').trim();
  if (!s || s.length > 25 || !/^[\d.\-\/* ]+$/.test(s)) return '';
  if (s.includes('*')) return /\d/.test(s) ? s : '';
  const d = s.replace(/\D/g, '');
  if (d.length === 11) return '***.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-**';
  if (d.length === 14) return '**.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/****-**';
  return '';
}

module.exports = async function (req, res) {
  if (!H.guard(req, res)) return;
  try {
    const body = await H.readBody(req);
    const cdc = P.cdcValido(body.cdc);
    const idFatura = P.idFaturaValido(body.idFatura);
    if (!P.limitar(req, res, 'conferencia', 40)) return;

    await P.faturaDoCdc(cdc, idFatura);
    const pdf = V.pdfDeBase64(await V.call('getSegundaViaOfuscada', { idFaturaSegundaVia: idFatura }));
    const lista = T.textos(pdf);
    const nome = T.valorDoRotulo(lista, 'Inquilino:') || T.valorDoRotulo(lista, 'Proprietário:');
    const endereco = T.valorDoRotulo(lista, 'Endereço:');
    const documentoOfuscado = ofuscaDocumento(T.valorDoRotulo(lista, 'CPF/CNPJ:'));
    const titularOfuscado = ofuscaNome(nome);
    const enderecoOfuscado = ofuscaEndereco(endereco);
    if (!titularOfuscado || !enderecoOfuscado) {
      return H.send(res, 502, { ok: false, mensagem: 'Não foi possível ler titular e endereço da segunda via.' });
    }
    return H.send(res, 200, documentoOfuscado ? { ok: true, titularOfuscado, enderecoOfuscado, documentoOfuscado } : { ok: true, titularOfuscado, enderecoOfuscado });
  } catch (e) {
    return H.fail(res, e);
  }
};

module.exports._interno = { ofuscaNome, ofuscaEndereco, ofuscaDocumento };
