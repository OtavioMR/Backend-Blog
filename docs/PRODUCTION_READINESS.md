# Preparação para produção — 12/11/2026

> Atualização posterior: o bloqueador de integração do refresh legado foi tratado e validado em navegador real. Este relatório preserva o diagnóstico e os números da etapa anterior. Estado atual: [REFRESH_V2_OPERATIONS.md](REFRESH_V2_OPERATIONS.md), com referência à matriz completa no frontend. A homologação da infraestrutura e os limites do BFF continuam aplicáveis.

## Parecer

**Apto para avançar à homologação controlada; não liberar cadastro público ainda.** As verificações locais passaram, incluindo instalação em PostgreSQL vazio e testes com serviços isolados. Permanecem bloqueadores de autenticação integrada e da topologia de produção em [RENDER_DEPLOY.md](RENDER_DEPLOY.md). Não houve deploy, commit, push, merge, alteração de `main`, exclusão de migration ou acesso aos bancos existentes.

Ambos os repositórios continuam em `chore/limpeza-pre-deploy`. As alterações locais da primeira etapa foram preservadas. Nenhuma dependência foi instalada, removida ou atualizada.

## Alterações e justificativas

| Arquivos | Correção |
| --- | --- |
| [.gitignore](../.gitignore) | Proteção `.env*`, com exceção somente para `.env.example`, preservada da primeira etapa |
| [package.json](../package.json) | Scripts explícitos de typecheck e migrations compiladas; build e start existentes preservados |
| [.env.example](../.env.example), [env.validation.ts](../src/config/env.validation.ts), [env.validation.spec.ts](../src/config/env.validation.spec.ts) | TLS opcional PostgreSQL; exigência de HTTPS e segredos JWT distintos em produção; impedir configuração de Blob sem token; três testes adicionais |
| [app.module.ts](../src/app.module.ts), [data-source.ts](../src/database/data-source.ts) | Mesma opção TLS na API e CLI; validação de certificado habilitada; uma transação por migration |
| [swagger.spec.ts](../src/docs/swagger.spec.ts), [series-swagger.spec.ts](../src/modules/posts/series-swagger.spec.ts) | Tratar documento ou factory Swagger e declarar o tipo de segurança Bearer completo |
| [post-cover.spec.ts](../src/modules/posts/post-cover.spec.ts), [series-workflow.integration.spec.ts](../src/modules/posts/series-workflow.integration.spec.ts) | Fixtures autenticadas incluem e-mail, como exige `AuthenticatedUser`; contrato real preservado |
| [posts.service.spec.ts](../src/modules/posts/posts.service.spec.ts) | Preservar instância da entidade no mock e verificar propriedade de paginação sem acesso inválido à união de tipos |
| [totp.service.spec.ts](../src/modules/auth/totp.service.spec.ts), [recovery-email.integration.spec.ts](../src/modules/auth/recovery-email.integration.spec.ts) | Remover união redundante de mock e verificar variante de recuperação antes de acessar `secret`; imports sem uso da primeira etapa preservados |
| [public-cache.integration.spec.ts](../src/common/public-cache.integration.spec.ts), [mail-queue.integration.spec.ts](../src/modules/mail/mail-queue.integration.spec.ts), [mail-outbox.integration.spec.ts](../src/modules/mail/mail-outbox.integration.spec.ts) | Aceitar `TEST_REDIS_URL` para testar serviços isolados sem depender da porta fixa 16379; fallback anterior preservado |
| [moderation.integration.spec.ts](../src/modules/moderation/moderation.integration.spec.ts) | Fixtures positivas com recuperação secundária verificada; provar que promoção sem esse requisito continua rejeitada e não muda papel, versão ou auditoria |
| [comments.e2e-spec.ts](../test/comments.e2e-spec.ts), [post-review.e2e-spec.ts](../test/post-review.e2e-spec.ts) | Administradores de teste atendem requisitos atuais. Revisão cadastra TOTP real; restauração continua negada sem código e exige código novo para sucesso |
| [sprint2.e2e-spec.ts](../test/sprint2.e2e-spec.ts) | Limite real de conteúdo é 55.000 caracteres, comprovado pelo DTO e pelos testes de limites; testar aceitação no limite e rejeição em 55.001 |
| [sprint6.e2e-spec.ts](../test/sprint6.e2e-spec.ts) | Guard de tipagem no teste V2 de newsletter já desativado; teste não removido ou habilitado |
| [newsletter.service.ts](../src/modules/newsletter/newsletter.service.ts) | Remover imports de agendamento sem uso; módulo continua desativado na V1 |
| [feed.service.ts](../src/modules/posts/feed.service.ts), [posts.service.ts](../src/modules/posts/posts.service.ts), [moderation-appeals.controller.ts](../src/modules/moderation/moderation-appeals.controller.ts), [moderation-appeals.spec.ts](../src/modules/moderation/moderation-appeals.spec.ts) | Limpeza de imports da primeira etapa, mantida |
| [BACKLOG.md](../BACKLOG.md), este relatório e [RENDER_DEPLOY.md](RENDER_DEPLOY.md) | Evidências atuais, diferenças em relação a testes antigos e pendências de produção |

## Falha real de primeiro deploy corrigida

O primeiro `migration:run:prod` contra PostgreSQL vazio falhou com `55P04`: a migration que adiciona `SUPER_ADMIN` ao enum e uma posterior que usa esse valor estavam na mesma transação. A configuração `migrationsTransactionMode: 'each'` permite o commit de cada migration sem editar o histórico. Resultado: **60 migrations aplicadas**, e a repetição informou **No migrations are pending**. Isso valida a cadeia em PostgreSQL 16; a conexão e as permissões do provedor final ainda exigem homologação. Se uma migration futura falhar, as anteriores já confirmadas permanecem aplicadas; backup e acompanhamento do release continuam necessários.

## Validação final

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | Exit 0; inclui código, testes unitários, integrações e E2E |
| `npm run lint` | Exit 0; zero erros, um aviso |
| `npm run build` | Exit 0, comando real `nest build` em cópia temporária atualizada; `dist/` original preservado conforme regras locais |
| `RUN_DB_TESTS=1 RUN_REDIS_TESTS=1 npm test` | **63 arquivos, 436 testes aprovados, zero falhas, zero skips** |
| `npm run test:e2e` | **9 arquivos, 38 testes aprovados, zero falhas, 1 skip** |
| Teste E2E desativado | Newsletter V2, já explicitamente excluída da V1; preservado |
| Migrations compiladas | 60 aplicadas num banco novo; repetição sem pendências |
| Smoke do processo compilado em `NODE_ENV=production` | `PORT` respeitada; health 200, Swagger 404, administração sem token 401, newsletter 404; CORS somente para a origem configurada |
| `npm audit --omit=dev` | Zero vulnerabilidades reportadas nesta consulta; não inclui dependências de desenvolvimento |
| `git diff --check` e diagnósticos do editor | Sem erros |

As falhas iniciais das integrações (recuperação secundária ausente) e dos E2E (administradores incompletos, limite antigo e restauração sem TOTP) foram investigadas antes das correções. Nenhum status esperado foi relaxado para mascarar uma falha: as fixtures foram completadas e as verificações negativas de segurança reforçadas. Nenhuma regra de negócio ou contrato HTTP foi alterado para satisfazer os testes.

### Isolamento

PostgreSQL 16, Redis 7 e Mailpit usaram contêineres criados exclusivamente para esta execução, com portas aleatórias em `127.0.0.1` e dados sintéticos. O PostgreSQL usou tmpfs; não houve volume de dados compartilhado ou removido. A suíte de integrações e a suíte E2E usaram bancos distintos, e o Redis E2E usou índice/prefixo próprios. Código/configuração foram copiados para diretório temporário, sem `.env`, com dependências locais reutilizadas por junction; uploads dos testes ficaram nessa cópia. SMTP foi direcionado ao Mailpit ou mocks, sem entrega externa. Nenhum teste destrutivo foi executado nos bancos existentes.

## Avisos mantidos e limites

- O enum `ContentRating` tem os aliases `DEZOITO` e `EIGHTEEN_PLUS` para `18+`. O aviso de valor duplicado foi mantido para preservar compatibilidade de consumidores e documentação.
- O driver `pg` avisa sobre consultas concorrentes no mesmo client em alguns testes; a versão instalada é 8. Esse aviso não causou falhas e deve ser revisto antes de migrar para pg 9. Não foi feita uma refatoração de queries nesta preparação.
- Alguns testes imprimem erros de SMTP/Redis e de transação provocados deliberadamente por mocks de falha. O resultado final da suíte é o critério de sucesso, não a ausência dessas mensagens.
- Metadados do Git não mostraram `.env`, `.env.local`, `.env.production`, chaves PEM ou KEY nos caminhos de histórico consultados. A árvore versionada contém `.env.example`. A busca por padrões de chaves privadas, tokens GitHub e chaves AWS conhecidos não encontrou ocorrências. Arquivos pessoais ou ambientes locais não foram abertos. Isso não equivale a uma auditoria completa de todos os segredos no histórico.
- Não foi testada conexão com PostgreSQL/Redis externos, TLS real do Render, domínio público, backups do provedor, e-mail real ou persistência de uploads após redeploy. Nenhum deploy foi executado.

## Bloqueadores para abertura pública

1. Integrar e homologar o cliente/BFF com a estratégia de refresh escolhida. Há V2 no backend e testes reais de concorrência/rollback aprovados, mas o checkout atual do cliente ainda usa o endpoint legado. Registros históricos de backlog sobre integração V2 não substituem a evidência do código atual. Não alterar reuso de tokens ou prova de sessão para contornar esse trabalho.
2. Homologar HTTPS, cookies, CSRF e revogação entre abas na topologia final; impedir acesso direto à API que contorne o proxy Next e comprovar a origem/IP vistos pelo limiter.
3. Configurar e verificar PostgreSQL externo, Redis durável, SMTP, segredos exclusivos, chave TOTP estável, armazenamento persistente e restauração de backup.
4. Manter uma única instância Next para o BFF em memória e as flags desabilitadas até prova integrada de administração. Não extrapolar os testes simulados para uma certificação de múltiplas instâncias.

O frontend tem relatório próprio em seu repositório: `docs/PREDEPLOY_VALIDATION.md`.
