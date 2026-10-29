'use strict';
/*
 * POST /api/versan/segunda-via-publica — "2ª via fácil", sem login (bridge-quick.js).
 *  { acao:'consultar',    cdc }            -> { cdc, faturas:[{idFatura, referencia, valor, vencimento}] }   (getFaturaEmDebito)
 *  { acao:'codigoBarras', cdc, idFatura }  -> { codigoDigitavel, codigoLeitor }                           (getCodigoBarras)
 *  { acao:'segundaVia',   cdc, idFatura }  -> PDF com dados pessoais ofuscados                            (getSegundaViaOfuscada)
 */
const V = require('../_lib/versan');
const H = require('../_lib/http');
const P = require('../_lib/publico');

module.exports = async function (req, res) {
  if (!H.guard(req, res)) return;
  try {
    const body = await H.readBody(req);
    const acao = String(body.acao || '');
    const cdc = P.cdcValido(body.cdc);

    if (acao === 'consultar') {
      if (!P.limitar(req, res, 'consulta', 40)) return;
      const faturas = (await P.debitosPublicos(cdc)).map(P.resumo);
      return H.send(res, 200, { cdc, total: faturas.length, faturas });
    }

    if (acao === 'codigoBarras') {
      if (!P.limitar(req, res, 'barras', 60)) return;
      const idFatura = P.idFaturaValido(body.idFatura);
      await P.faturaDoCdc(cdc, idFatura);
      const d = await V.call('getCodigoBarras', { idFatura });
      if (!d || typeof d.codigoDigitavel !== 'string') throw new V.VerSanError('O VerSan não retornou o código de barras.', 502);
      return H.send(res, 200, { idFatura, codigoDigitavel: d.codigoDigitavel, codigoLeitor: d.codigoLeitor || '' });
    }

    if (acao === 'segundaVia') {
      if (!P.limitar(req, res, 'pdf', 30)) return;
      const idFatura = P.idFaturaValido(body.idFatura);
      await P.faturaDoCdc(cdc, idFatura);
      const d = await V.call('getSegundaViaOfuscada', { idFaturaSegundaVia: idFatura });
      return H.sendPdf(res, V.pdfDeBase64(d), 'segunda-via-ofuscada-' + idFatura + '.pdf');
    }

    return H.send(res, 400, { mensagem: 'Ação inválida.' });
  } catch (e) {
    return H.fail(res, e);
  }
};
