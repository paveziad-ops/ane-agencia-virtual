'use strict';
/*
 * POST /api/versan/pix-rapido — Pix da "2ª via fácil", sem login (bridge-quick.js).
 *  { acao:'pix', cdc, idFatura } -> { idFatura, codigoPix }   (getCodigoPixEstatico)
 * A fatura precisa estar entre os débitos do CDC informado.
 */
const V = require('../_lib/versan');
const H = require('../_lib/http');
const P = require('../_lib/publico');

module.exports = async function (req, res) {
  if (!H.guard(req, res)) return;
  try {
    const body = await H.readBody(req);
    if (body.acao !== undefined && body.acao !== 'pix') return H.send(res, 400, { mensagem: 'Ação inválida.' });
    const cdc = P.cdcValido(body.cdc);
    const idFatura = P.idFaturaValido(body.idFatura);
    if (!P.limitar(req, res, 'pix', 60)) return;
    await P.faturaDoCdc(cdc, idFatura);
    const d = await V.call('getCodigoPixEstatico', { idFatura });
    if (!d || typeof d.codigoPix !== 'string' || d.codigoPix.length < 20) throw new V.VerSanError('O VerSan não retornou o Pix desta fatura.', 502);
    return H.send(res, 200, { idFatura, codigoPix: d.codigoPix });
  } catch (e) {
    return H.fail(res, e);
  }
};
