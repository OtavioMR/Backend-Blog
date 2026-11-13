# Refresh V2 — operação e evidências de estabilidade

Atualização de 12/11/2026, local, sem deploy. O cliente público e o BFF agora usam `/auth/refresh/v2` e `/auth/logout/v2`. O relatório completo da prova em navegador está em `Front-Blog/docs/SESSION_V2_VALIDATION.md` no workspace.

## Correções no backend

- [auth.service.ts](../src/modules/auth/auth.service.ts): limpeza com `EXISTS` em vez de `DISTINCT` antes do lock; capacidade restrita à janela recuperável; informação `retry_generation` somente depois de comprovar token atual e prova da sessão.
- [auth.controller.ts](../src/modules/auth/auth.controller.ts): Swagger descreve a informação aditiva de coordenação no 409; o endpoint legado bloqueia sessões V2 com 400 sem rotacionar ou revogar, protegendo a versão nova de abas antigas. [auth.controller.spec.ts](../src/modules/auth/auth.controller.spec.ts), [Swagger legado](../src/docs/decorators/auth.decorator.ts) e [E2E](../test/auth.e2e-spec.ts) verificam a separação; protocolo 1 continua atendido.
- [refresh-recovery-v2.ts](../src/modules/auth/refresh-recovery-v2.ts): origem serializada exata e IDs de chave que distinguem chaves efetivas em uma rotação, mantendo leitura do formato legado com chave anterior configurada.
- [refresh-concurrency.integration.spec.ts](../src/modules/auth/refresh-concurrency.integration.spec.ts): cinco regressões reais adicionais, chegando a 17 testes de refresh PostgreSQL.
- [refresh-recovery-v2.spec.ts](../src/modules/auth/refresh-recovery-v2.spec.ts): recuperação após rotação de chave, compatibilidade, integridade AAD e rejeição de origens inválidas.

Nenhuma migration, regra de negócio ou política de reuso comprovado foi relaxada. Token antigo com outro ID e prova válida continua revogando a sessão conforme a política V2; ID/prova isolados não recuperam credenciais.

## Resultados desta versão

- `npm run typecheck`, `npm run build` e lint passaram; lint conserva somente o aviso anterior do alias `18+`.
- Suíte com PostgreSQL/Redis descartáveis: **448 testes, 64 arquivos, zero falhas/skips**.
- E2E HTTP isolado: **38 aprovados, um skip preexistente da newsletter V2**.
- Navegador real: recargas, concorrência, perda depois do commit, expiração, logout concorrente, cookies fora de ordem e administração com TOTP passaram. A corrida de logout antigo contra login administrativo novo também foi reproduzida/controlada em duas abas e passou após a correção do frontend.

## Configuração e limites

Mantenha JWT de acesso e refresh com segredos distintos; `FRONTEND_URL` HTTPS e Origin do BFF iguais à origem canônica. Preserve os cookies HttpOnly/Secure/SameSite Strict e o caminho `/api/v1/auth`. O V2 não deve ser chamado por formulários simples ou sem os cabeçalhos de coordenação e a prova correspondente.

`REFRESH_RECOVERY_WINDOW_SECONDS` tem padrão de 120 s, limitado pelos vencimentos dos tokens. Aumentar indiscriminadamente esse prazo não substitui tratar a mesma operação corretamente. Fora do prazo, token de entrada antigo não autoriza emitir credenciais novas. `retry_generation` permite começar outra operação somente se o token **atual** também foi apresentado.

Ao rotacionar `REFRESH_RECOVERY_ENCRYPTION_KEY`, configure temporariamente `REFRESH_RECOVERY_PREVIOUS_KEY` com a chave anterior para cobrir operações ainda recuperáveis. Não imprima essas chaves. Rotacionar o segredo que assina refresh tokens invalida tokens antigos por projeto; não confundir com a rotação da chave que protege o resultado cifrado. A chave TOTP de contas existentes deve ser preservada.

O BFF permanece limitado a uma instância com estado em memória; restart exige nova autenticação administrativa. A infraestrutura Render, os proxies, os backups e as conexões externas continuam pendentes de homologação conforme [RENDER_DEPLOY.md](RENDER_DEPLOY.md). A aprovação local não equivale a deploy ou aprovação irrestrita para cadastro público.
