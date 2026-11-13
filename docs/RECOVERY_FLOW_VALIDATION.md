# Recuperação de acesso: implementação e validação real

Data: 11/11/2026. Alterações locais no backend e no frontend. Sem commits, push ou implantação externa.

## Comportamento entregue

- Cadastro, troca e remoção de secundário têm páginas próprias. O resumo não contém campos de senha nem os formulários das outras ações.
- A remoção exige sessão do titular, senha e TOTP atual quando ativo. A confirmação chega ao principal verificado; o secundário recebe aviso/cancelamento. Não é necessário manter acesso ao secundário para removê-lo.
- Solicitar não significa remover: a interface exibe destino, validade e "Remoção aguardando confirmação". Até confirmar, o endereço atual permanece cadastrado. Cancelar preserva esse endereço e invalida o link pendente.
- A API distingue cadastro, troca e remoção pendentes. Expiração e mudança de credenciais deixam de aparecer como solicitações válidas. O cancelamento também pode ser feito pelo titular autenticado.
- No pedido público de recuperação, credenciais inválidas retornam o mesmo erro 401 para conta inexistente, não verificada ou bloqueada. Falhas são persistidas. Só após senha válida são apresentados os estados `sent`, `cooldown`, `assisted_required` e `not_enabled`.
- Depois de remover o secundário, não há novo envio de recuperação automática. A tela informa explicitamente que nenhum e-mail foi enviado e oferece código reserva e atendimento.
- Redefinir senha continua usando o principal e preservando o TOTP. Recuperar TOTP pelo principal continua exigindo autorização assistida; remover o secundário não concede essa autorização.
- A atualização em segundo plano ao voltar à aba não desabilita o botão que o titular está tentando clicar. As expressões HTML de validação dos códigos reserva foram corrigidas na entrada comum e administrativa.

Os campos existentes foram reaproveitados: nenhuma migration, biblioteca ou alteração de schema foi necessária. Os contratos alterados e o novo `POST /auth/recovery-email/cancel-pending` estão documentados no Swagger. Guia: [TOTP_RECOVERY.md](TOTP_RECOVERY.md).

## Percurso manual no navegador

Este percurso foi executado interativamente pelo navegador integrado, preenchendo campos, navegando pelas telas e abrindo os links recebidos. Não foi substituído por chamadas diretas aos serviços nem por uma suíte de testes.

Ambiente: frontend real em `localhost:5173`, imagem atualizada da API na porta 3000 e PostgreSQL/Redis existentes do projeto Docker `backend-blog`. A caixa SMTP local aceitou somente destinatários sintéticos `example.invalid`. O usuário foi criado pela tela de cadastro; o banco não foi usado para simular confirmação, ativação ou remoção nesse percurso.

| Ação executada pela interface | Resultado observado |
| --- | --- |
| Criar conta e confirmar o código recebido no principal | Conta confirmada; entrada disponível |
| Cadastrar secundário com senha incorreta | Erro apresentado; nenhum cadastro confirmado |
| Cadastrar secundário com senha correta | Destino e confirmação pendente apresentados |
| Cancelar o cadastro e tentar usar seu link anterior | Cancelamento preservado; link recusado |
| Solicitar novamente e confirmar o secundário | Endereço aparece como confirmado |
| Trocar secundário | Antigo continua válido enquanto aguarda; novo passa a valer após confirmação |
| Ativar autenticador com a chave exibida na interface | Oito códigos reserva apresentados |
| Pedir recuperação pelo secundário e repetir o pedido | Link somente no secundário novo; principal recebe aviso; repetição informa horário sem reenviar |
| Abrir o link, configurar novo autenticador e informar código incorreto | Operação recusada; configuração permanece disponível para correção |
| Confirmar o novo código correto | Autenticador substituído; oito novos códigos apresentados |
| Entrar com um código reserva anterior | Recusado |
| Entrar com um código reserva novo | Entrada concluída |
| Solicitar remoção com senha e TOTP atual | Link de remoção recebido no principal; tela informa que o secundário ainda está cadastrado |
| Cancelar remoção e tentar seu link | Endereço preservado; link recusado |
| Solicitar novamente e confirmar a remoção no principal | Secundário passa a "Não cadastrado"; TOTP mantido |
| Pedir recuperação de autenticador após a remoção | `assisted_required`; mensagem "Nenhum e-mail foi enviado"; nenhum novo link na caixa local |
| Pedir redefinição de senha | Link recebido somente no principal |
| Redefinir senha e entrar com a nova senha | Desafio 2FA mantido; entrada concluída usando código reserva novo |
| Consultar a segurança da conta e sair | Autenticador ainda ativo; saída confirmada |

A caixa capturou 24 mensagens sintéticas, rejeitou zero destinatários e registrou exatamente um envio de link de recuperação de autenticador, anterior à remoção e destinado ao secundário novo. O link de senha foi destinado ao principal. Foram inspecionadas capturas de tela em largura ampla e estreita, verificando quebra de endereços e disposição dos botões.

Durante o percurso foram encontrados e corrigidos o bloqueio de clique pela atualização ao voltar à aba e o erro de expressão regular do campo de código reserva. A conta sintética manual e seus registros de auditoria foram removidos ao terminar. A saída da sessão foi feita pela interface.

## Regressões complementares

| Verificação executada | Resultado |
| --- | --- |
| Backend: `npm.cmd run test` | 342 passaram; 68 condicionais ignorados |
| Backend: `RUN_DB_TESTS=1 npm.cmd run test -- src/modules/auth/recovery-email.integration.spec.ts src/modules/auth/totp-recovery.integration.spec.ts src/modules/auth/totp-recovery.controller.spec.ts src/docs/swagger.spec.ts` | 38 passaram no PostgreSQL principal, incluindo contratos/Swagger |
| Backend: `npm.cmd run test:e2e -- test/auth.e2e-spec.ts test/totp.e2e-spec.ts` | 24 passaram |
| Backend: `npm.cmd run lint` | Sem erros; avisos existentes |
| Docker: `docker compose build app` | Build NestJS e imagem aprovados |
| Frontend: `npm.cmd run build` | Passou; novas páginas incluídas |
| Frontend: `npx.cmd tsc --noEmit` | Passou |
| Frontend: ESLint dos arquivos de código alterados | Sem erros; aviso existente na navegação administrativa |
| Frontend: `npm.cmd run test:session` | 26 passaram |
| Frontend: `npm.cmd run test:admin` | 7 passaram |
| Frontend: `BLOG_RECOVERY_E2E=1 npm.cmd run test:recovery-browser` | Passou com Chromium/Edge real, API Docker e SMTP de captura |

A regressão de navegador complementar percorreu cadastro/confirmação de secundário, ativação e recuperação de TOTP, exibição de novos códigos, entrada, restrições de administrador, remoção mantendo 2FA e recuperação assistida pelo principal sem secundário. As contas administrativas são fixtures sintéticas; não foram concedidos privilégios a contas reais. Essa regressão automatizada é separada do percurso manual descrito acima.

O lint completo do frontend continua falhando com seis erros preexistentes de `react/no-unescaped-entities` nas páginas de diretrizes, diretrizes de IA e privacidade. Essas páginas não foram alteradas. Os testes condicionais ignorados na suíte geral não são apresentados como executados.

## Estado final e limites

A API normal foi restaurada com a imagem atualizada e sua configuração original de SMTP, sem captura temporária. API, PostgreSQL e Redis terminaram saudáveis; outbox e entregas de newsletter pendentes estavam zeradas. Volumes e dados reais foram preservados. A caixa SMTP temporária foi encerrada; não houve envio de teste para e-mails externos.

A validação exercitou entrega SMTP local, não a entrega final por provedores externos nem seus filtros de spam. O atendimento assistido continua usando o canal de suporte existente e exige verificação humana de titularidade. Esta mudança não cria recuperação automática ao informar apenas o e-mail principal.

Referência de segurança usada na revisão: [OWASP — recuperação e troca de fatores de autenticação](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html#resetting-mfa).
