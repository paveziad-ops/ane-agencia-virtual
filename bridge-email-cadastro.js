'use strict';
/*
 * Cadastro de e-mail na área logada (fluxo definido pela equipe em 06/11/2026):
 *   pessoa digita o e-mail → OK → getVerificaEmailExistente
 *     lista vazia  → setEmailPessoa
 *     lista com itens → tela de confirmação ("deseja continuar com este e-mail?") → sim → setEmailPessoa
 * Usado em dois lugares: "Fatura por e-mail" (adesão à entrega digital) e "Minha conta".
 * O setEmailPessoa faz todo o cadastro no VerSan. A lista devolvida pela verificação nunca é mostrada.
 */
(function () {
  if (window.__avEmailCadastroV1) return;
  window.__avEmailCadastroV1 = true;

  const RE = /^[^\s@<>]{1,64}@[^\s@<>]{1,185}\.[a-z]{2,}$/i;
  const fluxo = { origem: '', etapa: 'form', email: '', erro: '', ocupado: false, aceite: false };

  function usuario() { return (window.realANE && window.realANE.user) || null; }
  function imovelAtual() {
    const u = usuario();
    return u && Array.isArray(u.imoveis) ? u.imoveis.find(i => String(i.cdc) === String(state.current)) : null;
  }
  function reiniciar(origem) { Object.assign(fluxo, { origem, etapa: 'form', email: '', erro: '', ocupado: false, aceite: false, aberto: false }); }

  /* ---------------- chamadas ---------------- */
  async function confirmarOk() {
    const campo = document.getElementById('avm-email');
    const email = String(campo ? campo.value : fluxo.email).trim().toLowerCase();
    fluxo.email = email; fluxo.erro = '';
    if (!RE.test(email) || email.length > 254) { fluxo.erro = 'Informe um e-mail válido.'; return render(); }
    if (fluxo.origem === 'entrega') {
      const aceite = document.getElementById('avm-aceite');
      fluxo.aceite = !!(aceite && aceite.checked);
      if (!fluxo.aceite) { fluxo.erro = 'Confirme que deseja receber as próximas faturas por e-mail.'; return render(); }
    }
    fluxo.ocupado = true; render();
    try {
      const r = await window.realApi('verificarEmail', { email });
      fluxo.ocupado = false;
      if (r && r.existe) { fluxo.etapa = 'confirmar'; return render(); }
      await gravar();
    } catch (e) { fluxo.ocupado = false; fluxo.erro = mensagem(e); render(); }
  }

  async function gravar() {
    fluxo.ocupado = true; fluxo.erro = ''; render();
    try {
      const r = await window.realApi('cadastrarEmail', { email: fluxo.email, origem: fluxo.origem });
      if (r && window.realANE) {
        const u = window.realANE.user || {};
        u.emailCadastrado = r.emailCadastrado || u.emailCadastrado;
        if (Array.isArray(r.imoveis)) u.imoveis = r.imoveis;
        window.realANE.user = u;
      }
      fluxo.ocupado = false; fluxo.etapa = 'ok'; render();
    } catch (e) { fluxo.ocupado = false; fluxo.etapa = 'form'; fluxo.erro = mensagem(e); render(); }
  }

  function mensagem(e) {
    if (e && e.status === 401) return 'Sua sessão expirou. Entre novamente para continuar.';
    return (e && e.message) || 'Não foi possível concluir agora. Tente novamente.';
  }

  window.avEmail = {
    ok: () => void confirmarOk(),
    sim: () => void gravar(),
    nao: () => { fluxo.etapa = 'form'; fluxo.erro = ''; render(); setTimeout(() => document.getElementById('avm-email')?.focus(), 30); },
    alterar: () => { reiniciar('perfil'); fluxo.etapa = 'form'; fluxo.aberto = true; render(); setTimeout(() => document.getElementById('avm-email')?.focus(), 30); },
    cancelar: () => { fluxo.aberto = false; reiniciar('perfil'); render(); }
  };

  /* ---------------- pedaços de tela ---------------- */
  const erroHtml = () => fluxo.erro ? '<p class="avm-erro" role="alert" style="color:#a13c27;font-size:13px;margin:12px 0 0">' + esc(fluxo.erro) + '</p>' : '';
  const carregando = t => '<p class="avm-status" role="status" style="font-size:13px;margin:12px 0 0;color:#516e86">' + esc(t) + '</p>';

  function formHtml(textoBotao) {
    const aceite = fluxo.origem === 'entrega'
      ? '<label class="check-row" style="margin-top:16px"><input type="checkbox" id="avm-aceite" ' + (fluxo.aceite ? 'checked' : '') + '><span>Desejo receber as próximas faturas deste imóvel por e-mail, no lugar da fatura impressa. O retorno à entrega impressa poderá ser solicitado após 30 dias.</span></label>'
      : '';
    return '<div class="field" style="margin-top:18px"><label for="avm-email">E-mail</label>' +
      '<input class="input" type="email" id="avm-email" autocomplete="email" maxlength="254" placeholder="seuemail@exemplo.com" value="' + esc(fluxo.email) + '" ' + (fluxo.ocupado ? 'disabled' : '') + ' onkeydown="if(event.key===\'Enter\'){event.preventDefault();avEmail.ok()}"></div>' +
      aceite + erroHtml() + (fluxo.ocupado ? carregando('Verificando o e-mail…') : '') +
      '<div class="row" style="margin-top:18px;flex-wrap:wrap">' +
      (fluxo.origem === 'perfil' ? btn('Cancelar', 'avEmail.cancelar()', 'light') : '') +
      btn(textoBotao, 'avEmail.ok()', 'primary' + (fluxo.origem === 'entrega' ? ' full' : '')) + '</div>';
  }

  function confirmarHtml() {
    return '<div class="deliver-banner" style="margin-top:18px">' + icon('info', 'sm') + ' <strong>Este e-mail já está cadastrado.</strong></div>' +
      '<p style="margin-top:14px">Deseja continuar com <strong>' + esc(fluxo.email) + '</strong>?</p>' +
      erroHtml() + (fluxo.ocupado ? carregando('Salvando…') : '') +
      '<div class="row" style="margin-top:18px;flex-wrap:wrap">' + btn('Não, usar outro e-mail', 'avEmail.nao()', 'light') + btn('Sim, continuar', 'avEmail.sim()', 'primary') + '</div>';
  }

  /* ---------------- Fatura por e-mail (adesão) ---------------- */
  startDelivery = function () { reiniciar('entrega'); change('entrega'); };
  deliveryBack = function () { reiniciar('entrega'); render(); };
  deliveryNext = function () { confirmarOk(); };

  deliveryPage = function () {
    if (fluxo.origem !== 'entrega') reiniciar('entrega');
    const im = imovelAtual(), u = usuario() || {};
    const cdc = esc(String(state.current || (im && im.cdc) || ''));
    let corpo = '';
    if (fluxo.etapa === 'ok') {
      corpo = '<div class="confirmation">' + icon('check', 'lg') + '<h2>Pronto!</h2><p>As próximas faturas do imóvel <strong>CDC ' + cdc + '</strong> serão enviadas para <strong>' + esc(fluxo.email) + '</strong>.</p></div>' +
        '<div style="margin-top:20px">' + btn('Voltar ao início da minha conta', "change('painel')", 'primary full') + '</div>';
    } else if (fluxo.etapa === 'confirmar') {
      corpo = '<div class="kicker">CONFIRMAÇÃO</div><h2>Confirme o e-mail</h2>' + confirmarHtml();
    } else {
      const jaRecebe = im && im.entregaPorEmail
        ? '<div class="deliver-banner" style="margin-top:14px">' + icon('check', 'sm') + ' Este imóvel já recebe a fatura por e-mail' + (u.emailCadastrado ? ' (' + esc(u.emailCadastrado) + ')' : '') + '. Para trocar o endereço, informe o novo abaixo.</div>'
        : '';
      corpo = '<div class="kicker">IMÓVEL CDC ' + cdc + '</div><h2>Receba as próximas faturas por e-mail</h2>' +
        '<p>Informe o e-mail que deseja usar para receber as faturas deste imóvel.</p>' + jaRecebe + formHtml('OK');
    }
    return layout('Fatura por e-mail', 'Receba as próximas faturas no seu e-mail.', '<section class="module">' + corpo + '</section>');
  };

  /* ---------------- Minha conta ---------------- */
  const perfilOriginal = profilePage;
  profilePage = function () {
    const html = perfilOriginal();
    if (fluxo.origem !== 'perfil') reiniciar('perfil');
    const u = usuario() || {};
    let corpo;
    if (fluxo.etapa === 'ok') {
      corpo = '<div class="deliver-banner">' + icon('check', 'sm') + ' E-mail atualizado para <strong>' + esc(fluxo.email) + '</strong>.</div>' +
        '<div class="row" style="margin-top:14px">' + btn('Alterar novamente', 'avEmail.alterar()', 'light') + '</div>';
    } else if (fluxo.etapa === 'confirmar') {
      corpo = confirmarHtml();
    } else if (fluxo.aberto) {
      corpo = '<p>Informe o novo e-mail para contato e envio de faturas.</p>' + formHtml('OK');
    } else {
      corpo = '<p>' + (u.emailCadastrado ? 'E-mail cadastrado: <strong>' + esc(u.emailCadastrado) + '</strong>' : 'Nenhum e-mail cadastrado.') + '</p>' +
        '<div class="row" style="margin-top:14px">' + btn(u.emailCadastrado ? 'Alterar e-mail' : 'Cadastrar e-mail', 'avEmail.alterar()', 'outline') + '</div>';
    }
    const secao = '<section class="module" id="avm-secao" style="margin-top:20px"><div class="kicker">E-MAIL</div><h2>E-mail para contato e faturas</h2>' + corpo + '</section>';
    const i = html.lastIndexOf('</section>');
    return i < 0 ? html : html.slice(0, i + 10) + secao + html.slice(i + 10);
  };
})();

/*
 * Remove o aviso "Você está explorando uma conta fictícia…" que sobrou do molde das páginas
 * (app.js, layout). Algumas telas já o trocam pelo cartão do cliente; nas demais ele aparecia
 * para quem está logado de verdade. Observa a área da página e tira o aviso sempre que surgir.
 */
(function () {
  if (window.__avSemAvisoFicticio) return;
  window.__avSemAvisoFicticio = true;
  function limpar() {
    document.querySelectorAll('#app .banner-demo').forEach(el => {
      if (/conta fict[ií]cia/i.test(el.textContent || '')) el.remove();
    });
  }
  function iniciar() {
    const app = document.getElementById('app');
    if (!app) return;
    limpar();
    new MutationObserver(limpar).observe(app, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar, { once: true });
  else iniciar();
})();
