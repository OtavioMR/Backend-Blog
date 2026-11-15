# Remoção de Redis e BullMQ: execução e validação

Data: 14/11/2026. Alterações locais nos dois repositórios, sem commit, push, deploy ou mudança de recursos externos. Segredos existentes não foram rotacionados.

## Resultado arquitetural

Redis/ioredis e BullMQ foram retirados dos manifests, instalações e código de execução. O BFF usa `pg` e `admin_bff_sessions`, com payload AES-256-GCM, concessão e versão. A fila usa a outbox PostgreSQL, reservas atômicas, estados, backoff, recuperação e confirmação condicionada. O throttler e as tentativas de confirmação são compartilhados no PostgreSQL. As consultas públicas não usam cache distribuído. Newsletter permanece desativada na V1, com código preservado.

Operação, configuração, modelo de concorrência, instruções de inicialização e checklist do primeiro deploy: [POSTGRES_ARCHITECTURE.md](POSTGRES_ARCHITECTURE.md).

## Resultados executados

| Verificação | Resultado |
|---|---|
| Backend `typecheck`, `lint`, `build` | Passaram; lint com um aviso preexistente de alias de enum |
| Backend suíte completa com `RUN_DB_TESTS=1` | 63 arquivos, **455 testes aprovados**, sem falhas/skips |
| Backend E2E completo | 10 arquivos, **42 aprovados**, um skip preexistente da newsletter V2 |
| Backend nova fila com SMTP local real | **6 testes aprovados**, incluindo término de processo do worker |
| Backend novos fluxos HTTP + PostgreSQL + SMTP local | **4 aprovados**: confirmação, recuperação de senha, alteração de endereço, recuperação 2FA/avisos |
| Backend validação final de fila/proxy/ambiente | **41 testes aprovados** |
| Frontend `lint`, `typecheck`, `build` | Passaram; lint com seis avisos preexistentes |
| Frontend `test:public` | **17 aprovados** |
| Frontend `test:session` | **28 aprovados** |
| Frontend `test:studio` | **13 aprovados** |
| Frontend `test:theme` | **12 aprovados** |
| Frontend `test:admin` | **11 aprovados**, com PostgreSQL real e processos Next separados |
| Frontend `test:editorial-e2e` | **1 aprovado** em Chromium, API simulada e armazenamento PostgreSQL real |
| Frontend `test:account-browser` | **2 aprovados** |
| Frontend `test:comment-browser` | **1 aprovado** |
| Frontend `test:publication-browser` | **1 aprovado** |
| Frontend `test:revisions-browser` | **1 aprovado** |
| Frontend `test:collections-browser` | **1 aprovado** |
| Frontend `test:series-browser` | **1 aprovado** após corrigir a fixture de filtro |
| Matriz V2 real: Next produção + Nest + PostgreSQL + Chromium/HTTPS | **12 aprovados**, sem falhas/skips |
| Migrations no banco local existente | Duas novas aplicadas; **62 migrations registradas** |
| Migrations em banco novo de prova | **62 aplicadas**, segunda execução sem pendências; somente o banco sintético foi removido depois |
| Compose backend e frontend | Configuração válida, sem serviço Redis |
| Build Docker backend | Imagem `backend-blog:postgres-local` construída |
| Runtime Docker | Health HTTP 200 com PostgreSQL e Redis parado; módulos Redis/BullMQ ausentes na imagem |
| Dependências instaladas, ambos os projetos | `npm ls ioredis bullmq redis --all`: árvore vazia |
| Varredura de runtime/testes/configuração ativa | Sem imports, clientes, variáveis ou adaptadores Redis/BullMQ |

A matriz V2 real cobre login/logout, cookies HttpOnly/Secure/SameSite Strict, recargas rápidas, chamadas e abas simultâneas, perda antes/depois do commit, corpo perdido após cookies, JWT realmente expirado, revogação, respostas antigas, 2FA administrativo e logout atrasado contra login novo. Usa o PostgreSQL local autorizado, chaves sintéticas no processo e cópias temporárias; não envia e-mails externos.

A prova administrativa distribuída cria sessão em um processo Next, usa em outro, reinicia uma instância, força refresh simultâneo e verifica chave incorreta, payload adulterado, CSRF, revogação e propriedade da concessão. Os testes da fila fazem SMTP real contra um servidor de captura em loopback. Backoff e concessões são acelerados por atualizações de prazos em linhas exclusivamente sintéticas; os intervalos calculados são verificados antes da aceleração.

## Falhas encontradas e resolvidas durante a execução

- Primeira aplicação da migration encontrou trigger antigo ausente. Houve rollback integral; a nova migration passou a remover essas estruturas com `IF EXISTS`, sem alterar migrations históricas.
- Fixtures de rate limiting precisaram de conexão PostgreSQL e namespaces de teste independentes. O limite compartilhado revelou interferência entre suítes que antes reiniciavam contadores em memória. Os limites de produção não foram aumentados nem desativados.
- O driver TypeORM retorna formato diferente para `UPDATE RETURNING`; as reservas e confirmações passaram a retornar por CTE com `SELECT`, verificadas contra o banco real.
- Exclusão de sessão durante refresh precisava ser idempotente quando a linha já tivesse sido revogada. O caso foi corrigido e a proteção contra proprietário vencido foi preservada.
- Fixtures de interface editorial/séries estavam sem o filtro `kind=standalone` já exigido pelo frontend. Foram atualizadas para o contrato real, sem alterar o produto ou enfraquecer asserts de segurança.
- Um comando administrativo foi inicialmente executado na pasta do backend, que não possui esse script; a execução foi repetida corretamente no frontend.

## Limitações e preparação externa

- O skip restante é da newsletter V2 deliberadamente fora da V1. Seus handlers e persistência continuam presentes; não foi ativada para obter resultados.
- CI remota não foi disparada. Os workflows foram atualizados; comandos correspondentes foram exercitados localmente. A fixture standalone do frontend usa somente PostgreSQL sintético.
- Não houve deploy nem homologação de Vercel/Render/Neon/Supabase. TLS do provedor, domínio, cadeia de proxies, IP efetivo, roles, pools, SMTP autorizado, uploads e restauração continuam no checklist do primeiro deploy.
- Sem cadeia confiável configurada, o BFF compartilha a identidade de rede do servidor nos limites por IP. Isso fecha a possibilidade de escolher IP por headers, mas pode agregar limites entre administradores. Deve ser homologado no ambiente final.
- SMTP permanece sujeito a duplicação após aceite seguido de queda, pois não há transação conjunta SMTP/PostgreSQL. `Message-ID` estável não equivale a idempotência garantida.
- Desempenho local não garante capacidade de produção. O teste público agora verifica consulta SQL e atualização imediata; não há mais expectativa de zero SQL por hit de cache. A carga do provedor escolhido ainda precisa de medição.
- Backlogs e relatórios antigos com referências à infraestrutura anterior foram preservados como registros históricos, com avisos e links para a operação atual. O lockfile do backend ainda contém metadados de peers opcionais publicados pelo TypeORM; esses pacotes não estão instalados nem são usados.
- O contêiner antigo Redis ficou **parado**. Seu volume não foi apagado. Nenhum dado PostgreSQL de negócio foi apagado para realizar a refatoração. As sessões antigas do armazenamento retirado não são importadas.

## Configuração local

Foi adicionada a conexão PostgreSQL administrativa ao arquivo local ignorado do frontend, usando a conexão de desenvolvimento existente. A configuração antiga de Redis foi retirada. Os demais segredos foram preservados. Em produção, usar uma role exclusiva e restrita do BFF conforme a documentação de arquitetura.

Antes das migrations foi feito [backup local do banco configurado](C:/Users/otavv/AppData/Local/Temp/vscode-agent-codex-sandbox-ssUnOC/griforio-pre-postgres-5AJKTU/before.dump). O arquivo permanece temporariamente fora do repositório; não contém somente dados sintéticos e não deve ser publicado. Cópias temporárias e logs de prova não foram adicionados ao Git.

## Arquivos alterados

A lista abaixo inclui arquivos adicionados, modificados e removidos nos checkouts. Caminhos removidos aparecem sem link. O arquivo local de ambiente do frontend também foi ajustado, mas permanece ignorado pelo Git e não expõe valores neste relatório.

<!-- FILE_LIST -->

### Backend-Blog

| Estado Git | Arquivo |
|---|---|
| M | [.env.example](../.env.example) |
| M | [.github/workflows/ci.yml](../.github/workflows/ci.yml) |
| M | [BACKLOG.md](../BACKLOG.md) |
| M | [README-ADMIN.md](../README-ADMIN.md) |
| M | [README.md](../README.md) |
| M | [docker-compose.yml](../docker-compose.yml) |
| M | [docs/MERGE_READINESS.md](../docs/MERGE_READINESS.md) |
| M | [docs/PRODUCTION_READINESS.md](../docs/PRODUCTION_READINESS.md) |
| M | [docs/RECOVERY_FLOW_VALIDATION.md](../docs/RECOVERY_FLOW_VALIDATION.md) |
| M | [docs/REFRESH_V2_OPERATIONS.md](../docs/REFRESH_V2_OPERATIONS.md) |
| M | [docs/RELEASE_AUDIT.md](../docs/RELEASE_AUDIT.md) |
| M | [docs/RENDER_DEPLOY.md](../docs/RENDER_DEPLOY.md) |
| M | [package-lock.json](../package-lock.json) |
| M | [package.json](../package.json) |
| M | [src/app.module.ts](../src/app.module.ts) |
| M | [src/common/http-security.spec.ts](../src/common/http-security.spec.ts) |
| M | [src/common/http-security.ts](../src/common/http-security.ts) |
| D | `src/common/public-cache.integration.spec.ts` |
| D | `src/common/public-cache.interceptor.spec.ts` |
| D | `src/common/public-cache.interceptor.ts` |
| D | `src/common/public-cache.module.ts` |
| D | `src/common/public-cache.service.ts` |
| M | [src/common/rate-limit.module.ts](../src/common/rate-limit.module.ts) |
| M | [src/common/rate-limit.spec.ts](../src/common/rate-limit.spec.ts) |
| M | [src/config/env.validation.ts](../src/config/env.validation.ts) |
| M | [src/docs/swagger.spec.ts](../src/docs/swagger.spec.ts) |
| M | [src/modules/auth/totp-recovery.integration.spec.ts](../src/modules/auth/totp-recovery.integration.spec.ts) |
| D | `src/modules/mail/mail-outbox.integration.spec.ts` |
| M | [src/modules/mail/mail-queue.integration.spec.ts](../src/modules/mail/mail-queue.integration.spec.ts) |
| M | [src/modules/mail/mail-queue.service.ts](../src/modules/mail/mail-queue.service.ts) |
| M | [src/modules/mail/mail.module.ts](../src/modules/mail/mail.module.ts) |
| M | [src/modules/mail/transactional-mail.ts](../src/modules/mail/transactional-mail.ts) |
| M | [src/modules/moderation/moderation.adversarial.spec.ts](../src/modules/moderation/moderation.adversarial.spec.ts) |
| M | [src/modules/moderation/moderation.service.ts](../src/modules/moderation/moderation.service.ts) |
| M | [src/modules/posts/post-scheduler.service.ts](../src/modules/posts/post-scheduler.service.ts) |
| M | [src/modules/reports/reports.service.ts](../src/modules/reports/reports.service.ts) |
| M | [src/modules/users/verification-code.service.spec.ts](../src/modules/users/verification-code.service.spec.ts) |
| M | [src/modules/users/verification-code.service.ts](../src/modules/users/verification-code.service.ts) |
| M | [test/admin-permissions.e2e-spec.ts](../test/admin-permissions.e2e-spec.ts) |
| M | [test/auth.e2e-spec.ts](../test/auth.e2e-spec.ts) |
| M | [test/comments.e2e-spec.ts](../test/comments.e2e-spec.ts) |
| M | [test/post-review.e2e-spec.ts](../test/post-review.e2e-spec.ts) |
| M | [test/social-auth.e2e-spec.ts](../test/social-auth.e2e-spec.ts) |
| M | [test/sprint1.e2e-spec.ts](../test/sprint1.e2e-spec.ts) |
| M | [test/sprint2.e2e-spec.ts](../test/sprint2.e2e-spec.ts) |
| M | [test/sprint6.e2e-spec.ts](../test/sprint6.e2e-spec.ts) |
| M | [test/totp.e2e-spec.ts](../test/totp.e2e-spec.ts) |
| ?? | [docs/POSTGRES_ARCHITECTURE.md](../docs/POSTGRES_ARCHITECTURE.md) |
| ?? | [docs/POSTGRES_VALIDATION.md](../docs/POSTGRES_VALIDATION.md) |
| ?? | [src/common/postgres-coordination.integration.spec.ts](../src/common/postgres-coordination.integration.spec.ts) |
| ?? | [src/common/postgres-rate-limit.storage.ts](../src/common/postgres-rate-limit.storage.ts) |
| ?? | [src/database/migrations/1798300000000-PostgresCoordination.ts](../src/database/migrations/1798300000000-PostgresCoordination.ts) |
| ?? | [src/database/migrations/1798400000000-CoordinationIndexes.ts](../src/database/migrations/1798400000000-CoordinationIndexes.ts) |
| ?? | [src/modules/mail/mail-queue.controller.ts](../src/modules/mail/mail-queue.controller.ts) |
| ?? | [test/mail-flows.e2e-spec.ts](../test/mail-flows.e2e-spec.ts) |

### Front-Blog

| Estado Git | Arquivo |
|---|---|
| M | [.env.example](../../Front-Blog/.env.example) |
| M | [.github/workflows/ci.yml](../../Front-Blog/.github/workflows/ci.yml) |
| M | [BACKLOG.md](../../Front-Blog/BACKLOG.md) |
| M | [README.md](../../Front-Blog/README.md) |
| M | [compose.sprint0.yml](../../Front-Blog/compose.sprint0.yml) |
| M | [docs/MERGE_READINESS.md](../../Front-Blog/docs/MERGE_READINESS.md) |
| M | [docs/PREDEPLOY_VALIDATION.md](../../Front-Blog/docs/PREDEPLOY_VALIDATION.md) |
| M | [docs/SESSION_V2_VALIDATION.md](../../Front-Blog/docs/SESSION_V2_VALIDATION.md) |
| M | [docs/admin-session-staging.md](../../Front-Blog/docs/admin-session-staging.md) |
| M | [docs/sprint-0-infra.md](../../Front-Blog/docs/sprint-0-infra.md) |
| M | [docs/sprint-0-local.md](../../Front-Blog/docs/sprint-0-local.md) |
| M | [docs/verificacao-openapi.md](../../Front-Blog/docs/verificacao-openapi.md) |
| M | [package-lock.json](../../Front-Blog/package-lock.json) |
| M | [package.json](../../Front-Blog/package.json) |
| M | [src/lib/admin-security.ts](../../Front-Blog/src/lib/admin-security.ts) |
| M | [src/lib/admin-session-store.ts](../../Front-Blog/src/lib/admin-session-store.ts) |
| M | [tests/admin-refresh-real.test.mjs](../../Front-Blog/tests/admin-refresh-real.test.mjs) |
| M | [tests/admin-session-distributed.test.mjs](../../Front-Blog/tests/admin-session-distributed.test.mjs) |
| M | [tests/admin-session-local-real.test.mjs](../../Front-Blog/tests/admin-session-local-real.test.mjs) |
| M | [tests/editorial-e2e.test.mjs](../../Front-Blog/tests/editorial-e2e.test.mjs) |
| M | [tests/recovery-email-docker-browser.test.mjs](../../Front-Blog/tests/recovery-email-docker-browser.test.mjs) |
| M | [tests/series-browser.test.mjs](../../Front-Blog/tests/series-browser.test.mjs) |
| M | [tests/session-v2-real-browser.test.mjs](../../Front-Blog/tests/session-v2-real-browser.test.mjs) |
| M | [tests/support/admin-store.mjs](../../Front-Blog/tests/support/admin-store.mjs) |
| ?? | [scripts/prepare-test-db.mjs](../../Front-Blog/scripts/prepare-test-db.mjs) |
| ?? | [scripts/verify-postgres-local.mjs](../../Front-Blog/scripts/verify-postgres-local.mjs) |
