## 📋 Backlog Geral e Rastreabilidade — Backend Blog

Este documento consolida e rastreia todos os **55 itens acionáveis** originados do relatório técnico `analise_blog.md`, categorizados em 6 Milestones e divididos por prioridades, estimativas de esforço e status de execução.

Status local dos 55 itens originais: **25 concluídos e 30 pendentes**. A issue adicional #57 permanece pendente.

**Decisão de produto — comunidade e autoria:** visitantes leem artigos públicos; contas começam como `READER`. Após verificar o e-mail (#45) e aceitar as regras de publicação, o leitor pode solicitar promoção automática a `AUTHOR`. O primeiro artigo requer aprovação administrativa; depois, novos artigos e edições são publicados imediatamente. Administradores podem revogar a autoria ou suspender a conta e decidir quais artigos publicados ocultar. A moderação posterior deve tratar abusos, inclusive alterações feitas após a aprovação.

**Planejamento:** a #47 registra a promoção automática e a #57 a revisão do primeiro artigo. Alinhar revogação, suspensão e auditoria com #49 e #50. A #17 trata do acesso a rascunhos próprios. Essas decisões não alteram a ordem das sprints.

**Item adicional:** [#57 — Aprovar o primeiro artigo de cada autor](https://github.com/OtavioMR/Backend-Blog/issues/57), P2, backlog, Sprint 5. Esta issue foi criada após os 55 itens originais do relatório.

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
| **S6** | #6 | [Segurança] Restringir ou desativar interface do Swagger em ambiente de produção | P1 — Alta | XS | ?? Conclu?do |
| **S7** | #7 | [Segurança] Exigir senha atual para alteração de credenciais e confirmar novo e-mail | P0 — Crítica | M | 🟢 Concluído |
| **S8** | #8 | [Segurança] Mitigar ataques de temporização (Timing Attacks) na autenticação | P1 — Alta | S | 🟢 Concluído |
| **S9** | #9 | [Segurança] Padronizar custo e limites de hashing de senhas com bcrypt | P1 — Alta | S | 🟢 Concluído |
| **S10** | #10 | [Segurança] Implementar bloqueio progressivo por tentativas falhas de login | P1 — Alta | M | 🟢 Concluído |
| **S11** | #11 | [Segurança] Definir limites de tamanho (MaxLength) e sanitização em parâmetros de busca | P1 — Alta | XS | 🟢 Concluído |
| **S12** | #12 | [Segurança] Sanitizar payloads de conteúdo de posts e comentários contra XSS | P1 — Alta | S | 🟢 Concluído |
| **S13** | #13 | [Segurança] Processamento seguro de upload de fotos de perfil com Sharp e limpeza de órfãos | P1 — Alta | M | 🟢 Concluído |
| **S14** | #14 | [Segurança/Épico] Modelagem de tabela de sessões ativas com rotação de refresh token por dispositivo | P2 — Média | L | Backlog |
| **S15** | #15 | [Segurança] Rate limiting granular para criação de comentários, reações e tags | P2 — Média | S | Backlog |

#### 🛠️ 2. Melhorias e Bugs (M1 a M14)
| Código | Issue | Título | Prioridade | Esforço | Status |
|---|---|---|---|---|---|
| **M1** | #16 | [Bug] Corrigir operador lógico na consulta filtrada de artigos (trocar OR por AND) | P0 — Crítica | XS | 🟢 Concluído |
| **M2** | #17 | [Melhoria] Permitir que autores visualizem e gerenciem seus próprios rascunhos (GET /posts/me) | P0 — Crítica | S | 🟢 Concluído |
| **M3** | #18 | [Melhoria] Adicionar campo publishedAt e ordenar artigos pela data real de publicação | P1 — Alta | S | 🟢 Concluído |
| **M4** | #19 | [Melhoria] Otimizar listagem de artigos com resumo (excerpt) e exclusão de payload pesado | P1 — Alta | S | 🟢 Concluído |
| **M5** | #20 | [Performance] Eliminar problema de query N+1 na listagem de comentários e respostas | P1 — Alta | M | 🟢 Concluído |
| **M6** | #21 | [Melhoria] Implementar busca textual Full-Text nativa com PostgreSQL (tsvector e GIN) | P2 — Média | M | Backlog |
| **M7** | #22 | [Bug] Permitir moderação e remoção de comentários mesmo com comentários desativados no post | P1 — Alta | XS | ?? Conclu?do |
| **M8** | #23 | [Melhoria] Enriquecer resposta de artigos salvos com autor, categorias e tags | P2 — Média | XS | Backlog |
| **M9** | #24 | [Refatoração] Padronizar estrutura de metadados de paginação com utilitário compartilhado | P2 — Média | S | 🟢 Concluído |
| **M10** | #25 | [Melhoria] Padronizar busca de categorias e tags com escape e unaccent | P2 — Média | XS | 🟢 Concluído |
| **M11** | #26 | [Refatoração] Centralizar serialização de DTOs com ClassSerializerInterceptor e @Exclude | P2 — Média | M | 🟢 Concluído |
| **M12** | #27 | [Melhoria] Ativar e configurar módulo de monitoramento e tracing (NestJS Observe / OpenTelemetry) | P1 — Alta | XS | 🟢 Concluído |
| **M13** | #28 | [Infraestrutura] Implementar health check com Terminus, shutdown hooks e filtro global de exceções | P2 — Média | S | 🟢 Concluído |
| **M14** | #29 | [Infraestrutura] Implementar processamento assíncrono de e-mails em fila com BullMQ e Redis | P2 — Média | M | Backlog |

#### ✨ 3. Novas Funcionalidades (F1 a F26)
| Código | Issue | Título | Prioridade | Esforço | Status |
|---|---|---|---|---|---|
| **F1** | #30 | [Feature] Suporte a Slugs amigáveis nas URLs de artigos (GET /posts/:slug) | P1 — Alta | S | Backlog |
| **F2** | #31 | [Feature] Upload e gerenciamento de Imagem de Capa para artigos (coverImage) | P2 — Média | M | Backlog |
| **F3** | #32 | [Feature] Agendamento de publicação automática de posts com @nestjs/schedule | P2 — Média | M | Backlog |
| **F4** | #33 | [Feature] Cálculo e exibição automática do tempo estimado de leitura (readingTimeMinutes) | P2 — Média | XS | Backlog |
| **F5** | #34 | [Feature] Geração dinâmica de Feeds RSS/Atom e Sitemap XML | P2 — Média | S | Backlog |
| **F6** | #35 | [Feature] Agrupamento de artigos em séries sequenciais | P3 — Baixa | M | Backlog |
| **F7** | #36 | [Feature] Histórico de revisões e versionamento de artigos (post_revisions) | P3 — Baixa | M | Backlog |
| **F8** | #37 | [Feature] Contador de visualizações com deduplicação e endpoint de artigos em alta | P2 — Média | M | Backlog |
| **F9** | #38 | [Feature] Recomendação de artigos relacionados por similaridade de tags e categorias | P2 — Média | S | Backlog |
| **F10** | #39 | [Feature] Perfil público do autor com bio, links sociais e contagem de publicações | P2 — Média | S | Backlog |
| **F11** | #40 | [Feature] Sistema de seguir autores e feed personalizado (GET /feed) | P2 — Média | M | Backlog |
| **F12** | #41 | [Feature] Sistema de reações e curtidas em comentários | P2 — Média | S | Backlog |
| **F13** | #42 | [Feature] Organização de artigos salvos em coleções/pastas personalizadas | P3 — Baixa | M | Backlog |
| **F14** | #43 | [Feature/Épico] Sistema centralizado de notificações in-app (notificações de interações) | P2 — Média | L | Backlog |
| **F15** | #44 | [Feature] Sistema de Newsletter com double opt-in e disparo automático em novas publicações | P2 — Média | M | Backlog |
| **F16** | #45 | [Feature] Verificação obrigatória de e-mail no cadastro de novos usuários | P1 — Alta | S | 🟢 Concluído |
| **F17** | #46 | [Feature] Sistema de denúncias (reports) de posts e comentários com painel de moderação | P2 — Média | M | Backlog |
| **F18** | #47 | [Feature] Promoção de READER a AUTHOR após verificação de e-mail e aceite das regras | P2 — Média | S | Backlog |
| **F19** | #48 | [Feature] Dashboard de métricas analíticas e estatísticas da plataforma para administradores | P2 — Média | M | Backlog |
| **F20** | #49 | [Feature] Trilha de auditoria (Audit Log) para ações críticas e administrativas | P2 — Média | M | Backlog |
| **F21** | #50 | [Feature] Sistema de suspensão e banimento temporário ou definitivo de usuários | P2 — Média | S | Backlog |
| **F22** | #51 | [Feature] Autenticação social com OAuth2 (Google e GitHub) | P2 — Média | M | Backlog |
| **F23** | #52 | [Feature] Autenticação de dois fatores (2FA / TOTP) | P2 — Média | M | Backlog |
| **F24** | #53 | [Feature] Interface e endpoints para visualização e revogação de sessões ativas do usuário | P2 — Média | S | Backlog |
| **F25** | #54 | [Performance] Camada de cache distribuído em memória com Redis para consultas públicas | P2 — Média | M | Backlog |
| **F26** | #55 | [Performance] Paginação por cursor (keyset pagination) para feed de artigos e comentários | P3 — Baixa | M | Backlog |

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

3. **Sprint 3 — Conteúdo, SEO & Autoria (P1/P2; próxima):**
   - #30 (Slugs amigáveis)
   - #31 (Imagem de capa)
   - #33 (Tempo de leitura estimado)
   - #34 (RSS/Atom + Sitemap XML)
   - #38 (Artigos relacionados)
   - #39 (Perfil público do autor)
   - #32 (Agendamento de publicação)

4. **Sprint 4 — Engajamento & Comunidade (P2):**
   - #15 (Rate limit granular em comentários e reações)
   - #23 (Enriquecimento de artigos salvos)
   - #37 (Contador de visualizações e trending)
   - #40 (Seguir autores e feed customizado)
   - #41 (Curtidas em comentários)
   - #42 (Coleções de salvos)
   - #43 (Sistema de notificações in-app)
   - #44 (Newsletter)

5. **Sprint 5 — Moderação, Governança & Autenticação Avançada (P2):**
   - #14 e #53 (Sessões ativas e múltiplos dispositivos)
   - #46 (Sistema de denúncias)
   - #47 (Promoção automática a autor após requisitos)
   - #57 (Revisão do primeiro artigo; alinhar revogação e ocultação com #49 e #50)
   - #48 (Dashboard analítico para admin)
   - #49 (Trilha de auditoria)
   - #50 (Suspensão e banimento temporário)
   - #51 (Login social OAuth2)
   - #52 (Autenticação de 2 fatores TOTP)

6. **Sprint 6 — Performance & Escala (P2/P3):**
   - #21 (Busca textual Full-Text nativa com tsvector e GIN)
   - #29 (Fila de e-mails assíncrona com BullMQ)
   - #35 (Séries de artigos)
   - #36 (Histórico de revisões)
   - #54 (Cache distribuído com Redis)
   - #55 (Paginação por cursor)
