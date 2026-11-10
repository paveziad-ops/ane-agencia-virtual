'use strict';
/*
 * Modo "VerSan direto": a página chama o VerSanIntegracaoService direto do navegador, sem servidor
 * intermediário (usado na publicação estática no S3).
 *
 * Só funciona se /versan-config.js definir window.VERSAN_DIRETO (veja versan-config.exemplo.js).
 * Sem esse arquivo (ex.: no Vercel), nada aqui é ativado e as telas continuam usando /api/versan/*.
 *
 * As telas (bridge-*.js) não mudam: este arquivo intercepta as chamadas a /api/versan/* e responde
 * no mesmo formato das funções de servidor, chamando o VerSan diretamente.
 *
 * ATENÇÃO (risco aceito pela equipe em 05/11/2026): o login e a senha do integrador ficam visíveis
 * no navegador. Use um integrador SOMENTE DE LEITURA, criado só para a agência.
 */
(function () {
  const CFG = window.VERSAN_DIRETO;
  if (!CFG || !CFG.baseUrl || !CFG.login || !CFG.senha || !CFG.dataSource) return;

  const BASE = String(CFG.baseUrl).replace(/\/+$/, '');
  const SERVICO = '/' + String(CFG.servico || 'VerSanIntegracaoServiceV2').replace(/^\/+|\/+$/g, '');
  const PATHS = {
    getAutenticacaoAplicacao: '/VerSanSegurancaService/SegurancaServices/getAutenticacaoAplicacao',
    getAutenticacaoPessoa: SERVICO + '/IntegracaoServices/getAutenticacaoPessoa',
    getFaturaEmDebito: SERVICO + '/IntegracaoServices/getFaturaEmDebito',
    getFaturaPaga: SERVICO + '/IntegracaoServices/getFaturaPaga',
    getHistoricoConsumo: SERVICO + '/IntegracaoServices/getHistoricoConsumo',
    getCodigoBarras: SERVICO + '/IntegracaoServices/getCodigoBarras',
    getCodigoPixEstatico: SERVICO + '/IntegracaoServices/getCodigoPixEstatico',
    getSegundaVia: SERVICO + '/RelatorioServices/getSegundaVia',
    getSegundaViaOfuscada: SERVICO + '/RelatorioServices/getSegundaViaOfuscada',
    getVerificaEmailExistente: SERVICO + '/IntegracaoServices/getVerificaEmailExistente',
    setEmailPessoa: SERVICO + '/IntegracaoServices/setEmailPessoa'
  };
  // O VerSan exige o nome JNDI completo (ex.: java:comp/env/jdbc/DSVerSanRestore). Completa se vier só o nome.
  const DATASOURCE = /^java:/i.test(String(CFG.dataSource).trim()) ? String(CFG.dataSource).trim() : 'java:comp/env/jdbc/' + String(CFG.dataSource).trim().replace(/^\/+/, '');
  const TIMEOUT = Number(CFG.timeoutMs) >= 3000 ? Number(CFG.timeoutMs) : 25000;
  const fetchOriginal = window.fetch.bind(window);

  class VerSanError extends Error {
    constructor(message, status, code) { super(message); this.status = status || 502; this.code = code; }
  }

  /* ------------------------------ chamadas ao VerSan ------------------------------ */

  async function rawPost(url, body, token) {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    let r;
    try {
      r = await fetchOriginal(url, { method: 'POST', headers, body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT) });
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

  const tk = { valor: null, expira: 0, promessa: null };
  async function novoToken() {
    const d = await rawPost(BASE + PATHS.getAutenticacaoAplicacao, { login: CFG.login, senha: CFG.senha, token: '', dataSource: DATASOURCE });
    if (!d || typeof d.token !== 'string' || !d.token) throw new VerSanError('O VerSan não emitiu o token da aplicação.', 502);
    const validade = Number(d.tokenValidade);
    tk.valor = d.token;
    tk.expira = Date.now() + Math.max(15, (Number.isFinite(validade) && validade > 0 ? validade : 240) - 20) * 1000;
    return tk.valor;
  }
  async function token(forcar) {
    if (!forcar && tk.valor && Date.now() < tk.expira) return tk.valor;
    if (!tk.promessa) tk.promessa = novoToken().finally(() => { tk.promessa = null; });
    return tk.promessa;
  }
  async function call(metodo, params) {
    const body = Object.assign({}, params || {}, { dataSource: DATASOURCE });
    try { return await rawPost(BASE + PATHS[metodo], body, await token(false)); }
    catch (e) {
      if (e.code !== 401) throw e;
      tk.valor = null;
      return rawPost(BASE + PATHS[metodo], body, await token(true));
    }
  }

  /* ------------------------------ utilidades de domínio ------------------------------ */

  const onlyDigits = v => String(v == null ? '' : v).replace(/\D/g, '');
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
    const n = new Date(Date.now() - 3 * 3600 * 1000);
    return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
  }
  function num(v) {
    if (typeof v === 'number') return v;
    const n = Number(String(v == null ? '' : v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  function refDeData(s) {
    const m = String(s || '').match(/^\d{2}\/(\d{2})\/(\d{4})$/);
    return m ? m[2] + m[1] : '';
  }
  function normalizaDebitos(lista) {
    const hoje = hojeUTC();
    return (Array.isArray(lista) ? lista : []).filter(x => x && Number(x.id) > 0).map(x => {
      const venc = parseBRDate(x.dataVencimento);
      const situacao = x.situacaoFatura && typeof x.situacaoFatura === 'object' ? x.situacaoFatura.situacaoFatura : x.situacaoFatura;
      return {
        idFatura: Number(x.id), referencia: String(x.referencia || ''), valor: num(x.valor),
        dataVencimento: x.dataVencimento || '', vencimento: x.dataVencimento || '', dataEmissao: x.dataEmissao || '',
        diasVencido: Number(x.diasVencido) || 0, vencida: x.vencida === true, vencidaPorData: venc ? venc < hoje : false,
        situacaoCobranca: situacao || '',
        tipoFatura: x.tipoFatura && typeof x.tipoFatura === 'object' ? x.tipoFatura.tipoFatura || '' : '',
        volumeFaturado: num(x.volumeFaturado), volumeMedido: num(x.volumeMedido)
      };
    });
  }
  function normalizaPagas(lista) {
    return (Array.isArray(lista) ? lista : []).filter(x => x && Number(x.idFatura) > 0).map(x => ({
      idFatura: Number(x.idFatura), valor: num(x.valor), dataVencimento: x.dataVencimento || '',
      dataPagamento: x.dataPagamento || '', dataEmissao: x.dataEmissao || '',
      referencia: refDeData(x.dataEmissao || x.dataLeitura), situacaoCobranca: x.situacaoFatura || 'PAGO',
      volumeFaturado: num(x.volumeFaturado), volumeMedido: num(x.volumeMedido)
    }));
  }
  function normalizaConsumo(lista) {
    return (Array.isArray(lista) ? lista : []).filter(x => x && x.referencia).map(x => ({
      referencia: String(x.referencia), volumeMedido: num(x.volumeMedido), volumeFaturado: num(x.volumeFaturado),
      leituraAnterior: num(x.leituraAnterior), leituraAtual: num(x.leituraAtual), dataLeitura: x.dataLeitura || '',
      valor: num(x.valor), idFatura: Number(x.idFatura) || null
    }));
  }
  function pdfDeBase64(d) {
    const b64 = d && typeof d.mensagem === 'string' ? d.mensagem.replace(/\s+/g, '') : '';
    if (!/^JVBERi0[A-Za-z0-9+/]*={0,2}$/.test(b64)) {
      throw new VerSanError((d && typeof d.mensagem === 'string' && d.mensagem.length < 300 && d.mensagem) || 'O VerSan não retornou o PDF da fatura.', 502);
    }
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (bytes.length < 80) throw new VerSanError('O arquivo retornado não é um PDF válido.', 502);
    return bytes;
  }
  function cdcValido(v) {
    const d = onlyDigits(v);
    if (!/^\d{1,10}$/.test(d) || Number(d) < 1) throw new VerSanError('Informe uma matrícula (CDC) válida.', 400);
    return String(Number(d));
  }
  function idFaturaValido(v) {
    const n = Number(v);
    if (!Number.isSafeInteger(n) || n <= 0) throw new VerSanError('Fatura inválida.', 400);
    return n;
  }
  function anoValido(v) {
    const n = Number(v), atual = new Date().getFullYear();
    if (!Number.isInteger(n) || n < 2000 || n > atual + 1) throw new VerSanError('Ano inválido.', 400);
    return n;
  }

  /* ------------------------------ respostas no formato das APIs ------------------------------ */

  const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  const pdf = (bytes) => new Response(new Blob([bytes], { type: 'application/pdf' }), { status: 200, headers: { 'Content-Type': 'application/pdf' } });

  /* ------------------------------ consulta sem login ------------------------------ */

  async function debitosPublicos(cdc) {
    return normalizaDebitos(await call('getFaturaEmDebito', { idLigacao: Number(cdc) }));
  }
  async function faturaDoCdc(cdc, idFatura) {
    const f = (await debitosPublicos(cdc)).find(x => x.idFatura === idFatura);
    if (!f) throw new VerSanError('Fatura não encontrada entre os débitos desta matrícula.', 404);
    return f;
  }
  const resumo = f => ({ idFatura: f.idFatura, referencia: f.referencia, valor: f.valor, vencimento: f.vencimento, vencida: f.vencida || f.vencidaPorData });

  async function segundaViaPublica(b) {
    const acao = String(b.acao || ''), cdc = cdcValido(b.cdc);
    if (acao === 'consultar') {
      const faturas = (await debitosPublicos(cdc)).map(resumo);
      return json(200, { cdc, total: faturas.length, faturas });
    }
    if (acao === 'codigoBarras') {
      const idFatura = idFaturaValido(b.idFatura);
      await faturaDoCdc(cdc, idFatura);
      const d = await call('getCodigoBarras', { idFatura });
      if (!d || typeof d.codigoDigitavel !== 'string') throw new VerSanError('O VerSan não retornou o código de barras.', 502);
      return json(200, { idFatura, codigoDigitavel: d.codigoDigitavel, codigoLeitor: d.codigoLeitor || '' });
    }
    if (acao === 'segundaVia') {
      const idFatura = idFaturaValido(b.idFatura);
      await faturaDoCdc(cdc, idFatura);
      return pdf(pdfDeBase64(await call('getSegundaViaOfuscada', { idFaturaSegundaVia: idFatura })));
    }
    return json(400, { mensagem: 'Ação inválida.' });
  }

  async function pixRapido(b) {
    if (b.acao !== undefined && b.acao !== 'pix') return json(400, { mensagem: 'Ação inválida.' });
    const cdc = cdcValido(b.cdc), idFatura = idFaturaValido(b.idFatura);
    await faturaDoCdc(cdc, idFatura);
    const d = await call('getCodigoPixEstatico', { idFatura });
    if (!d || typeof d.codigoPix !== 'string' || d.codigoPix.length < 20) throw new VerSanError('O VerSan não retornou o Pix desta fatura.', 502);
    return json(200, { idFatura, codigoPix: d.codigoPix });
  }

  /* ------------------------------ conferência (titular, CPF e endereço ocultos) ------------------------------ */

  const dec = new TextDecoder('windows-1252');
  async function inflar(bytes) {
    const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  function unescapePdf(t) {
    return t.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (a, b) => {
      const map = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
      return map[b] !== undefined ? map[b] : String.fromCharCode(parseInt(b, 8));
    });
  }
  async function textosPdf(bytes) {
    const bin = dec.decode(bytes), lista = [];
    const re = /(?<!end)stream\r?\n/g;
    let m;
    while ((m = re.exec(bin))) {
      const inicio = m.index + m[0].length;
      const dict = bin.slice(bin.lastIndexOf('<<', m.index), m.index);
      const L = Number((dict.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/) || [])[1] || 0);
      const fim = L ? inicio + L : bin.indexOf('endstream', inicio);
      if (fim <= inicio) continue;
      re.lastIndex = fim;
      if (!/FlateDecode/.test(dict)) continue;
      let s;
      try { s = dec.decode(await inflar(bytes.subarray(inicio, fim))); } catch { continue; }
      if (!/T[jJ]/.test(s)) continue;
      let x = 0, y = 0;
      for (const op of s.split(/\r?\n/)) {
        let mm;
        if ((mm = op.match(/^\s*1 0 0 1 ([-\d.]+) ([-\d.]+) Tm\s*$/))) { x = +mm[1]; y = +mm[2]; continue; }
        if ((mm = op.match(/^\s*([-\d.]+) ([-\d.]+) Td\s*$/))) { x += +mm[1]; y += +mm[2]; continue; }
        if ((mm = op.match(/^\s*\((.*)\)\s*Tj\s*$/))) { const t = unescapePdf(mm[1]).trim(); if (t) lista.push({ x, y, texto: t }); }
      }
    }
    return lista;
  }
  function valorDoRotulo(lista, rotulo) {
    const r = lista.find(t => t.texto.toLowerCase() === rotulo.toLowerCase());
    if (!r) return '';
    const c = lista.filter(t => t !== r && Math.abs(t.y - r.y) <= 2 && t.x > r.x).sort((a, b) => a.x - b.x);
    return c.length ? c[0].texto : '';
  }
  function ofuscaNome(nome) {
    const s = String(nome || '').trim();
    if (!s) return '';
    if (s.includes('*')) return s;
    return s.split(/\s+/).map((p, i) => {
      if (i > 0 && /^(DA|DE|DO|DAS|DOS|E)$/i.test(p)) return p.toUpperCase();
      const keep = i === 0 ? Math.min(p.length, 10) : 1;
      return p.slice(0, keep).toUpperCase() + (p.length > keep ? '*'.repeat(4) : '');
    }).join(' ');
  }
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
  function ofuscaDocumento(doc) {
    const s = String(doc || '').trim();
    if (!s || s.length > 25 || !/^[\d.\-\/* ]+$/.test(s)) return '';
    if (s.includes('*')) return /\d/.test(s) ? s : '';
    const d = s.replace(/\D/g, '');
    if (d.length === 11) return '***.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-**';
    if (d.length === 14) return '**.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/****-**';
    return '';
  }
  async function conferencia(b) {
    const cdc = cdcValido(b.cdc), idFatura = idFaturaValido(b.idFatura);
    await faturaDoCdc(cdc, idFatura);
    const lista = await textosPdf(pdfDeBase64(await call('getSegundaViaOfuscada', { idFaturaSegundaVia: idFatura })));
    const titularOfuscado = ofuscaNome(valorDoRotulo(lista, 'Inquilino:') || valorDoRotulo(lista, 'Proprietário:'));
    const enderecoOfuscado = ofuscaEndereco(valorDoRotulo(lista, 'Endereço:'));
    const documentoOfuscado = ofuscaDocumento(valorDoRotulo(lista, 'CPF/CNPJ:'));
    if (!titularOfuscado || !enderecoOfuscado) return json(502, { ok: false, mensagem: 'Não foi possível ler titular e endereço da segunda via.' });
    return json(200, documentoOfuscado ? { ok: true, titularOfuscado, enderecoOfuscado, documentoOfuscado } : { ok: true, titularOfuscado, enderecoOfuscado });
  }

  /* ------------------------------ área logada ------------------------------ */

  // Sessão na aba do navegador (some ao fechar a aba); expira após 30 min sem uso.
  const CHAVE = 'av_sessao_versan', MINUTOS = 30;
  function lerSessao() {
    try {
      const s = JSON.parse(sessionStorage.getItem(CHAVE) || 'null');
      if (!s || typeof s.exp !== 'number' || Date.now() > s.exp) { sessionStorage.removeItem(CHAVE); return null; }
      return s;
    } catch { return null; }
  }
  function gravarSessao(s) { try { s.exp = Date.now() + MINUTOS * 60000; sessionStorage.setItem(CHAVE, JSON.stringify(s)); } catch { /* sem storage */ } }
  function apagarSessao() { try { sessionStorage.removeItem(CHAVE); } catch { /* sem storage */ } }

  function primeiroNome(nome) { const p = String(nome || '').trim().split(/\s+/)[0] || ''; return p ? p.charAt(0) + p.slice(1).toLowerCase() : ''; }
  function situacaoLig(l) {
    for (const v of [l.situacaoCobranca, l.situacaoLigacao, l.situacao]) {
      const s = typeof v === 'string' ? v : v && typeof v === 'object' ? (v.situacaoCobranca || v.situacaoLigacao || v.descricao || '') : '';
      if (s && String(s).trim()) return String(s).trim().slice(0, 40);
    }
    return '';
  }
  function endereco(l) {
    return [[l.logradouro, l.numero].filter(x => x !== undefined && x !== null && String(x).trim() !== '').join(', '),
      l.complemento, l.bairro, [l.cidade, l.estado].filter(Boolean).join(' / ')]
      .map(x => String(x || '').trim()).filter(Boolean).join(' · ').slice(0, 110);
  }
  function emailDe(p) {
    const e = String((p && p.email) || '').trim().toLowerCase();
    return e.length <= 254 && /^[^\s@<>]{1,64}@[^\s@<>]{1,185}\.[a-z]{2,}$/i.test(e) ? e : '';
  }
  function emailOculto(e) { if (!e) return ''; const [u, d] = e.split('@'); return u.slice(0, Math.min(2, u.length - 1) || 1) + '***@' + d; }
  function sessaoDe(auth) {
    const pessoas = (auth.aPessoa || []).filter(p => p && Number(p.id) > 0);
    const ligacoes = (auth.aLigacao || []).filter(l => l && Number(l.id) > 0);
    const p0 = pessoas[0] || {};
    return {
      n: String(p0.nome || '').trim().slice(0, 120), em: emailDe(p0),
      pe: pessoas.map(p => ({ id: Number(p.id), e: Number(p.idPessoaEmail) || 0 })),
      im: ligacoes.map(l => ({ c: String(Number(l.id)), l: String(Number(l.id)), p: Number(l.idPessoa) || Number(p0.id) || 0, a: endereco(l), m: l.entregaPorEmail === true, s: situacaoLig(l) })),
      sel: ligacoes.length ? String(Number(ligacoes[0].id)) : ''
    };
  }
  function publico(s) {
    return {
      nome: s.n, nomeCompleto: s.n, primeiroNome: primeiroNome(s.n),
      imoveis: s.im.map(i => ({ cdc: i.c, endereco: i.a, entregaPorEmail: i.m, situacaoCobranca: i.s || undefined })),
      cdcSelecionado: s.sel, emailCadastrado: emailOculto(s.em), base: 'ANE'
    };
  }
  function imovelAtual(s) {
    const i = s.im.find(x => x.c === s.sel);
    if (!i) throw new VerSanError('Nenhum imóvel selecionado.', 400);
    return i;
  }
  const debitos = async i => normalizaDebitos(await call('getFaturaEmDebito', { idLigacao: Number(i.l || i.c), idInquilino: i.p }));
  const pagas = async (i, ano) => normalizaPagas(await call('getFaturaPaga', { idLigacao: Number(i.l || i.c), ano, idInquilino: i.p }));
  async function faturaDoImovel(i, idFatura, somenteDebito) {
    if ((await debitos(i)).some(f => f.idFatura === idFatura)) return true;
    if (somenteDebito) return false;
    const atual = new Date().getFullYear();
    for (let ano = atual; ano >= atual - 5; ano--) if ((await pagas(i, ano)).some(f => f.idFatura === idFatura)) return true;
    return false;
  }

  /* Cadastro de e-mail — mesmas suposições do servidor (api/versan/cliente.js). */
  const EMAIL_RE = /^[^\s@<>]{1,64}@[^\s@<>]{1,185}\.[a-z]{2,}$/i;
  function emailValido(v) {
    const e = String(v || '').trim().toLowerCase();
    if (e.length > 254 || !EMAIL_RE.test(e)) throw new VerSanError('Informe um e-mail válido.', 400);
    return e;
  }
  const paramsEmail = (s, email) => ({ email, idPessoa: (s.pe[0] && s.pe[0].id) || 0 });
  function listaDe(d) {
    if (Array.isArray(d)) return d;
    for (const k of ['aEmail', 'aPessoaEmail', 'emails', 'lista', 'resultado', 'dados']) if (d && Array.isArray(d[k])) return d[k];
    return [];
  }
  function erroDoVerSan(d) {
    if (d && typeof d.codigo === 'number' && d.codigo !== 0 && d.codigo !== 200) {
      throw new VerSanError((typeof d.mensagem === 'string' && d.mensagem.length < 300 && d.mensagem) || 'O VerSan não concluiu o cadastro do e-mail.', 422);
    }
  }

  async function cliente(b) {
    const acao = String(b.acao || '');
    if (acao === 'entrar') {
      const numeroDocumento = formatDocumento(b.numeroDocumento);
      const senha = typeof b.senha === 'string' ? b.senha : '';
      if (!numeroDocumento || !senha || senha.length > 64) return json(400, { mensagem: 'Informe CPF/CNPJ e senha.' });
      let auth;
      try { auth = await call('getAutenticacaoPessoa', { numeroDocumento, senha }); }
      catch (e) { if (e.code === 401) return json(401, { mensagem: 'CPF/CNPJ ou senha não conferem.' }); throw e; }
      if (!auth || !Array.isArray(auth.aPessoa) || !auth.aPessoa.length) {
        apagarSessao();
        return json(401, { mensagem: (auth && typeof auth.mensagem === 'string' && auth.mensagem) || 'CPF/CNPJ ou senha não conferem.', codigo: auth && auth.codigo });
      }
      const s = sessaoDe(auth);
      if (!s.im.length) return json(403, { mensagem: 'Nenhum imóvel vinculado a esta conta.' });
      gravarSessao(s);
      return json(200, publico(s));
    }
    if (acao === 'sair') { apagarSessao(); return json(200, { ok: true }); }

    const s = lerSessao();
    if (!s) return json(401, { mensagem: 'Sessão expirada. Entre novamente.' });
    gravarSessao(s);

    switch (acao) {
      case 'status': return json(200, publico(s));
      case 'selecionar': {
        const cdc = String(Number(onlyDigits(b.cdc)));
        if (!s.im.some(i => i.c === cdc)) return json(403, { mensagem: 'Este CDC não pertence à sua conta.' });
        s.sel = cdc; gravarSessao(s);
        return json(200, publico(s));
      }
      case 'debitos': { const f = await debitos(imovelAtual(s)); return json(200, { cdc: s.sel, total: f.length, faturas: f }); }
      case 'pagas': { const f = await pagas(imovelAtual(s), anoValido(b.ano)); return json(200, { cdc: s.sel, total: f.length, faturas: f }); }
      case 'consumo': {
        const i = imovelAtual(s);
        const d = await call('getHistoricoConsumo', { idLigacao: Number(i.l || i.c), idInquilino: i.p, ano: anoValido(b.ano) });
        return json(200, { cdc: s.sel, meses: normalizaConsumo(d) });
      }
      case 'pix': case 'barra': case 'codigoBarras': {
        const i = imovelAtual(s), idFatura = idFaturaValido(b.idFatura);
        if (!(await faturaDoImovel(i, idFatura, true))) return json(404, { mensagem: 'Fatura não encontrada entre os débitos deste imóvel.' });
        if (acao === 'pix') {
          const d = await call('getCodigoPixEstatico', { idFatura });
          if (!d || typeof d.codigoPix !== 'string' || d.codigoPix.length < 20) throw new VerSanError('O VerSan não retornou o Pix desta fatura.', 502);
          return json(200, { idFatura, codigoPix: d.codigoPix });
        }
        const d = await call('getCodigoBarras', { idFatura });
        if (!d || typeof d.codigoDigitavel !== 'string') throw new VerSanError('O VerSan não retornou o código de barras.', 502);
        return json(200, { idFatura, codigoDigitavel: d.codigoDigitavel, codigoLeitor: d.codigoLeitor || '' });
      }
      case 'pdf': {
        const i = imovelAtual(s), idFatura = idFaturaValido(b.idFatura);
        if (!(await faturaDoImovel(i, idFatura, false))) return json(404, { mensagem: 'Fatura não encontrada para este imóvel.' });
        return pdf(pdfDeBase64(await call('getSegundaVia', { idFaturaSegundaVia: idFatura })));
      }
      case 'verificarEmail': {
        const email = emailValido(b.email);
        const d = await call('getVerificaEmailExistente', paramsEmail(s, email));
        erroDoVerSan(d);
        return json(200, { existe: listaDe(d).length > 0 });
      }
      case 'cadastrarEmail': {
        const email = emailValido(b.email);
        const d = await call('setEmailPessoa', paramsEmail(s, email));
        erroDoVerSan(d);
        s.em = email;
        if (b.origem === 'entrega') { const i = s.im.find(x => x.c === s.sel); if (i) i.m = true; }
        gravarSessao(s);
        return json(200, Object.assign({ ok: true }, publico(s)));
      }
      default: return json(400, { mensagem: 'Ação inválida.' });
    }
  }

  async function enviarEmail() {
    // Aguarda o serviço de e-mail do VerSan. Até lá, o envio fica indisponível neste modo.
    return json(503, { ok: false, mensagem: 'Envio por e-mail temporariamente indisponível.' });
  }

  /* ------------------------------ interceptação de /api/versan/* ------------------------------ */

  const ROTAS = {
    '/api/versan/cliente': cliente,
    '/api/versan/segunda-via-publica': segundaViaPublica,
    '/api/versan/pix-rapido': pixRapido,
    '/api/versan/conferencia-fatura': conferencia,
    '/api/versan/enviar-fatura-email': enviarEmail
  };

  window.fetch = async function (entrada, opcoes) {
    let caminho = '';
    try { caminho = new URL(typeof entrada === 'string' ? entrada : entrada.url, location.href).pathname; } catch { caminho = ''; }
    const rota = ROTAS[caminho];
    if (!rota) return fetchOriginal(entrada, opcoes);
    let corpo = {};
    try { corpo = opcoes && typeof opcoes.body === 'string' && opcoes.body ? JSON.parse(opcoes.body) : {}; } catch { return json(400, { mensagem: 'JSON inválido.' }); }
    try { return await rota(corpo || {}); }
    catch (e) {
      const status = e instanceof VerSanError ? e.status : 500;
      return json(status, { mensagem: e instanceof VerSanError ? e.message : 'Erro inesperado. Tente novamente.' });
    }
  };
  window.VERSAN_DIRETO_ATIVO = true;
})();
