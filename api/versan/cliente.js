'use strict';
/*
 * POST /api/versan/cliente  — área logada da Agência Virtual.
 * Corpo: { acao, ...valores }   (contrato usado por bridge-*.js)
 *
 *  status                         -> dados da sessão atual (401 se não houver)
 *  entrar   {numeroDocumento, senha}  -> getAutenticacaoPessoa; abre sessão
 *  selecionar {cdc}               -> troca o imóvel selecionado
 *  sair                           -> encerra a sessão
 *  debitos                        -> getFaturaEmDebito (idLigacao + idInquilino)
 *  pagas    {ano}                 -> getFaturaPaga
 *  consumo  {ano}                 -> getHistoricoConsumo
 *  pix | barra | codigoBarras {idFatura} -> getCodigoPixEstatico / getCodigoBarras (somente fatura em débito do imóvel)
 *  pdf      {idFatura}            -> getSegundaVia (PDF binário; somente fatura do imóvel)
 *
 * A senha e o CPF/CNPJ nunca são gravados em log nem na sessão.
 */
const V = require('../_lib/versan');
const H = require('../_lib/http');

const MAX_COOKIE_JSON = 2600;

function primeiroNome(nome) {
  const p = String(nome || '').trim().split(/\s+/)[0] || '';
  return p ? p.charAt(0) + p.slice(1).toLowerCase() : '';
}

/** Situação da ligação/cobrança, se o VerSan enviar (não consta nos exemplos da collection). */
function situacao(l) {
  for (const v of [l.situacaoCobranca, l.situacaoLigacao, l.situacao]) {
    const s = typeof v === 'string' ? v : v && typeof v === 'object' ? (v.situacaoCobranca || v.situacaoLigacao || v.descricao || '') : '';
    if (s && String(s).trim()) return String(s).trim().slice(0, 40);
  }
  return '';
}

function endereco(l) {
  const partes = [
    [l.logradouro, l.numero].filter(x => x !== undefined && x !== null && String(x).trim() !== '').join(', '),
    l.complemento, l.bairro, [l.cidade, l.estado].filter(Boolean).join(' / ')
  ].map(x => String(x || '').trim()).filter(Boolean);
  return partes.join(' · ').slice(0, 110);
}

/** E-mail cadastrado da pessoa no VerSan (vazio se não houver um válido). */
function emailDe(p) {
  const e = String((p && p.email) || '').trim().toLowerCase();
  return e.length <= 254 && /^[^\s@<>]{1,64}@[^\s@<>]{1,185}\.[a-z]{2,}$/i.test(e) ? e : '';
}

/** Mostra o e-mail com parte oculta, ex.: ma***@exemplo.com */
function emailOculto(e) {
  if (!e) return '';
  const [u, d] = e.split('@');
  return u.slice(0, Math.min(2, u.length - 1) || 1) + '***@' + d;
}

/** Monta a sessão compacta a partir do retorno de getAutenticacaoPessoa. */
function sessaoDe(auth) {
  const pessoas = (auth.aPessoa || []).filter(p => p && Number(p.id) > 0);
  const ligacoes = (auth.aLigacao || []).filter(l => l && Number(l.id) > 0 && V.cdcPermitido(V.cdcDaLigacao(l.id)));
  const p0 = pessoas[0] || {};
  const s = {
    n: String(p0.nome || '').trim().slice(0, 120),
    em: emailDe(p0),
    pe: pessoas.map(p => ({ id: Number(p.id), e: Number(p.idPessoaEmail) || 0 })),
    im: ligacoes.map(l => ({ c: V.cdcDaLigacao(l.id), l: String(Number(l.id)), p: Number(l.idPessoa) || Number(p0.id) || 0, a: endereco(l), m: l.entregaPorEmail === true, s: situacao(l) })),
    sel: ligacoes.length ? V.cdcDaLigacao(ligacoes[0].id) : ''
  };
  // Cookie tem limite (~4 KB). Sem espaço, mantém só o essencial.
  if (JSON.stringify(s).length > MAX_COOKIE_JSON) s.im.forEach(i => { i.a = ''; i.s = ''; });
  if (JSON.stringify(s).length > MAX_COOKIE_JSON) throw new V.VerSanError('Muitos imóveis vinculados para a sessão web. Procure o atendimento.', 422);
  return s;
}

function publico(s) {
  return {
    nome: s.n,
    nomeCompleto: s.n,
    primeiroNome: primeiroNome(s.n),
    imoveis: s.im.map(i => ({ cdc: i.c, endereco: i.a, entregaPorEmail: i.m, situacaoCobranca: i.s || undefined })),
    cdcSelecionado: s.sel,
    emailCadastrado: emailOculto(s.em),
    base: 'ANE'
  };
}

function imovelAtual(s) {
  const i = s.im.find(x => x.c === s.sel);
  if (!i) throw new V.VerSanError('Nenhum imóvel selecionado.', 400);
  return i;
}

function anoValido(v) {
  const n = Number(v), atual = new Date().getFullYear();
  if (!Number.isInteger(n) || n < 2000 || n > atual + 1) throw new V.VerSanError('Ano inválido.', 400);
  return n;
}

function idFaturaValido(v) {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n <= 0) throw new V.VerSanError('Fatura inválida.', 400);
  return n;
}

async function debitos(i) {
  const d = await V.call('getFaturaEmDebito', { idLigacao: Number(i.l || i.c), idInquilino: i.p });
  return V.normalizaDebitos(d);
}

async function pagas(i, ano) {
  const d = await V.call('getFaturaPaga', { idLigacao: Number(i.l || i.c), ano, idInquilino: i.p });
  return V.normalizaPagas(d);
}

/** Confere se a fatura pertence ao imóvel selecionado (em débito ou paga nos últimos anos). */
async function faturaDoImovel(i, idFatura, somenteDebito) {
  if ((await debitos(i)).some(f => f.idFatura === idFatura)) return true;
  if (somenteDebito) return false;
  const atual = new Date().getFullYear();
  for (let ano = atual; ano >= atual - 5; ano--) {
    if ((await pagas(i, ano)).some(f => f.idFatura === idFatura)) return true;
  }
  return false;
}

module.exports = async function (req, res) {
  if (!H.guard(req, res)) return;
  try {
    const body = await H.readBody(req);
    const acao = String(body.acao || '');

    if (acao === 'entrar') {
      if (!H.rateLimit('login:' + H.clientIp(req), 8, 10 * 60 * 1000)) return H.send(res, 429, { mensagem: 'Muitas tentativas. Aguarde alguns minutos.' });
      const numeroDocumento = V.formatDocumento(body.numeroDocumento);
      const senha = typeof body.senha === 'string' ? body.senha : '';
      if (!numeroDocumento || !senha || senha.length > 64) return H.send(res, 400, { mensagem: 'Informe CPF/CNPJ e senha.' });
      const auth = await V.call('getAutenticacaoPessoa', { numeroDocumento, senha });
      if (!auth || !Array.isArray(auth.aPessoa) || !auth.aPessoa.length) {
        H.clearSession(req, res);
        return H.send(res, 401, { mensagem: (auth && typeof auth.mensagem === 'string' && auth.mensagem) || 'CPF/CNPJ ou senha não conferem.', codigo: auth && auth.codigo });
      }
      const s = sessaoDe(auth);
      if (!s.im.length) return H.send(res, 403, { mensagem: 'Nenhum imóvel liberado para esta conta neste ambiente.' });
      H.setSession(req, res, s);
      return H.send(res, 200, publico(s));
    }

    if (acao === 'sair') {
      H.clearSession(req, res);
      return H.send(res, 200, { ok: true });
    }

    const s = H.getSession(req);
    if (!s) { H.clearSession(req, res); return H.send(res, 401, { mensagem: 'Sessão expirada. Entre novamente.' }); }
    if (!H.rateLimit('cli:' + s.pe.map(p => p.id).join('.'), 120, 60 * 1000)) return H.send(res, 429, { mensagem: 'Muitas consultas. Aguarde um instante.' });
    H.setSession(req, res, s); // renova validade (sessão deslizante)

    switch (acao) {
      case 'status':
        return H.send(res, 200, publico(s));

      case 'selecionar': {
        const cdc = String(Number(V.onlyDigits(body.cdc)));
        if (!s.im.some(i => i.c === cdc)) return H.send(res, 403, { mensagem: 'Este CDC não pertence à sua conta.' });
        s.sel = cdc;
        H.setSession(req, res, s);
        return H.send(res, 200, publico(s));
      }

      case 'debitos': {
        const faturas = await debitos(imovelAtual(s));
        return H.send(res, 200, { cdc: s.sel, total: faturas.length, faturas });
      }

      case 'pagas': {
        const faturas = await pagas(imovelAtual(s), anoValido(body.ano));
        return H.send(res, 200, { cdc: s.sel, total: faturas.length, faturas });
      }

      case 'consumo': {
        const i = imovelAtual(s);
        const d = await V.call('getHistoricoConsumo', { idLigacao: Number(i.l || i.c), idInquilino: i.p, ano: anoValido(body.ano) });
        return H.send(res, 200, { cdc: s.sel, meses: V.normalizaConsumo(d) });
      }

      case 'pix':
      case 'barra':
      case 'codigoBarras': {
        const i = imovelAtual(s), idFatura = idFaturaValido(body.idFatura);
        if (!(await faturaDoImovel(i, idFatura, true))) return H.send(res, 404, { mensagem: 'Fatura não encontrada entre os débitos deste imóvel.' });
        if (acao === 'pix') {
          const d = await V.call('getCodigoPixEstatico', { idFatura });
          if (!d || typeof d.codigoPix !== 'string' || d.codigoPix.length < 20) throw new V.VerSanError('O VerSan não retornou o Pix desta fatura.', 502);
          return H.send(res, 200, { idFatura, codigoPix: d.codigoPix });
        }
        const d = await V.call('getCodigoBarras', { idFatura });
        if (!d || typeof d.codigoDigitavel !== 'string') throw new V.VerSanError('O VerSan não retornou o código de barras.', 502);
        return H.send(res, 200, { idFatura, codigoDigitavel: d.codigoDigitavel, codigoLeitor: d.codigoLeitor || '' });
      }

      case 'pdf': {
        const i = imovelAtual(s), idFatura = idFaturaValido(body.idFatura);
        if (!(await faturaDoImovel(i, idFatura, false))) return H.send(res, 404, { mensagem: 'Fatura não encontrada para este imóvel.' });
        const d = await V.call('getSegundaVia', { idFaturaSegundaVia: idFatura });
        return H.sendPdf(res, V.pdfDeBase64(d), 'fatura-ane-' + idFatura + '.pdf');
      }

      default:
        return H.send(res, 400, { mensagem: 'Ação inválida.' });
    }
  } catch (e) {
    return H.fail(res, e);
  }
};

module.exports._interno = { sessaoDe, publico };
