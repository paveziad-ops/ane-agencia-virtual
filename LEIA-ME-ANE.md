# ANE · Agência Virtual

Frontend derivado da Agência Virtual de Águas de Andradas, com identidade visual da ANE, mais as funções serverless (Vercel) que integram com o VerSan. As funções foram reescritas a partir da collection Postman **"Api - VerSan - Agência Virtual"**.

## Identidade visual
- Logos vetoriais oficiais: `brand/ane-logo-principal.svg` e `brand/ane-logo-branco.svg`. Favicon: `brand/ane-favicon.svg`.
- Cores do manual: `#1D4696` (principal), `#223367` (escuro), `#319DD9` (claro).
- Fonte Ubuntu (Google Fonts), com Verdana e Tahoma de reserva.

## APIs (`/api/versan/*`)

| Arquivo | Uso no frontend | Métodos VerSan |
|---|---|---|
| `cliente.js` | Área logada (`realApi`): `status`, `entrar`, `selecionar`, `sair`, `debitos`, `pagas`, `consumo`, `pix`, `barra`, `pdf` | getAutenticacaoPessoa, getFaturaEmDebito, getFaturaPaga, getHistoricoConsumo, getCodigoPixEstatico, getCodigoBarras, getSegundaVia |
| `segunda-via-publica.js` | 2ª via fácil sem login: `consultar`, `codigoBarras`, `segundaVia` | getFaturaEmDebito (só idLigacao), getCodigoBarras, getSegundaViaOfuscada |
| `pix-rapido.js` | Pix da 2ª via fácil | getFaturaEmDebito, getCodigoPixEstatico |
| `conferencia-fatura.js` | Titular e endereço ofuscados antes de pagar | (ver limitação abaixo) |
| `enviar-fatura-email.js` | Envia a 2ª via ofuscada por e-mail | getFaturaEmDebito, getSegundaViaOfuscada + SMTP |
| `status.js` | Diagnóstico da configuração (GET) | — |

Código comum fica em `api/_lib/`. A Vercel não publica como rota os arquivos que começam com `_`.

### Segurança implementada
- O token da aplicação (`getAutenticacaoAplicacao`) e o `dataSource` (`getSecret`) ficam em cache. O token é renovado automaticamente ao expirar ou ao receber 401.
- A sessão do consumidor fica num cookie cifrado (AES-256-GCM) com as opções HttpOnly, SameSite=Strict e Secure, válido por 30 minutos e renovado a cada uso. O cookie **não guarda CPF nem senha**.
- Toda fatura pedida (Pix, código de barras, PDF, e-mail) é conferida antes da chamada: ela precisa pertencer ao CDC informado ou ao imóvel da sessão. Isso impede que alguém consulte faturas de terceiros trocando o número.
- Só aceita POST. Requisições de outra origem são recusadas (403).
- Há limite de tentativas: login, consultas públicas e e-mail (5 por hora por IP, 3 por hora por destinatário e 3 por hora por fatura).
- CPF, senha e e-mail não aparecem nos logs.

### Limitações
1. **Conferência de titular sem login:** nenhum método da collection devolve nome ou endereço a partir do CDC. Hoje a API devolve 501 e o frontend mostra o aviso padrão ("confira a segunda via antes de pagar"). Com o usuário logado, usa os dados da própria sessão, já ofuscados. Se o VerSan criar um método para isso, a troca é feita no trecho marcado em `conferencia-fatura.js`.
2. **CDC = idLigacao:** a implementação assume que a matrícula (CDC) que o cliente digita é o `id` da ligação no VerSan, como indica a documentação da "2ª via fácil". **Confirme com o VerSan.**
3. **Limite de tentativas em memória:** vale por instância da função. Para produção com muito tráfego, o ideal é usar um armazenamento compartilhado (Vercel KV ou Upstash).
4. **Mensagens de erro de login:** o formato exato do erro do `getAutenticacaoPessoa` não está documentado. A API repassa `mensagem` e `codigo` quando existem.
5. **Primeiro acesso e troca de senha:** `setAlteracaoSenhaAgenciaVirtual`, `setAlteracaoCadastral`, `setEntregaPorEmail` e `setSolicitacaoDesvinculo` estão documentados, mas o frontend herdado de Andradas ainda não chama nenhum deles. Ficam para uma próxima etapa.

## Variáveis de ambiente (Vercel → Settings → Environment Variables)

Os nomes são **os mesmos do projeto de Andradas**, então dá para copiar de lá.

| Variável | Obrigatória | Descrição |
|---|---|---|
| `VERSAN_APPLICATION_LOGIN` / `VERSAN_APPLICATION_PASSWORD` | sim | Login do integrador (o mesmo do Body do `getAutenticacaoAplicacao` no Postman) |
| `VERSAN_DATASOURCE` | sim | Ex.: `java:comp/env/jdbc/DSVerSan` |
| `HOMOLOGATION_SESSION_SECRET` (ou `SESSION_SECRET`) | sim (login) | Texto aleatório com 32 ou mais caracteres |
| `VERSAN_BASE_URL` | não | Padrão: `https://app.versan.com.br` |
| `HOMOLOGATION_MATRICULAS` | não | CDCs liberados em homologação, separados por vírgula. Se ficar vazio, todos são liberados |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | para e-mail | Servidor de envio da 2ª via |
| `VERSAN_SECRET` / `VERSAN_SECRET_URL` | não | Alternativa ao `VERSAN_DATASOURCE`, usando `getSecret` |

Depois de alterar uma variável, é preciso publicar de novo (Deployments → ⋯ → Redeploy). Para conferir, abra `/api/versan/status`.

## Testes realizados
Os testes rodaram contra um VerSan simulado que reproduz exatamente as rotas e os formatos da collection:
- 35 cenários de API, incluindo login, sessão, faturas, Pix, código de barras, PDF, e-mail, cookie adulterado, origem estranha, fatura de outro CDC e limite de envios.
- Teste no navegador da 2ª via fácil (lista, Pix, código de barras, download do PDF, envio por e-mail) e da área logada (imóveis, faturas, consumo, painel, sessão mantida após recarregar a página).
- Renovação automática do token depois de o VerSan reiniciar.

**Ainda falta testar contra o VerSan real da ANE** (homologação).
