## 📋 Backlog Geral e Rastreabilidade — Backend Blog

**Recuperação de acesso revisada e validada no navegador (11/11/2026):** remoção de secundário confirmada no principal, estado pendente explícito, cancelamento autenticado e resposta de elegibilidade somente após senha válida. Cadastro/troca/remoção têm páginas próprias no frontend. Percurso manual completo com cadastro real pela interface, SMTP sintético, troca de autenticador, códigos antigos recusados, remoção, ausência de novo envio e redefinição de senha preservando 2FA. Passaram 38 verificações direcionadas, 342 testes gerais (68 condicionais ignorados), 24 E2E de autenticação, build Docker/NestJS, build/TypeScript do front, 26 testes de sessão, 7 administrativos e regressão Chromium real. Lint direcionado sem erros; lint completo do frontend mantém seis erros preexistentes. Conta sintética removida e API normal restaurada. Evidências e limites: [RECOVERY_FLOW_VALIDATION.md](docs/RECOVERY_FLOW_VALIDATION.md).

**Integração de regras de 2FA e recuperação (11/11/2026):** READER/AUTHOR passam a configurar 2FA e secundário de forma independente; ADMIN/SUPER_ADMIN devem manter ambas as proteções e principal verificado, com validação na promoção, bootstrap e autorização efetiva. Remoção administrativa bloqueada sob lock; substituição mantém o secundário anterior até confirmar. Recuperação assistida permite selecionar principal preferencial ou secundário previamente verificado; autoatendimento continua somente pelo secundário. Reutilizados serviços, endpoints, entidades, grants, auditoria e outbox existentes; sem migrations ou dependências novas. Passaram build, 341 testes da suíte geral (65 opcionais ignorados), 25 integrações PostgreSQL, 24 E2E de autenticação/TOTP, lint sem erros e prova Chromium/API Docker/SMTP local sem entrega externa. Relatório, arquivos alterados, riscos e limites: [2FA_RECOVERY_REVIEW.md](docs/2FA_RECOVERY_REVIEW.md). Procedimento: [TOTP_RECOVERY.md](docs/TOTP_RECOVERY.md). Registros abaixo preservam o histórico anterior, cujas regras foram substituídas por esta integração.

**E-mail separado de recuperação obrigatório para 2FA (08/11/2026):** cadastro com senha e TOTP atual quando ativo; confirmação de uso único, endereço distinto, aviso/cancelamento no principal e no anterior, carência de 24h do novo endereço e invalidação de autorizações antigas. Setup e ativação exigem e-mail confirmado. READER/AUTHOR/ADMIN solicitam recuperação com senha; o link vai somente ao endereço de recuperação, e o principal recebe apenas aviso/cancelamento. SUPER_ADMIN permanece exclusivo pelo servidor. Migration `1797700000000` aplicada e imagem Docker atualizada. Validação: suíte padrão com 258 testes aprovados e 50 condicionais ignorados; 12 integrações direcionadas no PostgreSQL e 27 E2E de autenticação/TOTP/social/RBAC aprovados; lint sem erros (avisos preexistentes) e build aprovado. Prova Chromium + API Docker + SMTP local de captura passou sem entrega externa, preservando banco/volumes e removendo contas sintéticas. Consulte [TOTP_RECOVERY.md](docs/TOTP_RECOVERY.md).

**Recuperação segura de autenticador (08/11/2026):** implementadas autorização assistida por SUPER_ADMIN para outras contas e autorização emergencial pelo servidor para contas administrativas. O titular precisa da autorização recebida no e-mail já verificado, senha atual e código do novo autenticador; o fator existente é mantido até a confirmação. Espera de 24h para contas administrativas, uso único, expiração, dez tentativas persistidas, cancelamento, auditoria, outbox cifrada e revogação de sessões/códigos antigos. Migration `1797600000000` aplicada no banco local e API Docker reconstruída. Suíte completa: 254 testes aprovados, 44 condicionais ignorados; integração direcionada com PostgreSQL: seis testes aprovados; lint sem erros e build aprovado. O envio SMTP real desse fluxo não foi exercitado. Implantação e atendimento em produção seguem [TOTP_RECOVERY.md](docs/TOTP_RECOVERY.md).

Este documento consolida e rastreia todos os **55 itens acionáveis** originados do relatório técnico `analise_blog.md`, categorizados em 6 Milestones e divididos por prioridades, estimativas de esforço e status de execução.

Status da versão 1.0.0: **55 itens originais implementados e validados no escopo da v1**, além da issue #57. A auditoria, evidências por issue e dependências de operação estão em [RELEASE_AUDIT.md](docs/RELEASE_AUDIT.md). Hashes legados são atualizados no próximo login válido; OAuth real requer credenciais dos provedores.

**Decisão de produto — comunidade e autoria:** visitantes leem artigos públicos; contas começam como `READER`. Após verificar o e-mail (#45) e aceitar as regras de publicação, o leitor pode solicitar promoção automática a `AUTHOR`. O primeiro artigo requer aprovação administrativa; depois, novos artigos e edições são publicados imediatamente. Administradores podem revogar a autoria ou suspender a conta e decidir quais artigos publicados ocultar. A moderação posterior deve tratar abusos, inclusive alterações feitas após a aprovação.

**Planejamento:** a #47 registra a promoção automática e a #57 a revisão do primeiro artigo. Alinhar revogação, suspensão e auditoria com #49 e #50. A #17 trata do acesso a rascunhos próprios. Essas decisões não alteram a ordem das sprints.

**Item adicional:** [#57 — Aprovar o primeiro artigo de cada autor](https://github.com/OtavioMR/Backend-Blog/issues/57), P2, concluído na Sprint 5. Esta issue foi criada após os 55 itens originais do relatório.

---

### 🗺️ Visão Geral dos Milestones

| Milestone | Escopo Principal | Foco / Entrega |
|---|---|---|
| **[Milestone 1](https://github.com/OtavioMR/Backend-Blog/milestone/1)** | Correções Críticas & Segurança Imediata (P0) | Fechamento de brechas de acesso, vazamento de PII e bugs de busca |
| **[Milestone 2](https://github.com/OtavioMR/Backend-Blog/milestone/2)** | Robustez, Qualidade & Dados (P1) | Sanitização, consistência criptográfica, observabilidade e performance N+1 |
| **[Milestone 3](https://github.com/OtavioMR/Backend-Blog/milestone/3)** | SEO, Conteúdo & Autoria (P2) | Slugs amigáveis, imagens de capa, tempo de leitura e perfil de autor |
| **[Milestone 4](https://github.com/OtavioMR/Backend-Blog/milestone/4)** | Engajamento & Comunidade (P2/P3) | Reações em comentários, notificações in-app, feeds e newsletter |
| **[Milestone 5](https://github.com/OtavioMR/Backend-Blog/milestone/5)** | Moderação, Admin & Autenticação Avançada (P2/P3) | Painel admin, denúncias, múltiplos dispositivos (sessões), 2FA e OAuth2 |
| **[Milestone 6](https://github.com/OtavioMR/Backend-Blog/milestone/6)** | Performance & Infraestrutura Avançada (P3) | Cache distribuído com Redis, filas com BullMQ e busca Full-Text nativa |

---

### 📌 Matriz de Rastreabilidade (analise_blog.md ➔ GitHub Issues)

#### 🔒 1. Segurança (S1 a S15)
| Código | Issue | Título | Prioridade | Esforço | Status |
|---|---|---|---|---|---|
| **S1** | #1 | [Segurança] Restringir criação de posts para perfis AUTHOR e ADMIN | P0 — Crítica | XS | 🟢 Concluído |
| **S2** | #2 | [Segurança] Mitigar vazamento de dados sensíveis e e-mails em endpoints de usuários | P0 — Crítica | S | 🟢 Concluído |
| **S3** | #3 | [Segurança] Sanitizar interpolação de HTML em templates de e-mail de recuperação | P0 — Crítica | XS | 🟢 Concluído |
| **S4** | #4 | [Segurança] Implementar validação estrita de variáveis de ambiente com schema | P0 — Crítica | S | 🟢 Concluído |
| **S5** | #5 | [Segurança] Configurar Helmet, CORS com whitelist e Trust Proxy | P0 — Crítica | S | 🟢 Concluído |
| **S6** | #6 | [Segurança] Restringir ou desativar interface do Swagger em ambiente de produção | P1 — Alta | XS | ?? Concluído |
| **S7** | #7 | [Segurança] Exigir senha atual para alteração de credenciais e confirmar novo e-mail | P0 — Crítica | M | 🟢 Concluído |
| **S8** | #8 | [Segurança] Mitigar ataques de temporização (Timing Attacks) na autenticação | P1 — Alta | S | 🟢 Concluído |
| **S9** | #9 | [Segurança] Padronizar custo e limites de hashing de senhas com bcrypt | P1 — Alta | S | 🟢 Concluído |
| **S10** | #10 | [Segurança] Implementar bloqueio progressivo por tentativas falhas de login | P1 — Alta | M | 🟢 Concluído |
| **S11** | #11 | [Segurança] Definir limites de tamanho (MaxLength) e sanitização em parâmetros de busca | P1 — Alta | XS | 🟢 Concluído |
| **S12** | #12 | [Segurança] Sanitizar payloads de conteúdo de posts e comentários contra XSS | P1 — Alta | S | 🟢 Concluído |
| **S13** | #13 | [Segurança] Processamento seguro de upload de fotos de perfil com Sharp e limpeza de órfãos | P1 — Alta | M | 🟢 Concluído |
| **S14** | #14 | [Segurança/Épico] Modelagem de tabela de sessões ativas com rotação de refresh token por dispositivo | P2 — Média | L | Concluído |
| **S15** | #15 | [Segurança] Rate limiting granular para criação de comentários, reações e tags | P2 — Média | S | 🟢 Concluído |

#### 🛠️ 2. Melhorias e Bugs (M1 a M14)
| Código | Issue | Título | Prioridade | Esforço | Status |
|---|---|---|---|---|---|
| **M1** | #16 | [Bug] Corrigir operador lógico na consulta filtrada de artigos (trocar OR por AND) | P0 — Crítica | XS | 🟢 Concluído |
| **M2** | #17 | [Melhoria] Permitir que autores visualizem e gerenciem seus próprios rascunhos (GET /posts/me) | P0 — Crítica | S | 🟢 Concluído |
| **M3** | #18 | [Melhoria] Adicionar campo publishedAt e ordenar artigos pela data real de publicação | P1 — Alta | S | 🟢 Concluído |
| **M4** | #19 | [Melhoria] Otimizar listagem de artigos com resumo (excerpt) e exclusão de payload pesado | P1 — Alta | S | 🟢 Concluído |
| **M5** | #20 | [Performance] Eliminar problema de query N+1 na listagem de comentários e respostas | P1 — Alta | M | 🟢 Concluído |
| **M6** | #21 | [Melhoria] Implementar busca textual Full-Text nativa com PostgreSQL (tsvector e GIN) | P2 — Média | M | Concluído |
| **M7** | #22 | [Bug] Permitir moderação e remoção de comentários mesmo com comentários desativados no post | P1 — Alta | XS | ?? Concluído |
| **M8** | #23 | [Melhoria] Enriquecer resposta de artigos salvos com autor, categorias e tags | P2 — Média | XS | 🟢 Concluído |
| **M9** | #24 | [Refatoração] Padronizar estrutura de metadados de paginação com utilitário compartilhado | P2 — Média | S | 🟢 Concluído |
| **M10** | #25 | [Melhoria] Padronizar busca de categorias e tags com escape e unaccent | P2 — Média | XS | 🟢 Concluído |
| **M11** | #26 | [Refatoração] Centralizar serialização de DTOs com ClassSerializerInterceptor e @Exclude | P2 — Média | M | 🟢 Concluído |
| **M12** | #27 | [Melhoria] Ativar e configurar módulo de monitoramento e tracing (NestJS Observe / OpenTelemetry) | P1 — Alta | XS | 🟢 Concluído |
| **M13** | #28 | [Infraestrutura] Implementar health check com Terminus, shutdown hooks e filtro global de exceções | P2 — Média | S | 🟢 Concluído |
| **M14** | #29 | [Infraestrutura] Implementar processamento assíncrono de e-mails em fila com BullMQ e Redis | P2 — Média | M | Concluído localmente |

#### ✨ 3. Novas Funcionalidades (F1 a F26)
| Código | Issue | Título | Prioridade | Esforço | Status |
|---|---|---|---|---|---|
| **F1** | #30 | [Feature] Suporte a Slugs amigáveis nas URLs de artigos (GET /posts/:slug) | P1 — Alta | S | Concluído |
| **F2** | #31 | [Feature] Upload e gerenciamento de Imagem de Capa para artigos (coverImage) | P2 — Média | M | Concluído |
| **F3** | #32 | [Feature] Agendamento de publicação automática de posts com @nestjs/schedule | P2 — Média | M | Concluído |
| **F4** | #33 | [Feature] Cálculo e exibição automática do tempo estimado de leitura (readingTimeMinutes) | P2 — Média | XS | Concluído |
| **F5** | #34 | [Feature] Geração dinâmica de Feeds RSS/Atom e Sitemap XML | P2 — Média | S | Concluído |
| **F6** | #35 | [Feature] Agrupamento de artigos em séries sequenciais | P3 — Baixa | M | Concluído |
| **F7** | #36 | [Feature] Histórico de revisões e versionamento de artigos (post_revisions) | P3 — Baixa | M | Concluído |
| **F8** | #37 | [Feature] Contador de visualizações com deduplicação e endpoint de artigos em alta | P2 — Média | M | 🟢 Concluído |
| **F9** | #38 | [Feature] Recomendação de artigos relacionados por similaridade de tags e categorias | P2 — Média | S | Concluído |
| **F10** | #39 | [Feature] Perfil público do autor com bio, links sociais e contagem de publicações | P2 — Média | S | Concluído |
| **F11** | #40 | [Feature] Sistema de seguir autores e feed personalizado (GET /feed) | P2 — Média | M | 🟢 Concluído |
| **F12** | #41 | [Feature] Sistema de reações e curtidas em comentários | P2 — Média | S | 🟢 Concluído |
| **F13** | #42 | [Feature] Organização de artigos salvos em coleções/pastas personalizadas | P3 — Baixa | M | 🟢 Concluído |
| **F14** | #43 | [Feature/Épico] Sistema centralizado de notificações in-app (notificações de interações) | P2 — Média | L | 🟢 Concluído |
| **F15** | #44 | [Feature] Sistema de Newsletter com double opt-in e disparo automático em novas publicações | P2 — Média | M | 🟢 Concluído |
| **F16** | #45 | [Feature] Verificação obrigatória de e-mail no cadastro de novos usuários | P1 — Alta | S | 🟢 Concluído |
| **F17** | #46 | [Feature] Sistema de denúncias (reports) de posts e comentários com painel de moderação | P2 — Média | M | Concluído |
| **F18** | #47 | [Feature] Promoção de READER a AUTHOR após verificação de e-mail e aceite das regras | P2 — Média | S | Concluído |
| **F19** | #48 | [Feature] Dashboard de métricas analíticas e estatísticas da plataforma para administradores | P2 — Média | M | Concluído |
| **F20** | #49 | [Feature] Trilha de auditoria (Audit Log) para ações críticas e administrativas | P2 — Média | M | Concluído |
| **F21** | #50 | [Feature] Sistema de suspensão e banimento temporário ou definitivo de usuários | P2 — Média | S | Concluído |
| **F22** | #51 | [Feature] Autenticação social com OAuth2 (Google e GitHub) | P2 — Média | M | Concluído |
| **F23** | #52 | [Feature] Autenticação de dois fatores (2FA / TOTP) | P2 — Média | M | Concluído |
| **F24** | #53 | [Feature] Interface e endpoints para visualização e revogação de sessões ativas do usuário | P2 — Média | S | Concluído |
| **F25** | #54 | [Performance] Camada de cache distribuído em memória com Redis para consultas públicas | P2 — Média | M | Concluído localmente |
| **F26** | #55 | [Performance] Paginação por cursor (keyset pagination) para feed de artigos e comentários | P3 — Baixa | M | Concluído localmente |

---

### 🚀 Ordem Recomendada de Implementação (Sprints)

1. **Sprint 1 — Segurança Crítica & Correção de Lógica (P0):**
   - #1 (Restringir criação de posts a AUTHOR/ADMIN)
   - #2 (Mitigar vazamento de PII em usuários)
   - #3 (Sanitização de HTML em e-mails)
   - #4 (Validação estrita de variáveis de ambiente)
   - #5 (Helmet, CORS e Trust Proxy)
   - #7 (Exigir senha atual para alteração de credenciais)
   - #16 (Corrigir operador lógico OR/AND na busca de posts)
   - #17 (Visualização de rascunhos pelo autor `GET /posts/me`)

2. **Sprint 2 — Robustez, Qualidade & Dados (P1; concluída):**
   - #6, #8, #9, #10, #11, #12, #13
   - #18, #19, #20, #22, #24, #25, #26, #27, #28
   - #45 (Verificação de e-mail no cadastro)

3. **Sprint 3 — Conteúdo, SEO & Autoria (P1/P2; concluída e enviada pelo usuário):**
   - #30 (Slugs amigáveis)
   - #31 (Imagem de capa)
   - #33 (Tempo de leitura estimado)
   - #34 (RSS/Atom + Sitemap XML)
   - #38 (Artigos relacionados)
   - #39 (Perfil público do autor)
   - #32 (Agendamento de publicação)

   O tempo de leitura usa 200 palavras por minuto, arredondado para cima, com mínimo de um minuto. Os slugs são estáveis, com sufixos para duplicatas e compatibilidade com URLs anteriores.

4. **Sprint 4 — Engajamento & Comunidade (P2/P3; concluída localmente, pendente de revisão do usuário):**
   - #15 (Rate limit granular em comentários e reações)
   - #23 (Enriquecimento de artigos salvos)
   - #37 (Contador de visualizações e trending)
   - #40 (Seguir autores e feed customizado)
   - #41 (Curtidas em comentários)
   - #42 (Coleções de salvos)
   - #43 (Sistema de notificações in-app)
   - #44 (Newsletter)

   **Ordem sugerida para sessões curtas:**
   1. #23: enriquecer artigos salvos; verificar a resposta e os relacionamentos existentes.
   2. #15: limitar comentários, reações e criação de tags, considerando os controles já existentes.
   3. #37: visualizações e artigos em alta; definir deduplicação e período de cálculo antes de implementar.
   4. #41: curtidas em comentários.
   5. #40: seguir autores e feed personalizado.
   6. #42: coleções de artigos salvos.
   7. #43: notificações in-app; identificar eventos das funcionalidades existentes e definir quais serão cobertos.
   8. #44: newsletter com double opt-in e envio em novas publicações, incluindo publicações agendadas.

   #15: limites por IP e por rota, em memória por instância: 5 comentários, 30 curtidas e 30 remoções de curtidas por minuto; criação e edição de artigos (que também criam tags) limitadas a 10 e 20 por minuto, respectivamente. O limite global existente permanece aplicado às demais rotas. Cada artigo aceita até dez tags.
   #37: uma visualização por artigo e IP por dia UTC, com IP representado por HMAC; ranking considera hoje e os seis dias UTC anteriores. #41: curtidas idempotentes em comentários ativos de artigos públicos com comentários habilitados.
   #40: feed mostra artigos públicos de autores ativos seguidos. #42: ao retirar um artigo dos salvos ele fica oculto nas coleções e retorna se for salvo novamente. #43: notifica comentários, respostas, curtidas em artigos e comentários e novos seguidores, sem notificação para ações próprias. #44: confirmação por token de uso único (24 horas), cancelamento por token e entregas de novas publicações manuais ou agendadas; falhas SMTP são retomadas a cada cinco minutos, com processamento de até 50 por minuto. A entrega é pelo menos uma vez: falha após aceitação pelo SMTP e antes do registro pode produzir repetição.

   Conclua e valide cada leva antes de avançar, ajustando a ordem se dependências identificadas durante a implementação exigirem. Atualize os status neste documento; alterações e commits permanecem locais até o usuário enviá-los.

5. **Sprint 5 — Moderação, Governança & Autenticação Avançada (P2):**
   - #14 e #53 — concluídos: sessões por dispositivo, rotação atômica e revogação seletiva. Tokens anteriores à migration exigem novo login.
   - #46 — concluída: denúncias de artigos e comentários, análise administrativa e auditoria da decisão.
   - #47 e #57 — concluídas: aceite versionado e promoção automática; o primeiro artigo de novos autores exige aprovação. Autores existentes foram preservados na migration. A revogação bloqueia nova promoção automática e encerra revisões pendentes.
   - #48 — concluída: indicadores agregados disponíveis a administradores.
   - #49 — concluída: auditoria de ações de autenticação, moderação, permissões e administração de conteúdo, com consulta restrita a administradores.
   - #50 — concluída: suspensão com prazo ou banimento, revogação das sessões, ocultação escolhida de artigos e restauração manual ou após expiração.
   - #51 — concluída: OAuth2 Google e GitHub, PKCE, estado de uso único, vínculo explícito de contas e desafio TOTP quando necessário. A operação real depende das credenciais dos provedores.
   - #52 — concluída: TOTP com segredo criptografado e proteção contra reutilização de códigos. Não há códigos de recuperação.

6. **Sprint 6 — Performance & Escala (P2/P3):**
   - #21 — concluída: vetor textual armazenado com pesos por título/conteúdo, ranking por relevância na paginação numérica, busca parcial com índice trigram e EXPLAIN ANALYZE comprovando Bitmap Index Scan nos índices GIN em massa de 5 mil artigos. A paginação por cursor mantém ordem cronológica estável.
   - #29 — concluída: fila BullMQ e outbox cifrada no PostgreSQL; queda do Redis preserva e-mails pendentes. O agendador encaminha até 100 mensagens a cada dez segundos. Há teste de falha e recuperação.
   - #35 — concluída: CRUD com autorização, ordem e navegação anterior/próximo no detalhe do artigo; testes de integração e e2e com três partes e proteção de rascunhos.
   - #36 — concluída: histórico de título e conteúdo criado automaticamente no banco, com listagem, consulta e restauração pelo autor ou administrador. Artigos existentes recebem uma revisão inicial na migration.
   - #54 — concluída: cache compartilhado Redis sem SQL nos hits, invalidado antes da resposta das escritas e após publicações agendadas; reconexões descartam entradas antigas. Há teste HTTP verificando ausência de consultas SQL.
   - #55 — concluída: cursor opcional com precisão de microssegundos e índices B-Tree compostos, preservando paginação numérica. Cinco páginas consecutivas são verificadas sem duplicação ou omissão. Complexidade esperada: O(log N + k), conforme funcionamento de um índice B-Tree.

   Validações e resultados atuais estão em [RELEASE_AUDIT.md](docs/RELEASE_AUDIT.md). As 43 migrations foram aplicadas no banco configurado e verificadas desde um banco vazio. A versão inclui imagem Docker de produção, health checks, persistência de uploads e pipeline de CI.
