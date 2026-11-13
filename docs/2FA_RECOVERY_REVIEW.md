# Integração das regras de 2FA e e-mail de recuperação

Data: 11/11/2026. Alterações locais nos repositórios backend e frontend, sem commits, push ou publicação externa.

Atualização posterior na mesma data: a remoção agora é confirmada no principal, as ações têm páginas próprias e o pedido de recuperação informa elegibilidade somente após senha válida. O relato abaixo registra a integração anterior; os contratos e as evidências atuais estão em [RECOVERY_FLOW_VALIDATION.md](RECOVERY_FLOW_VALIDATION.md) e [TOTP_RECOVERY.md](TOTP_RECOVERY.md).

## 1. Diagnóstico e reaproveitamento

Já existiam autenticação JWT com sessões persistidas e rotação de refresh token, TOTP cifrado com prevenção de replay, oito códigos reserva com hash e consumo único, cadastro/troca/remoção de secundário, autorização assistida por SUPER_ADMIN, procedimento de recuperação no servidor, grants de recuperação com hashes, outbox transacional cifrada, auditoria e limites de requisição.

O fluxo de recuperação já mantinha o autenticador anterior até confirmar um código do novo, substituía o fator em transação, invalidava códigos antigos e sessões, notificava o titular e mostrava novos códigos uma vez. Tudo isso foi preservado. Também foram reaproveitados os componentes de segurança da conta, o formulário administrativo, o BFF com CSRF e o modal global de confirmação.

Lacunas encontradas: o secundário era pré-requisito universal de 2FA; a remoção não distinguia administradores; a promoção administrativa verificava principal e 2FA, mas não o secundário; o bootstrap não exigia todas as proteções; a recuperação assistida escolhia automaticamente o secundário e recusava contas comuns sem ele. As telas de configurações ainda continham links antigos e textos de obrigatoriedade universal.

## 2. Alterações mínimas implementadas

- READER/AUTHOR: 2FA e secundário opcionais e independentes; ativação sem secundário; remoção do secundário preserva 2FA; desativação do 2FA preserva secundário.
- Remoção: senha, TOTP atual quando ativo, modal de risco, confirmação por link no secundário atual e aviso/cancelamento no principal. O backend já oferecia os mecanismos de reautenticação e confirmação; foram mantidos.
- ADMIN/SUPER_ADMIN: remoção proibida tanto ao solicitar quanto ao confirmar, sob lock. Substituição continua usando o endereço anterior até confirmar o novo. Desativação de 2FA permanece proibida. Promoção e bootstrap exigem principal verificado, secundário verificado e 2FA.
- Contas administrativas legadas incompletas conservam o cargo armazenado e as proteções especiais, mas recebem somente permissões efetivas de leitor na identidade JWT até regularização. Isso bloqueia privilégios também nas rotas com JWT opcional e nas verificações de propriedade. A área da própria conta continua acessível.
- Recuperação assistida: o endpoint existente recebe `destination: primary|secondary`, com principal preferencial e padrão. A consulta administrativa existente fornece apenas destinos verificados a SUPER_ADMIN; ADMIN recebe somente o indicador de secundário confirmado. Nenhum endereço livre é aceito. Destino revalidado sob lock e registrado na auditoria sem expor o endereço.
- Autoatendimento permanece restrito ao secundário confirmado e à senha atual. Não há fallback automático para o principal. SUPER_ADMIN alvo mantém o procedimento no servidor; permanecem proibidos autoaprovação e autorização online de SUPER_ADMIN.
- Procedimento no servidor: aceita seleção por identificador `--destination primary|secondary`, mantendo simulação por padrão, confirmação explícita, identificação do operador e referência de atendimento.
- Mensagens esclarecem evidências confiáveis, recusa sem comprovação e possibilidade de apresentar novas evidências pelo atendimento existente. Não foi criado um sistema de chamados ou uma nova arquitetura de recuperação.
- Contratos alterados documentados no Swagger, com verificação automatizada do enum de destino e respostas de proibição na remoção. Respostas de ativação com códigos reserva recebem `Cache-Control: no-store`.

## 3. Banco e compatibilidade

Nenhuma entidade, endpoint, serviço, dependência ou migration nova. Foram reutilizados os campos de usuários, snapshots dos grants, versão de autenticação, sessões, códigos e auditoria. Não houve sincronização de schema ou modificação de migrations antigas. O banco principal Docker foi usado com contas sintéticas, removidas ao terminar os testes.

O contrato administrativo ganhou campos aditivos. Omitir `destination` na autorização assistida agora seleciona o principal verificado; implante frontend e backend em conjunto e revise consumidores externos desse endpoint. A aplicação comum continua usando os mesmos contratos de 2FA e secundário.

## 4. Arquivos alterados

Backend, implementação:

- [totp.service.ts](../src/modules/auth/totp.service.ts), [totp.controller.ts](../src/modules/auth/totp.controller.ts).
- [recovery-email.service.ts](../src/modules/auth/recovery-email.service.ts), [recovery-email.controller.ts](../src/modules/auth/recovery-email.controller.ts).
- [totp-recovery.service.ts](../src/modules/auth/totp-recovery.service.ts), [totp-recovery-operations.ts](../src/modules/auth/totp-recovery-operations.ts), [totp-recovery.controller.ts](../src/modules/auth/totp-recovery.controller.ts).
- [jwt.strategy.ts](../src/modules/auth/strategies/jwt.strategy.ts), [roles.guard.ts](../src/modules/auth/guard/roles.guard.ts), [request-with-user.interface.ts](../src/modules/auth/interfaces/request-with-user.interface.ts), [users.service.ts](../src/modules/users/users.service.ts).
- [moderation.service.ts](../src/modules/moderation/moderation.service.ts), [moderation.controller.ts](../src/modules/moderation/moderation.controller.ts).
- [bootstrap-super-admin.ts](../src/database/bootstrap-super-admin.ts), [recover-admin-totp.ts](../src/database/recover-admin-totp.ts).

Backend, testes:

- [totp.service.spec.ts](../src/modules/auth/totp.service.spec.ts), [recovery-email.integration.spec.ts](../src/modules/auth/recovery-email.integration.spec.ts).
- [totp-recovery.controller.spec.ts](../src/modules/auth/totp-recovery.controller.spec.ts), [totp-recovery.integration.spec.ts](../src/modules/auth/totp-recovery.integration.spec.ts).
- [roles.guard.spec.ts](../src/modules/auth/guard/roles.guard.spec.ts), [jwt.strategy.spec.ts](../src/modules/auth/strategies/jwt.strategy.spec.ts).
- [moderation.service.spec.ts](../src/modules/moderation/moderation.service.spec.ts), [admin-rbac.http.spec.ts](../src/modules/moderation/admin-rbac.http.spec.ts).

Frontend, implementação (caminhos relativos ao repositório vizinho):

- [recovery-email-settings.tsx](../../Front-Blog/src/app/conta/recovery-email-settings.tsx), [totp-settings.tsx](../../Front-Blog/src/app/conta/totp-settings.tsx), [session-account.tsx](../../Front-Blog/src/app/conta/session-account.tsx), [configuracoes/page.tsx](../../Front-Blog/src/app/conta/configuracoes/page.tsx).
- [confirmation.tsx](../../Front-Blog/src/app/confirmar-email-recuperacao/confirmation.tsx), [recovery-form.tsx](../../Front-Blog/src/app/recuperar-autenticador/recovery-form.tsx).
- [recover-totp.tsx](../../Front-Blog/src/app/gestao-editorial/(painel)/usuarios/_components/recover-totp.tsx), [detalhes/page.tsx](../../Front-Blog/src/app/gestao-editorial/(painel)/usuarios/[id]/page.tsx), [recuperar-autenticador/route.ts](../../Front-Blog/src/app/gestao-editorial/(painel)/usuarios/[id]/recuperar-autenticador/route.ts).
- [funcao/page.tsx](../../Front-Blog/src/app/gestao-editorial/(painel)/usuarios/[id]/funcao/page.tsx), [role-form.tsx](../../Front-Blog/src/app/gestao-editorial/(painel)/usuarios/[id]/funcao/role-form.tsx).

Frontend, testes:

- [admin-bff-http.test.mjs](../../Front-Blog/tests/admin-bff-http.test.mjs), [recovery-email-docker-browser.test.mjs](../../Front-Blog/tests/recovery-email-docker-browser.test.mjs).

Documentação: este relatório, [TOTP_RECOVERY.md](TOTP_RECOVERY.md) e os backlogs dos dois repositórios.

## 5. Validação executada

| Verificação executada | Resultado |
| --- | --- |
| Backend: `npm.cmd run build` | Passou |
| Backend: `npm.cmd run test` | 341 passaram; 65 opcionais ignorados, em 60 arquivos |
| Backend: `RUN_DB_TESTS=1 npm.cmd run test -- src/modules/auth/recovery-email.integration.spec.ts src/modules/auth/totp-recovery.integration.spec.ts` | 25 passaram no PostgreSQL principal Docker |
| Backend: `npm.cmd run test:e2e -- test/auth.e2e-spec.ts test/totp.e2e-spec.ts` | 24 passaram: login, verificação do principal, cookies, rotação/reuso de refresh token, logout, desafio 2FA e anti-replay |
| Backend: `npm.cmd run lint` | Sem erros; avisos preexistentes |
| Frontend: `npm.cmd run build` | Passou, incluindo TypeScript |
| Frontend: `npm.cmd run test:admin` | 7 passaram, incluindo destinos primary/secondary no BFF, rejeição de destinatário livre e CSRF |
| Frontend: `npm.cmd run test:session` | 26 passaram |
| Frontend: ESLint dos arquivos de código alterados | Passou |
| Frontend: `npm.cmd run lint` completo | Falhou por seis erros preexistentes fora do escopo, descritos abaixo |
| Docker: `docker compose build app` | Passou; imagem local atualizada |
| Frontend: `BLOG_RECOVERY_E2E=1 npm.cmd run test:recovery-browser` | Passou no Chromium/Edge com API Docker real e SMTP local de captura |

A prova de navegador validou ativação disponível sem secundário, confirmação do secundário, ativação do TOTP e exibição de códigos, recuperação pelo secundário, rejeição dos códigos antigos, login com novos códigos, restrições administrativas na interface e API, modal de remoção, remoção mantendo 2FA, bloqueio de administrador legado incompleto mantendo acesso ao próprio perfil, recuperação assistida pelo principal sem secundário, ausência de acesso normal com o grant e revogação de sessões. A API local foi restaurada ao terminar.

Os testes de integração cobrem ainda os quatro estados possíveis dos mecanismos, substituição administrativa preservando o secundário anterior, bloqueio de confirmação de remoção após mudança de cargo, corrida entre promoção e remoção, destinos não verificados, hashes dos tokens, auditoria do destino, expiração, consumo único e conclusão concorrente. Os testes HTTP validam permissões e Swagger.

Os testes de PostgreSQL simulam o envio de e-mail; a prova no navegador usa SMTP local que aceita apenas destinatários sintéticos `example.invalid`. Não houve entrega de mensagens externas. Os 65 testes opcionais ignorados na suíte geral não são apresentados como executados; as integrações e E2E listadas acima foram executadas separadamente. Falhas intermediárias de expectativas antigas e de configuração da prova foram corrigidas; a tabela registra os resultados finais.

## 6. Pendências operacionais e riscos existentes

- Administradores legados incompletos precisam regularizar o secundário/2FA na própria conta antes de voltar a exercer privilégios. Nenhum cargo ou dado real foi alterado para contornar isso. O bootstrap e o comando operacional não foram executados em contas reais.
- A análise de evidências é humana: dados públicos e declaração do solicitante não autorizam recuperação. Sem acesso a qualquer endereço previamente verificado, este fluxo não entrega autorização; é necessário seguir a política operacional de recuperação de identidade. Não foi introduzido destinatário arbitrário nem desativação manual de 2FA.
- Os códigos reserva existentes usam oito caracteres hexadecimais aleatórios (32 bits), armazenados como SHA-256. Hash, consumo único e invalidação foram preservados e testados. A baixa entropia por código é uma limitação preexistente diante de acesso indevido ao banco; ampliar o formato e planejar a compatibilidade de códigos já emitidos é um endurecimento separado, sem alterar silenciosamente os códigos atuais nesta integração.
- O lint completo do frontend tem seis erros preexistentes de `react/no-unescaped-entities` em páginas de diretrizes e privacidade não alteradas. O lint direcionado ao código alterado passa. Avisos preexistentes do backend não impedem o lint.
- Nenhuma implantação externa foi realizada. A imagem/API Docker local foi atualizada para validação; banco, dados existentes e volumes foram preservados.

Procedimento operacional atualizado: [TOTP_RECOVERY.md](TOTP_RECOVERY.md).
