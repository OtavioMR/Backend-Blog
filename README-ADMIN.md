# Administração do Grifório

Este documento descreve o contrato administrativo e as limitações operacionais conhecidas.

Todas as rotas abaixo usam o prefixo `/api/v1` e exigem token JWT Bearer. A role é carregada do banco em cada requisição. As alterações de função e suspensões invalidam as sessões anteriores.

## Permissões e contas

| Função | Acesso |
| --- | --- |
| READER | Uso comum; não acessa as rotas administrativas. |
| AUTHOR | Recursos de autoria; não acessa as rotas administrativas. |
| ADMIN | Operações administrativas existentes e consulta de usuários. Não pode conceder permissões administrativas nem suspender administradores. |
| SUPER_ADMIN | Operações de ADMIN, gestão de contas ADMIN e alteração de função de outras contas. |

| Operação | READER | AUTHOR | ADMIN | SUPER_ADMIN |
| --- | --- | --- | --- | --- |
| Consultar, moderar e suspender contas comuns | Não | Não | Sim | Sim |
| Denunciar conteúdo ou perfil | Sim | Sim | Sim | Sim |
| Revisar denúncias, artigos e comentários | Não | Não | Sim | Sim |
| Criar, editar e mesclar recursos editoriais | Não | Não | Sim | Sim |
| Consultar indicadores e auditoria | Não | Não | Sim | Sim |
| Conceder ou revogar ADMIN/SUPER_ADMIN | Não | Não | Não | Sim, com TOTP |

Nenhum administrador pode alterar a própria role pela rota genérica; a rota administrativa também impede a alteração da própria role. A mudança de função exige conta ativa; ADMIN e SUPER_ADMIN exigem e-mail verificado, e AUTHOR exige o aceite da versão atual das regras. Uma mudança de role invalida as sessões anteriores.

A concessão de função administrativa libera a publicação direta para essa conta, como já ocorre com administradores existentes. Ao retirar a função de AUTHOR, revisões pendentes são encerradas com justificativa e auditoria; a decisão de concessão administrativa mantém esse histórico.

`GET /admin/users` lista contas não excluídas, com `page`, `limit` (máximo 100), `search`, `role`, `status` (`active`, `suspended`, `inactive`), `createdFrom`, `createdTo`, `sort` (`createdAt`, `name`) e `order` (`ASC`, `DESC`). A resposta contém `data` e `meta` com `page`, `limit`, `total`, `totalPages`, `hasNextPage` e `hasPreviousPage`. `GET /admin/users/:id` inclui estado da conta e contagens de publicações e comentários. `GET /admin/users/:id/reports` lista denúncias relacionadas sem expor o denunciante nessa listagem.

`PATCH /admin/users/:id/role` exige SUPER_ADMIN, TOTP ativo e o cabeçalho `X-TOTP-Code` com um código atual não reutilizado. Aceita `{ "role": "ADMIN", "reason": "Responsabilidade aprovada" }`. A operação é auditada e revoga sessões. Não permite alterar a própria função. `POST /admin/users/:id/suspension` e `POST /admin/users/:id/restore` continuam disponíveis para moderar contas comuns. `GET /admin/users/:id/moderation-history` lista eventos de suspensão e permissões.

SUPER_ADMIN também pode suspender ou restaurar contas ADMIN; contas SUPER_ADMIN são protegidas contra suspensão. A suspensão da própria conta não é permitida.

`POST /admin/users/:id/sessions/revoke` recebe `{ "reason": "Revogação de segurança" }` e invalida todos os tokens da conta. ADMIN pode revogar sessões de contas comuns; SUPER_ADMIN também pode revogar sessões administrativas. O evento é auditado e o titular recebe notificação quando outra pessoa realiza a operação.

**Compatibilidade:** `PATCH /users/:id` não aceita mais `role` nem `isActive`, e alterações de perfil e foto agora são restritas ao titular. As alterações de função devem usar a rota administrativa; suspensões e restaurações usam as rotas próprias.

## Primeira conta SUPER_ADMIN

Após aplicar as migrations, um operador com acesso ao ambiente e ao banco deve selecionar uma conta já ativa e com e-mail verificado e executar `npm run admin:bootstrap -- <UUID>`. O comando usa a configuração de banco existente, exige que não exista outra conta SUPER_ADMIN, invalida sessões e registra auditoria. Não existe endpoint público nem credencial fixa para bootstrap. Proteja o acesso ao ambiente e ao banco; a conta precisa autenticar novamente depois da operação.

Ative o TOTP pelo fluxo `/auth/totp/setup` e `/auth/totp/enable` antes de alterar roles. Cada mudança exige um código novo; o mesmo código não pode ser reutilizado após autenticação ou outra operação. Outras operações administrativas ainda não exigem um código adicional.

Exemplo de mudança de função, substituindo os valores pelos do ambiente:

```http
PATCH /api/v1/admin/users/UUID/role
Authorization: Bearer TOKEN
X-TOTP-Code: 123456
Content-Type: application/json

{ "role": "ADMIN", "reason": "Responsabilidade aprovada" }
```

Resposta: `{ "id": "UUID", "role": "ADMIN" }`. São possíveis respostas 400 para dados inválidos, 401 para autenticação ou TOTP inválidos, 403 para acesso negado, 404 para conta inexistente e 409 para conflito de estado ou elegibilidade.

## Denúncias e moderação

`POST /reports` aceita `target` igual a `POST`, `COMMENT` ou `USER`, além de `targetId`, `reason` e, opcionalmente, `reasonCategory` e `description`. As categorias são `SPAM`, `HARASSMENT`, `HATE_SPEECH`, `INAPPROPRIATE`, `COPYRIGHT`, `MISINFORMATION` e `OTHER`. Uma pessoa só pode manter uma denúncia aberta para cada alvo. Denúncias permanecem registradas quando o conteúdo é ocultado ou excluído logicamente.

`GET /reports` filtra por `status`, `target`, `moderatorId`, `from` e `to`; `GET /reports/:id` inclui o contexto do alvo para administradores e `GET /reports/:id/history` apresenta ações auditadas. `PATCH /reports/:id/assign` recebe `{ "moderatorId": "UUID" }` e coloca a denúncia em `IN_REVIEW`. `PATCH /reports/:id` conclui uma denúncia aberta com `{ "status": "RESOLVED", "note": "Conteúdo analisado" }`; a justificativa agora é obrigatória. Os estados finais são `RESOLVED` e `DISMISSED`. Essa decisão não altera automaticamente o conteúdo. Para vincular uma ocultação, `POST /reports/:id/resolve` aceita `status`, `note` e `action` (`NONE`, `HIDE_POST` ou `HIDE_COMMENT`); a decisão, a ação e a auditoria são atômicas.

`GET /admin/comments` aceita paginação, `search`, `authorId`, `postId`, `status`, `from` e `to`. `POST /admin/comments/:id/hide` e `POST /admin/comments/:id/restore` recebem `{ "reason": "Motivo da decisão" }`; somente uma ocultação administrativa pode ser revertida. `GET /admin/posts` e `GET /admin/posts/:id` permitem consultar artigos na moderação, inclusive ocultos. `POST /admin/posts/:id/hide` e `POST /admin/posts/:id/restore` usam o mesmo corpo e preservam o estado de publicação. Esses eventos são auditados e geram notificações.

`GET /post-reviews/:id` permite ao autor consultar a justificativa de rejeição. O primeiro artigo mantém a revisão obrigatória; a rejeição exige justificativa e a aprovação libera o autor para publicação posterior.

Os estados editoriais existentes são `DRAFT`, `PENDING`, `APPROVED` e `REJECTED`. Publicação e ocultação são propriedades separadas: um artigo aprovado pode permanecer publicado e ficar temporariamente inativo por moderação. Rascunhos e revisões pendentes não são públicos. Artigos publicados podem ser editados conforme as regras existentes do autor; a edição não inicia uma nova revisão geral. A revisão pendente impede edição, e o responsável não pode decidir sobre o próprio artigo.

Para concluir uma denúncia com ocultação:

```http
POST /api/v1/reports/UUID/resolve
Authorization: Bearer TOKEN
Content-Type: application/json

{ "status": "RESOLVED", "note": "Violação confirmada", "action": "HIDE_COMMENT" }
```

A resposta tem o formato `{ "id": "UUID", "status": "RESOLVED", "action": "HIDE_COMMENT" }`. `HIDE_COMMENT` exige denúncia de comentário; `HIDE_POST`, denúncia de artigo. Uma denúncia `DISMISSED` aceita somente `NONE`. Para uma transição inválida ou um alvo já indisponível, a operação retorna 409 e não conclui a denúncia.

## Tags e indicadores

`GET /admin/tags` inclui a quantidade de artigos; `POST /admin/tags` e `PATCH /admin/tags/:id` recebem `{ "name": "Tecnologia" }`. `DELETE /admin/tags/:id` só exclui tags sem uso. `POST /admin/tags/:id/merge` recebe `{ "targetId": "UUID" }` e transfere associações sem duplicá-las. As operações são auditadas.

`GET /admin/categories` lista categorias com contagem de uso; a desativação pelo CRUD existente preserva as associações, mas remove a categoria da apresentação pública. `GET /admin/analytics/overview` apresenta totais e contagens de criação para `from` e `to`, quando fornecidos. `GET /admin/analytics/activity` apresenta série diária e atividade recente, usando o fuso da sessão do banco. A série de newsletter conta a primeira criação de cada registro, não reinscrições posteriores. `GET /admin/analytics/newsletter` apresenta apenas contagens agregadas de assinaturas e envios, sem endereços. Cancelamentos históricos não são contabilizados, pois o modelo atual não guarda essa série.

## Pendências

Os fluxos de atribuição e decisão ficam no histórico auditado. A listagem de notificações retorna `reportId` quando uma denúncia é atribuída, sem incluir dados do denunciante. A fila de novas denúncias é consultada por `/reports` e pelo painel; não gera notificação individual para todos os administradores.

Séries mantêm as permissões e a autoria existentes; não foi criado um segundo estado de visibilidade para agrupamentos. O mecanismo de artigos em alta também permanece inalterado, sem destaque manual adicional. Ocultações anteriores à introdução dos campos de moderação não são automaticamente classificadas como reversíveis, para evitar restaurar uma exclusão feita pelo autor.

O histórico de cancelamentos de newsletter não pode ser reconstruído a partir dos dados atuais. TOTP obrigatório foi aplicado à mudança de privilégios; outras ações administrativas não exigem nova verificação. A política operacional de retenção e o monitoramento de entrega de e-mails dependem da infraestrutura de implantação.

## Verificações realizadas

Foram executados os testes automatizados com `npm.cmd run test`, o lint com `npm.cmd run lint` e a checagem TypeScript de produção com `npm.cmd exec tsc -- -p tsconfig.build.json --noEmit`. Os testes de integração administrativos foram executados separadamente com `RUN_DB_TESTS=1`; usam transação revertida para verificar consultas, notificações, auditoria, denúncias e moderação no PostgreSQL. Um teste adicional usa duas conexões e contas de teste temporárias, removidas após verificar rebaixamentos concorrentes. A suíte e2e completa passou com 39 testes em PostgreSQL e Redis temporários e isolados, incluindo decisões editoriais simultâneas; as 51 migrations foram aplicadas nesse banco vazio antes da execução.
