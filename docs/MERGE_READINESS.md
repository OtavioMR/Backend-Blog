# Backend-Blog — parecer final de merge

**Backend: APTO PARA MERGE.**

Parecer sobre o conteúdo da árvore de trabalho validado em 12/11/2026. Não é autorização para deploy nem significa que os arquivos locais já estejam em commits. O usuário deve revisar e versionar integralmente o conteúdo listado, inclusive arquivos novos, antes de integrar. Nenhum commit, push, merge, rebase, deploy ou alteração da main foi realizado.

## Auditoria Git

- Branch: `chore/limpeza-pre-deploy`.
- HEAD: `3a4c49b39b3b65fe11133c0feae37c1cba6a7811`.
- Main local e `origin/main`, confirmadas por fetch ao início e fim: `587adf42c254369b34cf04b4da19ed6effab087a`.
- Divergência remota: 0 commits atrás / 7 à frente; main remota é ancestral de HEAD.
- Índice de staging vazio; alterações continuam locais e não commitadas.
- Inventário anterior preservado: 39 caminhos com mudanças já existentes; todos os seus conteúdos de código/documentação/testes foram preservados, exceto os ajustes explicitamente descritos desta consolidação. A comparação SHA-256 de todos os arquivos inventariados não encontrou mudança inesperada.
- Estado final: **38 modificados, 2 excluídos, 5 novos não rastreados**.
- Diferença acumulada com main: 87 caminhos rastreados + 5 novos, detalhados ao final. Inclui trabalho anterior; não foi tudo criado nesta limpeza.
- Conflitos: nenhum indício de conflito de conteúdo na consulta atual, pois a main remota não contém commits exclusivos. A integração pode ser fast-forward depois de o usuário criar os commits locais, se a main continuar inalterada. Não foi executado merge de teste. Uma main remota que avance exige nova comparação.

### Commits existentes além da main

- 3a4c49b feat(posts): adicionar filtro para artigos avulsos com a opção standalone
- b39ac02 feat(posts): aumentar limite máximo de conteúdo para 55.000 caracteres
- a6a2642 feat(auth): implement v2 refresh token protocol with recovery support
- 0fbac30 feat(posts): enhance post series management with cover images and AI declarations
- 8091b8d feat: enhance TOTP and recovery email integration
- c2759f8 feat(moderation): enhance role management and user detail retrieval
- 35df926 Merge pull request #60 from OtavioMR/main

## Limpezas desta etapa

- Removidos somente `src/modules/auth/dto/update-auth.dto.ts` e `src/modules/auth/dto/refresh-token.dto.ts`. Não têm imports, instâncias, parâmetros de controller, registro Swagger ou consumidores nos testes. O primeiro era scaffolding sem endpoint; o segundo descrevia corpo de refresh abandonado. Os endpoints atuais recebem cookies/cabeçalhos, e tanto V2 quanto a compatibilidade do protocolo 1 permanecem intactos.
- [.dockerignore](../.dockerignore): excluir .tmp/.temp/scratch do contexto; Dockerfile não copia nem usa esses diretórios.
- Dois arquivos de testes de moderação tinham uma linha vazia extra no EOF relativa à main. Removida somente essa linha em cada um; comparação com HEAD após normalizar o terminador comprova que o corpo é idêntico. Nenhum assert foi modificado.
- [BACKLOG.md](../BACKLOG.md): parecer atual, preservando histórico.

Nenhuma dependência foi removida, instalada ou atualizada; manifest e lockfile têm as mesmas dependências e versões declaradas. Os ajustes prévios nos scripts foram mantidos. Não houve mudança de arquitetura, schema, regra de negócio, visual, autorização, recuperação ou protocolo nesta consolidação.

## Mantidos / dúvidas registradas

- Migrations históricas, entidades, tabelas, relacionamentos e contratos HTTP. Contra HEAD nenhuma migration mudou; contra main existem somente as adições SeriesCover e RefreshRecoveryV2, já commitadas antes desta etapa.
- Endpoint legado mantido para protocolo 1 e protegido contra rotação/revogação de sessão V2 por cliente antigo; não foi removido.
- Módulo de newsletter não registrado em AppModule, preservado para V2, documentação e testes existentes. Serviços/analytics e estruturas compartilhadas não foram removidos.
- Barrels `src/common/decorators/index.ts`, `src/modules/auth/guard/index.ts` e utilitário `current-user.decorator.ts`: sem consumidor ativo identificado, mas mantidos como conveniências de importação/desenvolvimento, por benefício insuficiente de removê-los. Uso futuro/externo não foi presumido inexistente.
- Todos os testes, inclusive skip da newsletter V2; Dockerfile/Compose, scripts administrativos, recuperação TOTP, PostgreSQL/Redis, Swagger e telemetria.
- Dependências sem import direto incluem drivers carregados por TypeORM/Passport, tipos, CLI/ferramentas, cobertura, Vite/Vitest e exportador OTLP. Mapped-types também é dependência do Swagger instalado. Não se concluiu desuso apenas por busca textual. Remoções adicionais ficam opcionais, fora da aprovação desta limpeza.

## Segurança e arquivos gerados

- Inventariados 337 arquivos rastreados ou novos na entrada da auditoria, com AST de 311 fontes e entradas automáticas/CLI/testes consideradas. Diretórios ignorados foram examinados por metadados, sem abrir ambientes pessoais ou copiar dados reais.
- Arquivo de ambiente versionado encontrado: apenas .env.example. Variantes .env.production/.env.staging/.env.test e os ambientes locais estão ignorados. Nenhum build, cobertura, node_modules, upload, log, dump, backup, chave PEM/KEY/P12/PFX foi identificado como versionado.
- Pesquisa local de chaves privadas, padrões AWS/GitHub/Google/Slack e URIs com credenciais, incluindo histórico alcançável para nomes e padrões de alta confiança: sem segredo real identificado. Três ocorrências candidatas pertencem exclusivamente a fixtures/configs sintéticas de testes de refresh e TOTP. Nenhum valor é reproduzido aqui. Não foi feita reescrita de histórico nem revogação de credenciais. A busca não certifica formatos desconhecidos ou segredos fora do repositório.
- `npm ls --omit=dev --depth=0`: exit 0. Manifest/lockfile consistentes e inalterados nesta consolidação. `npm audit --omit=dev`: zero vulnerabilidades reportadas nesta consulta; dependências de desenvolvimento não incluídas nessa contagem.
- `git diff --check` contra HEAD e main: sem erro após as limpezas.
- Compose validado com .env.example e `--quiet --no-env-resolution`, sem ler/imprimir o ambiente de serviço real. Configurações Render, TLS PostgreSQL, Redis, limites e Dockerfile foram preservadas.

## Validação atual

| Comando | Resultado |
| --- | --- |
| npm run lint | Exit 0; 0 erros, 1 aviso anterior do alias 18+ |
| npm run typecheck | Exit 0, incluindo testes |
| npm run build | Exit 0, cópia temporária atualizada; dist original preservado |
| npm test com RUN_DB_TESTS=1/RUN_REDIS_TESTS=1 | 64 arquivos, 448 aprovados, 0 falhas/skips |
| npm run test:e2e | 9 arquivos, 38 aprovados, 0 falhas, 1 skip V2 newsletter |
| Rechecagem após ajuste exclusivo de EOF | 2 arquivos de moderação, 15 testes aprovados; corpo/asserts inalterados |
| Migrations compiladas em banco vazio | 60 aplicadas; repetição sem pendências |
| Matriz real integrada no frontend | 11 subtestes/12 checks do runner aprovados |

Cadastro/login, cookies, refresh V2 e legado de transição, logout, 2FA, recuperação, permissões, artigos/publicação, comentários e moderação são cobertos pelas suítes completas e pelo navegador integrado. O único teste E2E não executado é o já desativado da newsletter V2, fora da V1. Nenhum teste ou assert foi relaxado para obter aprovação.

Usados PostgreSQL 16 em tmpfs, Redis 7 e Mailpit novos, com bancos separados para checks e navegador, portas aleatórias no loopback e apenas credenciais/dados sintéticos. SMTP externo não foi usado. Nenhum container de aplicação/banco existente foi iniciado por comando de teste, nenhum volume existente foi alterado/removido. As cópias não incluem .env. Migrations históricas não foram editadas.

Os três serviços descartáveis foram parados após a validação; não foram removidos volumes. Os diagnósticos do editor não responderam nesta execução e não são usados como evidência; lint/typecheck/build CLI concluíram com sucesso. Execução fria de npm ci e homologação real do Render não foram feitas; não se instalaram dependências.

## Pendências por severidade e riscos

- **Crítica/alta para o merge:** nenhuma identificada no conteúdo validado.
- **Média operacional para deploy:** homologar domínio/HTTPS público, cadeia de proxy/IP/rate limiting, serviços externos, SMTP, persistência de uploads e backups/restauração. Aprovação de merge não libera produção.
- **Média operacional:** BFF permanece em memória de uma instância; restart exige novo login administrativo e múltiplas réplicas sem estado compartilhado não são suportadas. Janela de recuperação V2 é finita; os limites não foram afrouxados.
- **Média de compatibilidade entre repositórios:** integrar/publicar os dois conjuntos de maneira coordenada. O frontend atualizado exige API V2; a API atual rejeita refresh legado sobre sessões V2. Não publicar uma combinação incompatível de versões.
- **Baixa:** aviso de enum com aliases intencionais e barrels/utilitário sem consumidor atual conhecido. Não justificam refatoração nesta consolidação.
- **Procedimental:** o conteúdo aprovado ainda precisa ser commitado pelo usuário. Um merge apenas dos sete commits existentes deixa de fora os ajustes locais e relatórios/testes novos. Incluir todos os novos arquivos necessários, e não apenas arquivos já rastreados.

Risco de regressão desta limpeza: baixo, pois somente DTOs não alcançáveis, contexto Docker e EOF foram ajustados. O conjunto acumulado anterior tem sensibilidade maior em autenticação, recuperação e permissões; foi preservado e validado com backend/frontend juntos.

## Inventário completo da árvore de trabalho

| Status | Arquivo | Origem/justificativa |
| --- | --- | --- |
| M | [.dockerignore](../.dockerignore) | Proteção de temporários/logs |
| M | [.env.example](../.env.example) | Trabalho anterior preservado |
| M | [.gitignore](../.gitignore) | Trabalho anterior preservado |
| M | [BACKLOG.md](../BACKLOG.md) | Registro da consolidação, mantendo histórico |
| M | [package.json](../package.json) | Trabalho anterior preservado |
| M | [src/app.module.ts](../src/app.module.ts) | Trabalho anterior preservado |
| M | [src/common/public-cache.integration.spec.ts](../src/common/public-cache.integration.spec.ts) | Trabalho anterior preservado |
| M | [src/config/env.validation.spec.ts](../src/config/env.validation.spec.ts) | Trabalho anterior preservado |
| M | [src/config/env.validation.ts](../src/config/env.validation.ts) | Trabalho anterior preservado |
| M | [src/database/data-source.ts](../src/database/data-source.ts) | Trabalho anterior preservado |
| M | [src/docs/decorators/auth.decorator.ts](../src/docs/decorators/auth.decorator.ts) | Trabalho anterior preservado |
| M | [src/docs/swagger.spec.ts](../src/docs/swagger.spec.ts) | Trabalho anterior preservado |
| M | [src/modules/auth/auth.controller.spec.ts](../src/modules/auth/auth.controller.spec.ts) | Trabalho anterior preservado |
| M | [src/modules/auth/auth.controller.ts](../src/modules/auth/auth.controller.ts) | Trabalho anterior preservado |
| M | [src/modules/auth/auth.service.ts](../src/modules/auth/auth.service.ts) | Trabalho anterior preservado |
| D | `src/modules/auth/dto/refresh-token.dto.ts` | Remoção segura: arquivo sem consumidores |
| D | `src/modules/auth/dto/update-auth.dto.ts` | Remoção segura: arquivo sem consumidores |
| M | [src/modules/auth/recovery-email.integration.spec.ts](../src/modules/auth/recovery-email.integration.spec.ts) | Trabalho anterior preservado |
| M | [src/modules/auth/refresh-concurrency.integration.spec.ts](../src/modules/auth/refresh-concurrency.integration.spec.ts) | Trabalho anterior preservado |
| M | [src/modules/auth/refresh-recovery-v2.ts](../src/modules/auth/refresh-recovery-v2.ts) | Trabalho anterior preservado |
| M | [src/modules/auth/totp.service.spec.ts](../src/modules/auth/totp.service.spec.ts) | Trabalho anterior preservado |
| M | [src/modules/mail/mail-outbox.integration.spec.ts](../src/modules/mail/mail-outbox.integration.spec.ts) | Trabalho anterior preservado |
| M | [src/modules/mail/mail-queue.integration.spec.ts](../src/modules/mail/mail-queue.integration.spec.ts) | Trabalho anterior preservado |
| M | [src/modules/moderation/moderation-appeals.controller.ts](../src/modules/moderation/moderation-appeals.controller.ts) | Trabalho anterior preservado |
| M | [src/modules/moderation/moderation-appeals.spec.ts](../src/modules/moderation/moderation-appeals.spec.ts) | Trabalho anterior preservado |
| M | [src/modules/moderation/moderation.adversarial.spec.ts](../src/modules/moderation/moderation.adversarial.spec.ts) | Somente linha vazia final |
| M | [src/modules/moderation/moderation.controller.spec.ts](../src/modules/moderation/moderation.controller.spec.ts) | Somente linha vazia final |
| M | [src/modules/moderation/moderation.integration.spec.ts](../src/modules/moderation/moderation.integration.spec.ts) | Trabalho anterior preservado |
| M | [src/modules/newsletter/newsletter.service.ts](../src/modules/newsletter/newsletter.service.ts) | Trabalho anterior preservado |
| M | [src/modules/posts/feed.service.ts](../src/modules/posts/feed.service.ts) | Trabalho anterior preservado |
| M | [src/modules/posts/post-cover.spec.ts](../src/modules/posts/post-cover.spec.ts) | Trabalho anterior preservado |
| M | [src/modules/posts/posts.service.spec.ts](../src/modules/posts/posts.service.spec.ts) | Trabalho anterior preservado |
| M | [src/modules/posts/posts.service.ts](../src/modules/posts/posts.service.ts) | Trabalho anterior preservado |
| M | [src/modules/posts/series-swagger.spec.ts](../src/modules/posts/series-swagger.spec.ts) | Trabalho anterior preservado |
| M | [src/modules/posts/series-workflow.integration.spec.ts](../src/modules/posts/series-workflow.integration.spec.ts) | Trabalho anterior preservado |
| M | [test/auth.e2e-spec.ts](../test/auth.e2e-spec.ts) | Trabalho anterior preservado |
| M | [test/comments.e2e-spec.ts](../test/comments.e2e-spec.ts) | Trabalho anterior preservado |
| M | [test/post-review.e2e-spec.ts](../test/post-review.e2e-spec.ts) | Trabalho anterior preservado |
| M | [test/sprint2.e2e-spec.ts](../test/sprint2.e2e-spec.ts) | Trabalho anterior preservado |
| M | [test/sprint6.e2e-spec.ts](../test/sprint6.e2e-spec.ts) | Trabalho anterior preservado |
| A (não rastreado) | [docs/MERGE_READINESS.md](../docs/MERGE_READINESS.md) | Novo parecer desta consolidação |
| A (não rastreado) | [docs/PRODUCTION_READINESS.md](../docs/PRODUCTION_READINESS.md) | Trabalho anterior preservado |
| A (não rastreado) | [docs/REFRESH_V2_OPERATIONS.md](../docs/REFRESH_V2_OPERATIONS.md) | Trabalho anterior preservado |
| A (não rastreado) | [docs/RENDER_DEPLOY.md](../docs/RENDER_DEPLOY.md) | Trabalho anterior preservado |
| A (não rastreado) | [src/modules/auth/refresh-recovery-v2.spec.ts](../src/modules/auth/refresh-recovery-v2.spec.ts) | Trabalho anterior preservado |

## Diferenças acumuladas com origin/main

- M: `.dockerignore`
- M: `.env.example`
- M: `.gitignore`
- M: `BACKLOG.md`
- M: `docker-compose.yml`
- A: `docs/2FA_RECOVERY_REVIEW.md`
- A: `docs/RECOVERY_FLOW_VALIDATION.md`
- M: `docs/TOTP_RECOVERY.md`
- M: `package.json`
- M: `src/app.module.ts`
- M: `src/common/public-cache.integration.spec.ts`
- M: `src/config/env.validation.spec.ts`
- M: `src/config/env.validation.ts`
- M: `src/database/bootstrap-super-admin.ts`
- M: `src/database/data-source.ts`
- A: `src/database/migrations/1798100000000-SeriesCover.ts`
- A: `src/database/migrations/1798200000000-RefreshRecoveryV2.ts`
- M: `src/database/recover-admin-totp.ts`
- M: `src/docs/decorators/auth.decorator.ts`
- M: `src/docs/decorators/posts.decorator.ts`
- M: `src/docs/models/post-response.dto.ts`
- M: `src/docs/swagger.spec.ts`
- M: `src/field-limits.spec.ts`
- A: `src/modules/audit/audit.adversarial.spec.ts`
- M: `src/modules/audit/audit.controller.ts`
- A: `src/modules/audit/audit.service.spec.ts`
- M: `src/modules/audit/audit.service.ts`
- M: `src/modules/auth/auth.controller.spec.ts`
- M: `src/modules/auth/auth.controller.ts`
- M: `src/modules/auth/auth.module.ts`
- M: `src/modules/auth/auth.service.spec.ts`
- M: `src/modules/auth/auth.service.ts`
- M: `src/modules/auth/dto/auth-response.dto.ts`
- D: `src/modules/auth/dto/refresh-token.dto.ts`
- D: `src/modules/auth/dto/update-auth.dto.ts`
- A: `src/modules/auth/entities/refresh-operation.entity.ts`
- M: `src/modules/auth/entities/session.entity.ts`
- M: `src/modules/auth/guard/roles.guard.spec.ts`
- M: `src/modules/auth/guard/roles.guard.ts`
- M: `src/modules/auth/interfaces/request-with-user.interface.ts`
- M: `src/modules/auth/recovery-email.controller.ts`
- M: `src/modules/auth/recovery-email.integration.spec.ts`
- M: `src/modules/auth/recovery-email.service.ts`
- A: `src/modules/auth/refresh-concurrency.integration.spec.ts`
- A: `src/modules/auth/refresh-recovery-v2.ts`
- M: `src/modules/auth/social-auth.controller.ts`
- M: `src/modules/auth/strategies/jwt.strategy.spec.ts`
- M: `src/modules/auth/strategies/jwt.strategy.ts`
- M: `src/modules/auth/totp-recovery-operations.ts`
- M: `src/modules/auth/totp-recovery.controller.spec.ts`
- M: `src/modules/auth/totp-recovery.controller.ts`
- M: `src/modules/auth/totp-recovery.integration.spec.ts`
- M: `src/modules/auth/totp-recovery.service.ts`
- M: `src/modules/auth/totp.controller.ts`
- M: `src/modules/auth/totp.service.spec.ts`
- M: `src/modules/auth/totp.service.ts`
- M: `src/modules/mail/mail-outbox.integration.spec.ts`
- M: `src/modules/mail/mail-queue.integration.spec.ts`
- M: `src/modules/moderation/admin-rbac.http.spec.ts`
- M: `src/modules/moderation/moderation-appeals.controller.ts`
- M: `src/modules/moderation/moderation-appeals.spec.ts`
- A: `src/modules/moderation/moderation.adversarial.spec.ts`
- M: `src/modules/moderation/moderation.controller.spec.ts`
- M: `src/modules/moderation/moderation.controller.ts`
- M: `src/modules/moderation/moderation.integration.spec.ts`
- M: `src/modules/moderation/moderation.service.spec.ts`
- M: `src/modules/moderation/moderation.service.ts`
- M: `src/modules/newsletter/newsletter.service.ts`
- M: `src/modules/posts/dto/create-post.dto.ts`
- M: `src/modules/posts/dto/find-posts-query.dto.ts`
- M: `src/modules/posts/dto/series.dto.ts`
- M: `src/modules/posts/dto/update-post.dto.ts`
- M: `src/modules/posts/feed.service.ts`
- M: `src/modules/posts/post-cover.spec.ts`
- M: `src/modules/posts/post-series.controller.ts`
- M: `src/modules/posts/post-series.service.ts`
- M: `src/modules/posts/posts.controller.ts`
- M: `src/modules/posts/posts.service.spec.ts`
- M: `src/modules/posts/posts.service.ts`
- A: `src/modules/posts/series-swagger.spec.ts`
- A: `src/modules/posts/series-workflow.integration.spec.ts`
- M: `src/modules/users/users.service.ts`
- M: `test/auth.e2e-spec.ts`
- M: `test/comments.e2e-spec.ts`
- M: `test/post-review.e2e-spec.ts`
- M: `test/sprint2.e2e-spec.ts`
- M: `test/sprint6.e2e-spec.ts`
- A (novo, não rastreado): `docs/MERGE_READINESS.md`
- A (novo, não rastreado): `docs/PRODUCTION_READINESS.md`
- A (novo, não rastreado): `docs/REFRESH_V2_OPERATIONS.md`
- A (novo, não rastreado): `docs/RENDER_DEPLOY.md`
- A (novo, não rastreado): `src/modules/auth/refresh-recovery-v2.spec.ts`

## Recomendação

**Backend: APTO PARA MERGE do conteúdo integral validado, após revisão e commits pelo usuário.** Não executar integração com arquivos novos faltando, não confundir merge com deploy e revalidar se a main ou o conteúdo mudar. Não há aprovação para descartar alterações existentes ou remover proteções V2.
