/*
 * Configuração do modo "VerSan direto" (página no S3 chamando o VerSanIntegracaoService).
 * 1. Copie este arquivo para versan-config.js (mesmo lugar, raiz do site).
 * 2. Preencha os valores. 3. Envie junto com a página para o S3.
 * O versan-config.js NÃO vai para o GitHub (.gitignore).
 *
 * ATENÇÃO: estes valores ficam visíveis para qualquer pessoa no navegador.
 * Use um integrador SOMENTE DE LEITURA, criado só para a agência (sem acesso aos métodos set...).
 * Sem este arquivo, a página usa as APIs do servidor (/api/versan/*), como no Vercel.
 */
window.VERSAN_DIRETO = {
  baseUrl: ''          // endereço do VerSan da ANE (ex.: https://...versan.com.br),
  servico: 'VerSanIntegracaoServiceV2',
  login: '',        // login do integrador da agência
  senha: '',        // senha do integrador da agência
  dataSource: '',   // dataSource da base da ANE
  timeoutMs: 25000
};
