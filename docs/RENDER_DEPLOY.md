# Preparação para Render — sem deploy executado

Estado em 12/11/2026: build e configuração local verificados; **a abertura pública ainda está bloqueada** pelos pontos de autenticação e infraestrutura descritos abaixo. Nenhum serviço Render foi criado ou alterado.

## Serviços e comandos

Use Node 24, como no Dockerfile existente. Para runtime Node, use `npm ci && npm run build` no build, `npm run migration:run:prod` antes de iniciar a nova versão e `npm run start:prod` no processo da API. Execute migrations uma única vez por release, com backup verificado e revisão do resultado; não use `synchronize`, `migration:revert` ou múltiplos processos concorrentes para preparar o esquema. O datasource usa uma transação por migration: PostgreSQL exige commit da adição de um valor de enum antes de usá-lo numa migration posterior. As migrations antigas foram preservadas.

O Dockerfile existente também utiliza o datasource compilado e, portanto, a mesma política de transações. Nenhuma imagem foi publicada. O script `deploy` existente é o comando do Nest, não um comando de publicação no Render.

A API deve ser um serviço privado acessado pelo servidor Next, com frontend, PostgreSQL e Redis na mesma região. O frontend precisa de um Web Service Node; um site estático não atende as rotas de servidor e o BFF. Seu build é `npm ci && npm run build`, e o start é `npm start`, que agora respeita `PORT` e escuta em `0.0.0.0`. `API_ORIGIN` participa dos rewrites gerados no build do Next: alterá-lo exige novo build.

## Variáveis, sem credenciais neste documento

| Configuração | Condição para produção |
| --- | --- |
| `NODE_ENV` | `production` em ambos os processos |
| `PORT` | Fornecida pelo Render; não fixar a porta de desenvolvimento |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Dados da conexão PostgreSQL escolhida; a aplicação usa campos separados e não interpreta `DATABASE_URL` |
| `DB_SSL` | `true` para PostgreSQL externo com TLS e certificado confiável; `false` somente quando a conexão privada selecionada permitir transporte sem TLS |
| `DB_SSL_CA` | CA PEM opcional do provedor; aceita quebras reais ou `\n`; a verificação de certificado permanece habilitada |
| `REDIS_URL` | Conexão dedicada e persistente, privada ou `rediss://` para acesso externo; não usar eviction que descarte jobs da fila |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Aleatórios, distintos, ao menos 32 caracteres; em produção a igualdade é rejeitada |
| `FRONTEND_URL` | Origem HTTPS pública; utilizada por CORS e links da API |
| `SITE_ORIGIN` no frontend | Mesma origem HTTPS; não derivar dos headers recebidos |
| `API_ORIGIN` no frontend | Origem privada alcançável pelo processo Next, sem `/api/v1` e sem barra final |
| `SMTP_*` | Provedor autorizado, credenciais em variáveis secretas; validar envio em staging |
| `TOTP_ENCRYPTION_KEY` | Chave estável de 32 bytes em hexadecimal; necessária para administrar contas com TOTP; manter backup seguro |
| `STORAGE_DRIVER` | `local` exige disco persistente em `/app/uploads` no Docker ou no diretório `uploads` do processo Node; disco efêmero não é aceitável |
| `BLOB_READ_WRITE_TOKEN` | Obrigatório quando `STORAGE_DRIVER=vercel-blob`; a validação impede fallback silencioso para disco por token ausente |
| Flags do frontend | Manter `ENABLE_ADMIN_BFF=false` e `EDITORIAL_WORKFLOW_ENABLED=false` até validar os critérios específicos para habilitação |

O Render documenta conexões PostgreSQL internas e externas com requisitos diferentes de TLS. Não configure `rejectUnauthorized: false`. Uma conexão interna que use certificados próprios exige avaliar a cadeia oferecida; o teste local com PostgreSQL descartável não prova conectividade ou certificados do provedor externo.

## Segurança e bloqueadores

- A aplicação confia em **um** proxy (`trust proxy = 1`); confirme a cadeia real Next → API e a substituição de `X-Forwarded-For`. O limiter é em memória por processo, não um limite global distribuído. Não escalar instâncias antes de validar o IP observado e o limite efetivo.
- CORS permite apenas a origem configurada e credenciais, mas não substitui CSRF. O proxy Next valida a origem nas mutações de `/api/v1`. O endpoint legado de refresh da API não tem a mesma verificação: a API não deve ficar acessível por caminhos que contornem o proxy.
- Cookies de refresh são HttpOnly, Secure em produção, SameSite Strict e restritos a `/api/v1/auth`. Testar pelo domínio HTTPS final a passagem de `Set-Cookie`, logout, expiração e duas abas. Não mudar SameSite para resolver uma topologia inadequada sem rever CSRF.
- O backend contém refresh V2 transacional, com prova HttpOnly, cookies por geração e recuperação idempotente; o cliente público e o BFF administrativo agora utilizam esse protocolo. A integração foi validada com PostgreSQL, Next e Chromium sobre HTTPS local, incluindo falhas após commit e respostas atrasadas. Evidências e limites: [REFRESH_V2_OPERATIONS.md](REFRESH_V2_OPERATIONS.md). A topologia real do Render ainda exige homologação; não substituir a política por tolerância irrestrita a reuso ou por refresh tokens no armazenamento do navegador.
- O BFF administrativo mantém sessões e tokens na memória de uma instância Next. Restart invalida essas sessões e múltiplas instâncias não compartilham estado. Restringir a uma instância até uma solução validada; não habilitar o painel sem a prova integrada de sessão, revogação e permissões.
- O JWT é verificado pela API e confrontado com sessão, `authVersion`, conta ativa e papel atual. A administração requer TOTP e e-mails principal/secundário verificados. Contas incompletas não recebem capacidade administrativa. Validar o bootstrap da conta administrativa com credenciais próprias de produção, sem colocá-las no Git.
- O health atual verifica banco, não a entrega de e-mails nem a fila Redis. Verificar fila, SMTP, backups/restauração e persistência de imagens antes de abrir ao público.
- Swagger fica indisponível em produção. Não incluir `.env`, chaves ou tokens na imagem, logs ou repositório. A varredura local de padrões conhecidos é parcial e não certifica ausência de todos os tipos de segredo no histórico.

## Referências oficiais consultadas

- [Web Services e porta HTTP](https://render.com/docs/web-services)
- [Conexões PostgreSQL e TLS](https://render.com/docs/postgresql-creating-connecting)
- [Render Key Value](https://render.com/docs/key-value)

Os resultados de compilação e testes desta preparação estão em [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).
