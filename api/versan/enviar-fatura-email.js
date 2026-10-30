'use strict';
/*
 * POST /api/versan/enviar-fatura-email — envia a 2ª via OFUSCADA por e-mail (email-quick.js).
 *  { cdc, idFatura, email } -> { ok:true }
 * Não altera o cadastro: é um envio pontual. A fatura precisa estar entre os débitos do CDC.
 *
 * Variáveis de ambiente (SMTP):
 *  SMTP_HOST, SMTP_PORT (padrão 587), SMTP_SECURE ("true" para 465), SMTP_USER, SMTP_PASS (ou SMTP_PASSWORD)
 *  EMAIL_FROM (ou SMTP_FROM)  ex.: "ANE Agência Virtual <naoresponda@ane.com.br>"
 *
 * Regras do piloto (mesmos nomes do projeto original de Andradas):
 *  INVOICE_EMAIL_PDF_APPROVED  se definida, o envio só funciona com "yes" (ou "true") (aprovação do PDF ofuscado)
 *  INVOICE_EMAIL_PILOT_TO      se definida, só envia para esses e-mails (separados por vírgula)
 */
const V = require('../_lib/versan');
const H = require('../_lib/http');
const P = require('../_lib/publico');

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function ref(r) {
  const m = String(r || '').match(/^(\d{4})(\d{2})$/);
  return m ? m[2] + '/' + m[1] : String(r || '');
}

function brl(v) {
  return typeof v === 'number' ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';
}

function html(f) {
  return '<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f7fb;font-family:Ubuntu,Verdana,Tahoma,Arial,sans-serif;color:#223367">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px">' +
    '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">' +
    '<tr><td style="background:#1D4696;padding:22px 28px;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:.5px">ANE <span style="font-size:12px;font-weight:400;color:#cfe6f7;letter-spacing:2px">· AGÊNCIA VIRTUAL</span></td></tr>' +
    '<tr><td style="height:5px;background:#319DD9"></td></tr>' +
    '<tr><td style="padding:28px">' +
    '<h1 style="margin:0 0 12px;font-size:20px;color:#1D4696">Sua segunda via chegou</h1>' +
    '<p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#45607e">Conforme solicitado na Agência Virtual, segue em anexo a segunda via da fatura abaixo, com dados pessoais ofuscados.</p>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f7fc;border:1px solid #dbe9f4;border-radius:10px;font-size:13px">' +
    '<tr><td style="padding:12px 16px;color:#6a849c">Fatura</td><td style="padding:12px 16px;text-align:right;font-weight:700">Nº ' + esc(f.idFatura) + '</td></tr>' +
    '<tr><td style="padding:0 16px 12px;color:#6a849c">Referência</td><td style="padding:0 16px 12px;text-align:right;font-weight:700">' + esc(ref(f.referencia)) + '</td></tr>' +
    '<tr><td style="padding:0 16px 12px;color:#6a849c">Vencimento</td><td style="padding:0 16px 12px;text-align:right;font-weight:700">' + esc(f.vencimento || '—') + '</td></tr>' +
    '<tr><td style="padding:0 16px 12px;color:#6a849c">Valor</td><td style="padding:0 16px 12px;text-align:right;font-weight:700">' + esc(brl(f.valor)) + '</td></tr></table>' +
    '<p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#6a849c">Antes de pagar, confira beneficiário e valor no aplicativo do seu banco. Se você não fez esta solicitação, ignore esta mensagem.</p>' +
    '</td></tr><tr><td style="padding:16px 28px;background:#223367;color:#cfe0f2;font-size:11px">Saneamento é saúde · ANE · Mensagem automática, não responda.</td></tr>' +
    '</table></td></tr></table></body></html>';
}

/** Regras do piloto: aprovação do PDF e lista de destinatários permitidos. */
function regrasPiloto(email) {
  const aprovado = V.env('INVOICE_EMAIL_PDF_APPROVED');
  if (process.env.INVOICE_EMAIL_PDF_APPROVED !== undefined && !/^(yes|true|1|sim)$/i.test(aprovado)) {
    throw new V.VerSanError('Envio por e-mail ainda não liberado neste ambiente.', 503);
  }
  const piloto = V.env('INVOICE_EMAIL_PILOT_TO');
  if (piloto) {
    const lista = piloto.split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
    if (!lista.includes(email.toLowerCase())) throw new V.VerSanError('Neste piloto, o envio só é permitido para e-mails autorizados.', 403);
  }
}

function transport() {
  const host = V.env('SMTP_HOST'), from = V.env('EMAIL_FROM');
  // Remetente sempre com o nome desta agência (o endereço vem da configuração).
  const endereco = from ? (String(from).match(/<([^>]+)>/) || [, String(from)])[1].trim() : '';
  if (!host || !from) throw new V.VerSanError('Envio de e-mail não configurado (SMTP_HOST / SMTP_FROM).', 503);
  const nodemailer = require('nodemailer');
  const port = Number(V.env('SMTP_PORT')) || 587;
  const user = V.env('SMTP_USER'), pass = V.env('SMTP_PASS');
  return {
    from: endereco ? { name: 'ANE Agência Virtual', address: endereco } : from,
    t: nodemailer.createTransport({
      host, port, secure: V.env('SMTP_SECURE') === 'true' || port === 465,
      auth: user ? { user, pass } : undefined,
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000
    })
  };
}

module.exports = async function (req, res) {
  if (!H.guard(req, res)) return;
  try {
    if (req.headers['x-requested-with'] !== 'XMLHttpRequest') return H.send(res, 400, { ok: false, mensagem: 'Requisição inválida.' });
    const body = await H.readBody(req);
    const cdc = P.cdcValido(body.cdc);
    const idFatura = P.idFaturaValido(body.idFatura);
    const email = String(body.email || '').trim();
    if (email.length > 254 || !EMAIL_RE.test(email)) return H.send(res, 400, { ok: false, mensagem: 'Informe um e-mail válido.' });
    regrasPiloto(email);

    const hora = 60 * 60 * 1000;
    if (!H.rateLimit('mail:ip:' + H.clientIp(req), 5, hora) ||
        !H.rateLimit('mail:to:' + email.toLowerCase(), 3, hora) ||
        !H.rateLimit('mail:fat:' + idFatura, 3, hora)) {
      return H.send(res, 429, { ok: false, mensagem: 'Limite de envios atingido. Tente novamente mais tarde.' });
    }

    const f = await P.faturaDoCdc(cdc, idFatura);
    const pdf = V.pdfDeBase64(await V.call('getSegundaViaOfuscada', { idFaturaSegundaVia: idFatura }));
    const { t, from } = transport();
    await t.sendMail({
      from, to: email,
      subject: 'ANE · Segunda via da fatura nº ' + idFatura,
      text: 'Segue em anexo a segunda via da fatura nº ' + idFatura + ' (referência ' + ref(f.referencia) + ', vencimento ' + (f.vencimento || '—') + ', valor ' + brl(f.valor) + '). Dados pessoais ofuscados. Confira beneficiário e valor antes de pagar.',
      html: html(f),
      attachments: [{ filename: 'segunda-via-ane-' + idFatura + '.pdf', content: pdf, contentType: 'application/pdf' }]
    });
    console.info('[enviar-fatura-email] enviado', { idFatura }); // sem e-mail/CPF em log
    return H.send(res, 200, { ok: true });
  } catch (e) {
    if (e instanceof V.VerSanError) return H.send(res, e.status, { ok: false, mensagem: e.message });
    console.error('[enviar-fatura-email]', e && e.message);
    return H.send(res, 502, { ok: false, mensagem: 'Não foi possível enviar o e-mail agora. Tente mais tarde.' });
  }
};
