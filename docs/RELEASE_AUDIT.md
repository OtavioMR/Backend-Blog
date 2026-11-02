# Auditoria da versão 1.0.0

Data: 2 de novembro de 2026. Escopo: 55 issues originais, issue adicional #57, rastreabilidade da #56, código local, testes, migrations, configuração e execução Docker. As issues foram consultadas no GitHub; fechamento e sincronização acompanham esta entrega.

## Resultado e limites

Os requisitos funcionais da v1 estão implementados, com as diferenças técnicas explicitadas abaixo. A aplicação foi compilada e executada em Docker com PostgreSQL e Redis saudáveis; `/api/v1/health` retornou 200 e `/api/docs` retornou 404 em produção. A imagem usa usuário sem privilégios (UID 1000), migrations compiladas e volume persistente para uploads. O upload local existente foi preservado no volume.

Isto valida a entrega do backend e sua operação local. Domínio público, HTTPS e hospedagem externa não foram provisionados. A autenticação SMTP foi verificada com sucesso sem enviar mensagens. OAuth Google/GitHub está implementado e testado com callbacks simulados, mas as credenciais desses provedores não estão configuradas neste ambiente. A chave TOTP já está configurada e não foi substituída.

Foram encontrados dois hashes bcrypt legados de custo 10. Eles foram preservados para manter o acesso às contas; após login válido, o hash é atualizado atomicamente para custo 12, sem sobrescrever uma alteração concorrente de senha. Senhas novas e alteradas usam custo 12. O trabalho bcrypt das contas atuais, antigas de custo 10 e inexistentes foi equilibrado. Não é possível reprocessar uma senha existente sem conhecê-la; apagar senhas ou obrigar reset não foi necessário para esta entrega.

## Evidências de validação

- Suíte completa com `RUN_DB_TESTS=1`, `RUN_REDIS_TESTS=1` e `--no-file-parallelism`: **213 testes aprovados em 40 arquivos**, incluindo PostgreSQL e Redis reais.
- Suíte e2e completa: **37 testes aprovados em 8 arquivos**, cobrindo requisições HTTP, autorização, autenticação, cookies, uploads, moderação, TOTP, OAuth simulado, séries, revisões, cache, comentários, notificações e newsletter.
- Lint: aprovado sem erros ou avisos. TypeScript da aplicação: aprovado com `--noEmit`.
- Auditoria npm de dependências de produção: **zero vulnerabilidades reportadas** na consulta realizada.
- **43 migrations** aplicadas no banco configurado. A sequência completa também foi executada com sucesso em um banco vazio temporário, removido após o teste.
- Docker: build com Node 24, execução em produção, health checks, persistência de PostgreSQL/Redis/uploads e parada controlada. Foi criada uma cópia de segurança do PostgreSQL antes da substituição do container, fora do repositório.
- A consulta seletiva de busca foi verificada com `EXPLAIN (ANALYZE, FORMAT JSON)` em uma massa transacional de 5 mil artigos: `Bitmap Index Scan` nos índices GIN de full-text e trigramas, sem `Seq Scan` nesse cenário. Os dados de teste foram revertidos.
- A listagem pública de comentários foi verificada por HTTP com **duas consultas SQL**, incluindo a verificação de disponibilidade do artigo. O cache público foi verificado por HTTP com **zero consultas SQL nos hits**.
- A paginação por cursor foi percorrida por cinco páginas sem duplicação nem omissão; há cenários adicionais preservando microssegundos do PostgreSQL.
- A outbox cifrada foi testada com falha ao inserir no Redis: a mensagem permanece no banco e é processada após recuperação. Retentativas SMTP, descarte de mensagens expiradas e isolamento de filas de teste também foram verificados.

Os benchmarks locais registram médias, não SLAs universais. A massa de dados, o hardware e a carga influenciam os tempos. Os resultados reproduzíveis são emitidos pelo teste [sprint6.e2e-spec.ts](../test/sprint6.e2e-spec.ts); `RELEASE_METRICS_PATH` permite salvar o resultado em JSON. O pipeline [ci.yml](../.github/workflows/ci.yml) repete lint, migrations, testes, auditoria de dependências e build Docker em serviços novos.

| Medição local | Média |
|---|---:|
| Login inválido, conta existente (20 amostras) | 250,49 ms |
| Login inválido, conta inexistente (20 amostras) | 249,03 ms |
| Recuperação, conta existente (20 amostras no serviço) | 41,48 ms |
| Recuperação, conta inexistente (20 amostras no serviço) | 47,16 ms |
| Recuperação via HTTP (4 amostras alternadas) | 46,66 ms |
| Agregação administrativa (20 amostras) | 2,88 ms |
| Hit de cache via HTTP (20 amostras) | 3,24 ms |

## Rastreabilidade por issue

“Implementado” significa comportamento conferido no código e nas suítes indicadas; não significa que integrações externas opcionais tenham credenciais provisionadas ou que todos os limites de performance sejam garantidos em qualquer ambiente.

| Issue | Resultado conferido | Evidência principal |
|---|---|---|
| #1 | Criação restrita a AUTHOR/ADMIN | `posts.controller.spec.ts`, `sprint1.e2e-spec.ts` |
| #2 | Perfis públicos sem e-mail; listagem administrativa paginada | `users.http.spec.ts`, `users.service.spec.ts` |
| #3 | Escape de HTML no nome em e-mails | `mail.service.spec.ts`, `escape-html.spec.ts` |
| #4 | Rejeição de configuração obrigatória inválida | `env.validation.spec.ts` |
| #5 | Helmet, CORS e confiança em um proxy | `http-security.ts` e testes de segurança HTTP |
| #6 | Swagger ausente em produção | `swagger.spec.ts` e HTTP 404 no container |
| #7 | Senha atual, confirmação de e-mail e invalidação de tokens | `users.service.spec.ts`, `auth.e2e-spec.ts` |
| #8 | Comparação bcrypt para usuário inexistente; recuperação com trabalho SQL uniforme e piso de latência | `auth.service.spec.ts`, benchmark e2e alternado de 20 amostras |
| #9 | Custo 12, limite de 72 bytes e atualização progressiva dos dois hashes legados | `auth.service.spec.ts`, `sprint2.e2e-spec.ts`; limite de migração descrito acima |
| #10 | Primeiro bloqueio de 15 minutos após cinco falhas, com progressão | `sprint2.e2e-spec.ts` |
| #11 | Limites de 100 caracteres e escape de buscas | Testes de DTO e `sprint1.e2e-spec.ts` |
| #12 | Sanitização de artigos e comentários | `sanitize-content.spec.ts`, e2e de artigos/comentários |
| #13 | Conversão WebP, remoção de imagem anterior e rejeição de imagem inválida | `comments.e2e-spec.ts` e utilitário de limpeza |
| #14 | Sessões independentes, rotação atômica e revogação da sessão cujo refresh foi reutilizado | `auth.service.spec.ts`, `auth.e2e-spec.ts` |
| #15 | Sexto comentário em um minuto rejeitado; limites de reações e tags | `rate-limit.spec.ts` |
| #16 | Filtros combinados por AND | `posts.service.spec.ts`, `sprint1.e2e-spec.ts` |
| #17 | Autor consulta seus rascunhos; terceiros recebem 404 | `posts.service.spec.ts`, e2e |
| #18 | Publicação com data real e rascunho com data nula | `sprint2.e2e-spec.ts`, testes de ordenação |
| #19 | Resumos sem conteúdo; detalhe com conteúdo completo | `posts.service.spec.ts`, `sprint2.e2e-spec.ts` |
| #20 | Duas consultas por listagem de comentários, com prévia de respostas | `comment-list.query.ts`, `sprint6.e2e-spec.ts` |
| #21 | Vetor armazenado, pesos no título, ranking, acentos, trechos e índices GIN | `OptimizePublicSearch` e `engagement.integration.spec.ts` com EXPLAIN |
| #22 | Remoção/moderação continuam permitidas com comentários desativados | `comments.service.spec.ts` |
| #23 | Salvos incluem autor, categorias e tags | `engagement.integration.spec.ts` |
| #24 | Listagens paginadas usam `{ data, meta }`, incluindo auditoria e denúncias | `pagination.ts`, `post-review.e2e-spec.ts` |
| #25 | Acentos e curingas literais em categorias/tags | `categories.service.spec.ts`, `tags.service.spec.ts` |
| #26 | Serialização central e exclusão de credenciais | `users.http.spec.ts`, `swagger.spec.ts` e e2e |
| #27 | Spans e erros com exportação OTLP configurável | `TracingInterceptor`, bootstrap do SDK; coletor externo não configurado |
| #28 | Health do banco e fechamento controlado | `sprint2.e2e-spec.ts`, Docker saudável e parada controlada |
| #29 | Resposta desacoplada de SMTP; outbox cifrada, BullMQ e retentativas | `mail-outbox.integration.spec.ts`, `mail-queue.integration.spec.ts` |
| #30 | Slugs estáveis, duplicatas e compatibilidade com UUID | Testes de slugs e `sprint2.e2e-spec.ts` |
| #31 | Capa reprocessada e autorização do autor | `sprint2.e2e-spec.ts` |
| #32 | Agendamento via `scheduledAt`, invisibilidade e publicação pelo cron | `sprint2.e2e-spec.ts`, `engagement.integration.spec.ts` |
| #33 | Tempo de leitura calculado em resumos e detalhes | `posts.service.spec.ts`, `sprint2.e2e-spec.ts` |
| #34 | RSS/Atom, alias `feed.xml` e sitemap de artigos públicos | `feed.service.spec.ts`, `sprint2.e2e-spec.ts` |
| #35 | Série ordenada; anterior/próximo e total no detalhe público | Integração e `sprint6.e2e-spec.ts` com três partes |
| #36 | Revisões automáticas, autorização e restauração | Integração e `sprint6.e2e-spec.ts` |
| #37 | Views deduplicadas e ranking de sete dias UTC | `engagement.integration.spec.ts` |
| #38 | Até quatro relacionados por tags/categorias; exclusão do próprio artigo | `discovery.spec.ts`, `sprint2.e2e-spec.ts` |
| #39 | Perfil público, bio e links sem credenciais | `discovery.spec.ts`, `sprint2.e2e-spec.ts` |
| #40 | Follow idempotente e feed dos autores seguidos | Integração e `sprint6.e2e-spec.ts` |
| #41 | Curtidas idempotentes em comentários ativos | `engagement.integration.spec.ts` |
| #42 | Coleções privadas e artigo em múltiplas coleções | `engagement.integration.spec.ts` |
| #43 | Notificações ao destinatário, sem auto-notificação; leitura | Integração e `sprint6.e2e-spec.ts` |
| #44 | Double opt-in e links clicáveis de confirmação/cancelamento | `mail.service.spec.ts`, `sprint6.e2e-spec.ts` |
| #45 | E-mail não verificado bloqueia autenticação e ações protegidas | `sprint2.e2e-spec.ts`, `auth.e2e-spec.ts` |
| #46 | Denúncias e análise restrita a ADMIN | `reports.service.spec.ts`, `post-review.e2e-spec.ts` |
| #47 | Promoção automática com aceite; autorização atualizada em sessão existente | `post-review.e2e-spec.ts` |
| #48 | Métricas restritas ao administrador e agregações | `post-review.e2e-spec.ts`, benchmark de `AnalyticsService` |
| #49 | Auditoria de alterações críticas; sem endpoints de alteração/exclusão | `post-review.e2e-spec.ts`, controllers administrativos |
| #50 | Suspensão revoga acesso, informa motivo após validar senha e permite restauração | `post-review.e2e-spec.ts`, `ModerationService` e cron de expiração |
| #51 | Google/GitHub com PKCE, state, vínculo explícito e desafio TOTP | `social-auth.e2e-spec.ts`; credenciais reais pendentes de configuração |
| #52 | TOTP criptografado, código obrigatório e rejeição de reutilização | `totp.e2e-spec.ts` e testes de TOTP |
| #53 | Lista e revogação seletiva de dispositivos | `auth.e2e-spec.ts` |
| #54 | Cache Redis compartilhado, zero SQL em hit e invalidação antes da resposta | `public-cache.integration.spec.ts`, `sprint6.e2e-spec.ts` |
| #55 | Keyset com índices compostos, microssegundos e cinco páginas contínuas | `engagement.integration.spec.ts`, testes de cursor |
| #57 | Primeiro artigo exige revisão; autorização e publicação após aprovação | `post-review.e2e-spec.ts` |

## Decisões e diferenças registradas

1. **Senhas antigas (#9):** migração progressiva, preservando credenciais, conforme explicado acima.
2. **Agendamento (#32):** `scheduledAt` representa a data futura. `publishedAt` continua representando a publicação efetiva; usar um único campo para ambos confundiria rascunhos e artigos publicados.
3. **Cursor (#55):** a complexidade de uma consulta por índice B-Tree é O(log N + k), não O(1) matemático. Não há OFFSET crescente na paginação por cursor. Filtros podem acrescentar trabalho conforme sua seletividade.
4. **Busca (#21):** paginação numérica ordena por relevância; o cursor mantém ordem cronológica estável. O PostgreSQL escolhe o plano conforme a seletividade; termos muito curtos ou muito comuns podem legitimamente resultar em varredura sequencial.
5. **Cache (#54):** escritas HTTP e agendadores da aplicação invalidam o Redis. Alterações SQL manuais exigem reiniciar a API ou aguardar o TTL de 60 segundos. A recuperação de conexão do Redis invalida entradas anteriores.
6. **Limites externos:** OAuth requer credenciais dos provedores; observabilidade exportada requer endpoint OTLP; hospedagem pública requer domínio/proxy/HTTPS. Essas configurações não foram substituídas por valores fictícios de produção.

## Operação

Use os comandos e variáveis documentados no [README](../README.md). PostgreSQL e Redis ficam publicados apenas em loopback; o backend confia em um único proxy reverso. Preserve os volumes e os segredos existentes. A API, o worker e os agendadores executam no mesmo serviço; devem permanecer ativos para encaminhar mensagens da outbox, processar a fila e publicar artigos agendados.

Tokens, credenciais reais, backups e arquivos `.env` não integram o commit. As mudanças permanecem rastreáveis no Git e nas issues do repositório.
