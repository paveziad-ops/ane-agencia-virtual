'use strict';
/*
 * POST /api/versan/conferencia-fatura — titular e endereço OFUSCADOS para conferir antes de pagar (bridge-confirmacao-fatura.js).
 *  { cdc, idFatura } -> { ok:true, titularOfuscado, enderecoOfuscado }
 *
 * ATENÇÃO: a collection do VerSan não tem método público que devolva titular/endereço a partir do CDC.
 * Esses dados só vêm de getAutenticacaoPessoa (login). Por isso:
 *  - com sessão ativa e CDC da própria conta  -> devolve os dados ofuscados da sessão;
 *  - sem sessão                                -> 501 {ok:false}; o frontend mostra o aviso padrão
 *    ("Nome e endereço indisponíveis... confira a segunda via antes de pagar").
 * Quando o VerSan disponibilizar um método para isso, basta trocar o trecho marcado abaixo.
 */
const V = require('../_lib/versan');
const H = require('../_lib/http');
const P = require('../_lib/publico');

function ofuscaNome(nome) {
  return String(nome || '').trim().split(/\s+/).filter(Boolean).map((p, i) => {
    if (i > 0 && /^(DA|DE|DO|DAS|DOS|E)$/i.test(p)) return p.toUpperCase();
    return p.slice(0, i === 0 ? 3 : 1).toUpperCase() + '*'.repeat(Math.max(2, Math.min(6, p.length - (i === 0 ? 3 : 1))));
  }).join(' ');
}

function ofuscaEndereco(end) {
  const partes = String(end || '').split(' · ');
  const rua = (partes[0] || '').split(',')[0].trim().split(/\s+/);
  const ruaOf = rua.length ? rua[0].toUpperCase() + (rua.length > 1 ? ' ' + rua.slice(1).map(w => w.charAt(0).toUpperCase() + '***').join(' ') : '') + ', ***' : '';
  const cidade = partes.length > 1 ? partes[partes.length - 1] : '';
  return [ruaOf, cidade].filter(Boolean).join(' · ');
}

module.exports = async function (req, res) {
  if (!H.guard(req, res)) return;
  try {
    const body = await H.readBody(req);
    const cdc = P.cdcValido(body.cdc);
    const idFatura = P.idFaturaValido(body.idFatura);
    if (!P.limitar(req, res, 'conferencia', 40)) return;

    const s = H.getSession(req);
    const imovel = s && s.im.find(i => i.c === cdc);
    if (imovel && s.n && imovel.a) {
      await P.faturaDoCdc(cdc, idFatura);
      return H.send(res, 200, { ok: true, titularOfuscado: ofuscaNome(s.n), enderecoOfuscado: ofuscaEndereco(imovel.a) });
    }

    // >>> Sem método público no VerSan para titular/endereço por CDC (ver cabeçalho).
    return H.send(res, 501, { ok: false, mensagem: 'Conferência de titular indisponível para consulta sem login.' });
  } catch (e) {
    return H.fail(res, e);
  }
};

module.exports._interno = { ofuscaNome, ofuscaEndereco };
