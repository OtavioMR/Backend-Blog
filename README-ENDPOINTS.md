# Endpoints da API

Todos os caminhos abaixo começam com `/api/v1`. Por exemplo: `GET /api/v1/health`. Os trechos com `:` são valores que devem ser substituídos, como o ID de um artigo. Algumas rotas exigem login e outras exigem permissões de autor ou administrador; consulte o [README técnico](README.md) para detalhes e exemplos.

## Saúde

| Método | Caminho | O que faz |
| --- | --- | --- |
| GET | `/health` | Verifica se a API e o banco estão disponíveis. |

## Autenticação

| Método | Caminho | O que faz |
| --- | --- | --- |
| POST | `/auth/login` | Entra na conta. |
| POST | `/auth/refresh` | Renova o token de acesso. |
| POST | `/auth/logout` | Encerra a sessão atual. |
| GET | `/auth/sessions` | Lista as sessões ativas. |
| DELETE | `/auth/sessions/:id` | Revoga uma sessão. |
| POST | `/auth/forgot-password` | Solicita a recuperação de senha. |
| POST | `/auth/reset-password` | Define uma nova senha usando o token de recuperação. |
| GET | `/auth/social/:provider/start` | Inicia o login pelo Google ou GitHub. |
| POST | `/auth/social/:provider/link` | Inicia a vinculação de uma conta social. |
| GET | `/auth/social/:provider/callback` | Recebe o retorno do provedor social. |
| POST | `/auth/social/challenge` | Conclui o desafio de autenticação social. |
| POST | `/auth/totp/setup` | Inicia a configuração da autenticação em duas etapas. |
| POST | `/auth/totp/enable` | Confirma e ativa a autenticação em duas etapas. |
| POST | `/auth/totp/disable` | Desativa a autenticação em duas etapas. |

## Usuários

| Método | Caminho | O que faz |
| --- | --- | --- |
| GET | `/users/author-rules` | Mostra as regras para se tornar autor. |
| POST | `/users/me/author` | Solicita a promoção da própria conta a autor. |
| POST | `/users/confirm-email` | Confirma o endereço de e-mail. |
| POST | `/users/resend-verification` | Reenvia a verificação de e-mail. |
| POST | `/users/confirm-email-change` | Confirma a mudança de e-mail. |
| POST | `/users/:id/profile-photo` | Envia ou substitui a foto de perfil. |
| POST | `/users` | Cria uma conta. |
| GET | `/users` | Lista usuários. |
| GET | `/users/:id` | Consulta um usuário. |
| PATCH | `/users/:id` | Atualiza os dados de um usuário. |
| DELETE | `/users/:id` | Exclui um usuário. |

## Artigos

| Método | Caminho | O que faz |
| --- | --- | --- |
| GET | `/posts` | Lista artigos. |
| GET | `/posts/me` | Lista os próprios artigos. |
| GET | `/posts/trending` | Lista artigos em alta. |
| GET | `/posts/:id` | Consulta um artigo por ID ou slug. |
| GET | `/posts/:id/related` | Lista artigos relacionados. |
| POST | `/posts` | Cria um artigo. |
| PATCH | `/posts/:id` | Edita um artigo. |
| DELETE | `/posts/:id` | Exclui um artigo. |
| POST | `/posts/:id/cover-image` | Envia ou substitui a capa. |
| DELETE | `/posts/:id/cover-image` | Remove a capa. |
| POST | `/posts/:id/views` | Registra uma visualização. |
| GET | `/posts/saved` | Lista os artigos salvos pelo usuário. |
| GET | `/posts/:id/interaction` | Consulta a curtida, o salvamento e o total de curtidas. |
| PUT | `/posts/:id/like` | Curte um artigo. |
| DELETE | `/posts/:id/like` | Remove a curtida. |
| PUT | `/posts/:id/save` | Salva um artigo. |
| DELETE | `/posts/:id/save` | Remove um artigo dos salvos. |

## Revisão e histórico de artigos

| Método | Caminho | O que faz |
| --- | --- | --- |
| POST | `/post-reviews/:id/submit` | Envia o primeiro artigo para revisão. |
| GET | `/post-reviews` | Lista artigos pendentes de revisão. |
| GET | `/post-reviews/:id` | Consulta o resultado e o motivo da revisão, para o autor ou administrador. |
| POST | `/post-reviews/:id/decision` | Aprova ou rejeita um artigo em revisão. |
| GET | `/posts/:postId/revisions` | Lista as revisões de um artigo. |
| GET | `/posts/:postId/revisions/:revisionId` | Consulta uma revisão. |
| POST | `/posts/:postId/revisions/:revisionId/restore` | Restaura uma revisão. |

## Séries

| Método | Caminho | O que faz |
| --- | --- | --- |
| GET | `/series/me` | Lista as próprias séries. |
| GET | `/series/:id/manage` | Consulta uma série para edição, incluindo rascunhos. |
| GET | `/series/:id` | Consulta uma série pública. |
| POST | `/series` | Cria uma série. |
| PATCH | `/series/:id` | Edita uma série. |
| PUT | `/series/:id/items` | Define os artigos e a ordem da série. |
| DELETE | `/series/:id` | Exclui a série, mantendo os artigos. |
| GET | `/posts/:postId/series` | Consulta a série de um artigo público. |

## Autores e feeds

| Método | Caminho | O que faz |
| --- | --- | --- |
| GET | `/authors/:id` | Consulta o perfil público de um autor. |
| GET | `/authors/:id/follow` | Consulta se o usuário segue o autor. |
| PUT | `/authors/:id/follow` | Segue um autor. |
| DELETE | `/authors/:id/follow` | Deixa de seguir um autor. |
| GET | `/feed` | Lista artigos dos autores seguidos. |
| GET | `/feed/rss` | Retorna o feed RSS. |
| GET | `/feed.xml` | Retorna o feed RSS em um endereço alternativo. |
| GET | `/feed/atom` | Retorna o feed Atom. |
| GET | `/sitemap.xml` | Retorna o mapa do site para mecanismos de busca. |

## Coleções

| Método | Caminho | O que faz |
| --- | --- | --- |
| POST | `/collections` | Cria uma coleção de artigos salvos. |
| GET | `/collections` | Lista as próprias coleções. |
| PATCH | `/collections/:id` | Edita uma coleção. |
| DELETE | `/collections/:id` | Exclui uma coleção. |
| GET | `/collections/:id/posts` | Lista os artigos de uma coleção. |
| PUT | `/collections/:id/posts/:postId` | Adiciona um artigo à coleção. |
| DELETE | `/collections/:id/posts/:postId` | Remove um artigo da coleção. |

## Categorias e tags

| Método | Caminho | O que faz |
| --- | --- | --- |
| GET | `/categories` | Lista categorias. |
| GET | `/categories/:idOrSlug` | Consulta uma categoria por ID ou slug. |
| GET | `/categories/:idOrSlug/posts` | Lista artigos de uma categoria. |
| POST | `/categories` | Cria uma categoria. |
| PATCH | `/categories/:id` | Edita uma categoria. |
| DELETE | `/categories/:id` | Exclui uma categoria. |
| GET | `/tags` | Lista tags. |
| GET | `/tags/:slug` | Consulta uma tag pelo slug. |

## Comentários

| Método | Caminho | O que faz |
| --- | --- | --- |
| GET | `/posts/:postId/comments` | Lista os comentários de um artigo. |
| GET | `/posts/:postId/comments/:id/replies` | Lista as respostas de um comentário. |
| POST | `/posts/:postId/comments` | Cria um comentário ou resposta. |
| PATCH | `/comments/:id` | Edita um comentário. |
| DELETE | `/comments/:id` | Desativa um comentário. |
| GET | `/comments/:id/like` | Consulta as curtidas de um comentário. |
| PUT | `/comments/:id/like` | Curte um comentário. |
| DELETE | `/comments/:id/like` | Remove a curtida de um comentário. |

## Notificações e newsletter

| Método | Caminho | O que faz |
| --- | --- | --- |
| GET | `/notifications` | Lista as notificações do usuário. |
| PATCH | `/notifications/read-all` | Marca todas as notificações como lidas. |
| PATCH | `/notifications/:id/read` | Marca uma notificação como lida. |
| POST | `/newsletter/subscribe` | Solicita inscrição na newsletter. |
| GET | `/newsletter/confirm` | Confirma a inscrição pelo link recebido. |
| POST | `/newsletter/confirm` | Confirma a inscrição com um token. |
| GET | `/newsletter/unsubscribe` | Cancela a inscrição pelo link recebido. |
| POST | `/newsletter/unsubscribe` | Cancela a inscrição com um token. |

## Denúncias e administração

| Método | Caminho | O que faz |
| --- | --- | --- |
| POST | `/reports` | Envia uma denúncia. |
| GET | `/reports` | Lista denúncias. |
| GET | `/reports/:id` | Consulta denúncia e contexto do alvo. |
| GET | `/reports/:id/history` | Consulta ações auditadas sobre a denúncia. |
| PATCH | `/reports/:id/assign` | Atribui denúncia a um moderador. |
| POST | `/reports/:id/resolve` | Conclui denúncia e aplica ação vinculada na mesma transação. |
| PATCH | `/reports/:id` | Conclui uma denúncia com justificativa. |
| GET | `/admin/users` | Lista e filtra contas para administração. |
| GET | `/admin/users/:id` | Consulta dados e contagens de uma conta. |
| GET | `/admin/users/:id/moderation-history` | Consulta o histórico de moderação da conta. |
| GET | `/admin/users/:id/reports` | Lista denúncias relacionadas ao perfil e conteúdos do usuário. |
| PATCH | `/admin/users/:id/role` | Altera a role de outra conta, com SUPER_ADMIN e TOTP. |
| POST | `/admin/users/:id/sessions/revoke` | Revoga as sessões de uma conta com justificativa. |
| POST | `/admin/users/:id/suspension` | Suspende um usuário. |
| POST | `/admin/users/:id/restore` | Restaura um usuário suspenso. |
| GET | `/admin/comments` | Lista e filtra comentários para moderação. |
| GET | `/admin/comments/:id` | Consulta comentário e denúncias relacionadas. |
| GET | `/admin/comments/:id/history` | Consulta ações auditadas do comentário. |
| POST | `/admin/comments/:id/hide` | Oculta um comentário com justificativa. |
| POST | `/admin/comments/:id/restore` | Restaura comentário ocultado administrativamente. |
| POST | `/admin/posts/:id/hide` | Oculta artigo publicado com justificativa. |
| POST | `/admin/posts/:id/restore` | Restaura artigo ocultado administrativamente. |
| GET | `/admin/posts` | Lista artigos para moderação. |
| GET | `/admin/posts/:id` | Consulta artigo completo para moderação. |
| GET | `/admin/posts/:id/history` | Consulta ações editoriais auditadas. |
| GET | `/admin/tags` | Lista tags com quantidade de artigos. |
| GET | `/admin/categories` | Lista categorias com quantidade de artigos. |
| POST | `/admin/tags` | Cria uma tag. |
| PATCH | `/admin/tags/:id` | Renomeia uma tag. |
| DELETE | `/admin/tags/:id` | Exclui uma tag sem artigos. |
| POST | `/admin/tags/:id/merge` | Mescla uma tag em outra. |
| GET | `/admin/analytics/overview` | Consulta indicadores da plataforma. |
| GET | `/admin/analytics/newsletter` | Consulta indicadores agregados da newsletter. |
| GET | `/admin/analytics/activity` | Consulta atividade recente e evolução diária. |
| GET | `/admin/audit-logs` | Consulta os registros de auditoria. |
