# Blog API — Documentação Técnica Completa e Guia de Integração Frontend

> Para as alterações administrativas mais recentes, incluindo SUPER_ADMIN, TOTP para mudanças de função e incompatibilidades do PATCH de usuários, consulte [README-ADMIN.md](README-ADMIN.md). Em caso de divergência com seções anteriores, esse contrato prevalece.

API RESTful em **NestJS 11 + TypeScript**, **TypeORM + PostgreSQL** e **Redis** para plataforma editorial e de blog multiusuário com controle de acesso baseado em papéis (`READER`, `AUTHOR`, `ADMIN`), fluxo de revisão editorial do primeiro artigo, autenticação JWT com rotação de refresh token em cookie `HttpOnly`, autenticação em dois fatores (TOTP), login social OAuth2 (Google e GitHub), agendamento de publicações, revisões de artigos, séries, coleções salvas, comentários aninhados, notificações, newsletter (double opt-in), denúncias, moderação administrativa, métricas e trilha de auditoria.

---

## Índice

1. [Visão geral da API](#1-visão-geral-da-api)
2. [Tecnologias utilizadas](#2-tecnologias-utilizadas)
3. [Configuração do ambiente](#3-configuração-do-ambiente)
4. [URL base e variáveis de ambiente](#4-url-base-e-variáveis-de-ambiente)
5. [Autenticação e autorização](#5-autenticação-e-autorização)
6. [Resumo geral de todos os endpoints](#6-resumo-geral-de-todos-os-endpoints)
7. [Referência detalhada dos endpoints por módulo](#7-referência-detalhada-dos-endpoints-por-módulo)
   - [7.1. Health Check](#71-health-check)
   - [7.2. Autenticação e Sessões (`auth`)](#72-autenticação-e-sessões-auth)
   - [7.3. Autenticação Social OAuth2 (`auth/social`)](#73-autenticação-social-oauth2-authsocial)
   - [7.4. Autenticação de Dois Fatores — TOTP (`auth/totp`)](#74-autenticação-de-dois-fatores--totp-authtotp)
   - [7.5. Usuários e Promoção de Autor (`users`)](#75-usuários-e-promoção-de-autor-users)
   - [7.6. Artigos (`posts`)](#76-artigos-posts)
   - [7.7. Interações em Artigos (`posts` — likes e salvos)](#77-interações-em-artigos-posts--likes-e-salvos)
   - [7.8. Visualizações e Artigos em Alta (`posts` — views e trending)](#78-visualizações-e-artigos-em-alta-posts--views-e-trending)
   - [7.9. Revisão Editorial (`post-reviews`)](#79-revisão-editorial-post-reviews)
   - [7.10. Histórico de Revisões (`posts/:postId/revisions`)](#710-histórico-de-revisões-postspostidrevisions)
   - [7.11. Séries de Artigos (`series` e `posts/:postId/series`)](#711-séries-de-artigos-series-e-postspostidseries)
   - [7.12. Autores Públicos e Seguidores (`authors` e `feed`)](#712-autores-públicos-e-seguidores-authors-e-feed)
   - [7.13. Feeds Sindicados e Sitemap (`feed/rss`, `feed.xml`, `feed/atom`, `sitemap.xml`)](#713-feeds-sindicados-e-sitemap-feedrss-feedxml-feedatom-sitemapxml)
   - [7.14. Coleções de Artigos Salvos (`collections`)](#714-coleções-de-artigos-salvos-collections)
   - [7.15. Categorias (`categories`)](#715-categorias-categories)
   - [7.16. Tags (`tags`)](#716-tags-tags)
   - [7.17. Comentários e Curtidas em Comentários (`posts/:postId/comments` e `comments`)](#717-comentários-e-curtidas-em-comentários-postspostidcomments-e-comments)
   - [7.18. Notificações (`notifications`)](#718-notificações-notifications)
   - [7.19. Newsletter (`newsletter`)](#719-newsletter-newsletter)
   - [7.20. Denúncias (`reports`)](#720-denúncias-reports)
   - [7.21. Moderação Administrativa (`admin/users`)](#721-moderação-administrativa-adminusers)
   - [7.22. Analytics Administrativo (`admin/analytics`)](#722-analytics-administrativo-adminanalytics)
   - [7.23. Logs de Auditoria (`admin/audit-logs`)](#723-logs-de-auditoria-adminaudit-logs)
8. [Exemplos de requisições e respostas](#8-exemplos-de-requisições-e-respostas)
9. [Integração com o frontend React](#9-integração-com-o-frontend-react)
10. [Fluxos completos da aplicação](#10-fluxos-completos-da-aplicação)
11. [Upload de arquivos](#11-upload-de-arquivos)
12. [Paginação e filtros](#12-paginação-e-filtros)
13. [Tratamento de erros](#13-tratamento-de-erros)
14. [Referência ao Swagger/OpenAPI](#14-referência-ao-swaggeropenapi)
15. [Limitações, funcionalidades não implementadas e Estado atual da integração frontend/backend](#15-limitações-funcionalidades-não-implementadas-e-estado-atual-da-integração-frontendbackend)
    - [Estado atual da integração frontend/backend](#estado-atual-da-integração-frontendbackend)

---

## 1. Visão geral da API

A **Blog API** segue a arquitetura modular do NestJS (`src/modules/*`) e fornece **104 endpoints HTTP** sob o prefixo global `/api/v1` (distribuídos em 23 controllers e 13 módulos HTTP, além do módulo interno `mail`), rotas estáticas para imagens processadas (`/uploads/profile-photos/*` e `/uploads/post-covers/*`) e documentação interativa Swagger (`/api/docs` fora de produção).

Principais características arquiteturais implementadas no código:
- **Serialização padronizada de datas:** `configureDateSerialization()` em `src/common/utils/date-serializer.ts` sobrescreve `Date.prototype.toJSON` para emitir strings ISO 8601 com offset explícito do fuso horário configurado em `APP_TIMEZONE` (padrão `America/Sao_Paulo`, ex.: `2026-04-19T14:30:00.000-03:00`).
- **Validação estrita de entrada:** `ValidationPipe` global configurado com `whitelist: true`, `forbidNonWhitelisted: true` e `transform: true`. Qualquer propriedade extra não declarada no DTO causa erro `400 Bad Request` (`property X should not exist`).
- **Sanitização de conteúdo:** `sanitizePlainText()` remove qualquer HTML de campos textuais simples (títulos, nomes, bios, comentários, categorias, tags) e `sanitizePostContent()` permite apenas um subconjunto seguro de tags HTML (`b`, `i`, `em`, `strong`, `u`, `s`, `p`, `br`, `ul`, `ol`, `li`, `blockquote`, `code`, `pre`, `h1`-`h6`, `a`, `hr`) com atributos seguros e protocolos restritos (`http`, `https`, `mailto`).
- **Cache público em Redis:** `PublicCacheInterceptor` (`src/common/public-cache.interceptor.ts`) faz cache de requisições `GET` anônimas (sem headers `Authorization` ou `Cookie`) para `/api/v1/posts`, `/api/v1/categories` e `/api/v1/tags` por **60 segundos** em Redis e invalida todas as chaves `public-cache:*` automaticamente após qualquer requisição mutante (`POST`, `PATCH`, `PUT`, `DELETE`).
- **Rate Limiting global e por rota:** `ThrottlerGuard` global aplica **100 requisições por minuto por IP**, com limites mais restritivos via `@Throttle()` em rotas sensíveis (login, cadastro/verificação, comentários, curtidas, denúncias, recuperação de senha, TOTP, OAuth).
- **Trabalhadores em background (Cron / Outbox):**
  - `PostSchedulerService`: executa a cada minuto (`CronExpression.EVERY_MINUTE`) publicando artigos cujo `scheduledAt <= NOW()` (desde que o autor tenha `firstPostApproved = true` ou seja `ADMIN`) e enfileirando notificações para seguidores e assinantes da newsletter.
  - `MailQueueService`: fila persistente em PostgreSQL (`mail_jobs`) com tentativas automáticas e backoff exponencial, enviando e-mails reais via SMTP (`nodemailer`) quando `SMTP_HOST` está configurado ou registrando-os em log estruturado JSON em desenvolvimento.

---

## 2. Tecnologias utilizadas

| Camada | Tecnologia / Biblioteca | Versão (`package.json`) | Papel na Aplicação |
|---|---|---|---|
| Runtime & Framework | Node.js >= 20 + NestJS (`@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`) | `^11.0.1` | Servidor HTTP REST, injeção de dependência, guards, interceptors e pipes |
| Linguagem | TypeScript | `^5.7.3` | Tipagem estática no backend e contratos compartilhados |
| ORM & Banco de Dados | TypeORM (`typeorm`, `@nestjs/typeorm`) + PostgreSQL (`pg`) | `^0.3.28` / `^8.19.0` | Persistência relacional, migrations, constraints e busca full-text (`blog_portuguese` + `unaccent`) |
| Cache & Rate Limit | Redis (`ioredis`) + `@nestjs/throttler` | `^5.10.1` / `^6.5.0` | Cache público de listagens/artigos e controle de taxa de requisições |
| Autenticação & Segurança | `@nestjs/jwt`, `passport-jwt`, `bcrypt`, `helmet`, `cookie-parser` | `^11.0.2` / `^4.0.1` / `^6.0.0` / `^8.1.0` | Access Token JWT, hash de senhas/tokens, headers HTTP seguros e cookies `HttpOnly` |
| Processamento de Imagens | `multer` + `sharp` | `^2.1.1` / `^0.34.5` | Upload `multipart/form-data`, validação de assinatura binária, redimensionamento e conversão para WebP |
| Agendamento & Saúde | `@nestjs/schedule`, `@nestjs/terminus` | `^6.1.1` / `^11.1.1` | Publicação agendada de artigos, fila de e-mails e health check do banco |
| E-mail & Sanitização | `nodemailer`, `sanitize-html` | `^8.0.5` / `^2.17.1` | Envio de e-mails transacionais e sanitização contra XSS |
| Documentação API | `@nestjs/swagger` | `^11.2.6` | Especificação OpenAPI e interface Swagger UI em `/api/docs` |
| Frontend de Referência | Next.js (App Router) + React + TypeScript + Tailwind CSS | `16.2.3` / `19.2.4` | Cliente web (`Front-Blog`) integrado via rewrites e rotas BFF |

---

## 3. Configuração do ambiente

### Pré-requisitos
- **Docker** e **Docker Compose** (recomendado para subir PostgreSQL 15, Redis 7 e a API)
- **Node.js 20+** e **npm** (para execução local fora de container ou execução do frontend)

### Passo 1 — Configurar variáveis de ambiente do Backend

Copie o arquivo `.env.example` para `.env` na raiz do backend:

```bash
cp .env.example .env
```

Preencha obrigatoriamente `DB_PASSWORD`, `JWT_SECRET` (mínimo de 32 caracteres) e, caso utilize Docker Compose, `PGADMIN_DEFAULT_PASSWORD`. Nunca versione o arquivo `.env`.

### Passo 2 — Executar com Docker Compose (Recomendado)

```bash
# Construir e iniciar PostgreSQL, Redis, pgAdmin e a API NestJS
docker compose up --build -d

# Acompanhar os logs da API
docker compose logs -f api
```

Ao iniciar, o container `api` executa `sh ./scripts/start-prod.sh`, que compila/executa as migrations pendentes e sobe o servidor na porta configurada (`PORT=3000` por padrão).

### Passo 3 — Executar localmente em modo de desenvolvimento (Alternativa)

Caso queira rodar apenas o banco e o Redis no Docker e a API localmente:

```powershell
npm.cmd install
npm.cmd run migration:run
npm.cmd run start:dev
```

### Comandos úteis de banco de dados e qualidade

```powershell
# Executar migrations pendentes
npm.cmd run migration:run

# Reverter a última migration aplicada
npm.cmd run migration:revert

# Gerar nova migration a partir das entidades
npm.cmd run migration:generate -- src/migrations/NomeDaMigration

# Executar suíte de testes unitários
npm.cmd run test

# Executar testes E2E
npm.cmd run test:e2e

# Executar linter
npm.cmd run lint
```

### Passo 4 — Executar o Frontend (`Front-Blog`)

No diretório do frontend (`Front-Blog`), crie `.env.local` apontando para a porta onde o backend está rodando:

```env
API_ORIGIN=http://localhost:3000
SITE_ORIGIN=http://localhost:5173
EDITORIAL_WORKFLOW_ENABLED=true
ENABLE_ADMIN_BFF=true
```

E inicie o servidor Next.js na porta `5173` (para coincidir com `FRONTEND_URL=http://localhost:5173` do backend):

```powershell
npm.cmd install
npm.cmd run dev -- -p 5173
```

---

## 4. URL base e variáveis de ambiente

### URLs Base

| Recurso | URL Base Padrão (Backend direto) | URL via Frontend Next.js (`rewrites` / BFF) | Observação |
|---|---|---|---|
| **API REST v1** | `http://localhost:3000/api/v1` | `http://localhost:5173/api/v1` | Prefixo global definido em `src/main.ts` (`app.setGlobalPrefix('api/v1')`) |
| **Uploads de Perfil** | `http://localhost:3000/uploads/profile-photos/:file` | `http://localhost:5173/uploads/profile-photos/:file` | Arquivos `.webp` servidos estaticamente fora de `/api/v1` |
| **Uploads de Capa** | `http://localhost:3000/uploads/post-covers/:file` | `http://localhost:5173/uploads/post-covers/:file` | Arquivos `.webp` servidos estaticamente fora de `/api/v1` |
| **Swagger UI** | `http://localhost:3000/api/docs` | Não exposto no rewrite do Next.js | Ativo somente quando `NODE_ENV !== 'production'` |

> **Atenção sobre portas padrão (`3000` vs `3001`):** O `.env.example` do backend define `PORT=3000` e `FRONTEND_URL=http://localhost:5173`. Já o código do frontend (`next.config.ts`, `src/lib/public-post.ts`, `src/lib/admin-security.ts`) usa `process.env.API_ORIGIN || "http://localhost:3001"` e `process.env.SITE_ORIGIN || "http://localhost:3000"` como fallback quando `.env.local` não está definido. Portanto, no frontend é essencial configurar `API_ORIGIN=http://localhost:3000` e `SITE_ORIGIN=http://localhost:5173` em `.env.local` (ou ajustar `PORT`/`FRONTEND_URL` de forma correspondente).

### Variáveis de Ambiente do Backend (`src/config/env.validation.ts`)

| Variável | Obrigatória | Padrão | Descrição e Regras de Validação |
|---|---|---|---|
| `NODE_ENV` | Não | `development` | Ambiente de execução (`development`, `production`, `test`). Em `production`, desativa o Swagger, ativa cookies `Secure` e exige `TRUST_PROXY` se aplicável. |
| `PORT` | Não | `3000` | Porta TCP na qual a API NestJS escuta (`1` a `65535`). |
| `APP_TIMEZONE` | Não | `America/Sao_Paulo` | Fuso horário IANA válido usado para serializar objetos `Date` em respostas JSON e configurar a sessão do PostgreSQL. |
| `FRONTEND_URL` | Não | `http://localhost:5173` | URL pública do frontend usada no CORS (`origin`), links de e-mail, `sitemap.xml` e feeds RSS/Atom. |
| `TRUST_PROXY` | Não | `false` | Aceita `'true'`, `'false'`, `'1'`, `'0'` ou número inteiro de saltos. Configura `trust proxy` no Express para leitura correta do IP real (`req.ip`). |
| `DB_HOST` | Sim | — | Host do servidor PostgreSQL (`localhost` fora do Docker ou `postgres` na rede do Compose). |
| `DB_PORT` | Sim | `5432` | Porta TCP do PostgreSQL (`1` a `65535`). |
| `DB_USERNAME` | Sim | — | Usuário do banco de dados PostgreSQL. |
| `DB_PASSWORD` | Sim | — | Senha do banco de dados PostgreSQL (não pode ser vazia). |
| `DB_NAME` | Sim | — | Nome do database PostgreSQL (ex.: `blog_db`). |
| `DB_LOGGING` | Não | `false` | Habilita log de queries SQL pelo TypeORM (`'true'` / `'false'`). |
| `DB_SSL` | Não | `false` | Habilita conexão TLS com o PostgreSQL (`'true'` / `'false'`). |
| `DB_SSL_REJECT_UNAUTHORIZED` | Não | `true` | Quando `DB_SSL=true`, controla `rejectUnauthorized` no certificado TLS do banco. |
| `JWT_SECRET` | Sim | — | Segredo HMAC do JWT e de tokens internos (TOTP temporário, OAuth state/challenge, dedupe de views). **Mínimo de 32 caracteres**. Rejeita valores conhecidos de exemplo. |
| `JWT_EXPIRES_IN` | Não | `15m` | Tempo de expiração do Access Token JWT (formato `^\d+(s|m|h|d)$`, ex.: `15m`, `1h`). |
| `REDIS_HOST` | Não | `localhost` | Host do servidor Redis usado pelo `PublicCacheService`. |
| `REDIS_PORT` | Não | `6379` | Porta TCP do servidor Redis (`1` a `65535`). |
| `REDIS_PASSWORD` | Não | `undefined` | Senha opcional para autenticação no Redis. |
| `REDIS_DB` | Não | `0` | Índice do banco lógico Redis (`>= 0`). |
| `SMTP_HOST` | Condicional | `undefined` | Host do servidor SMTP. Se definido, exige `SMTP_PORT` e `MAIL_FROM`. Sem `SMTP_HOST`, os e-mails são registrados no log da aplicação. |
| `SMTP_PORT` | Condicional | `undefined` | Porta do servidor SMTP (`1` a `65535`). Obrigatória quando `SMTP_HOST` está presente. |
| `SMTP_SECURE` | Não | `false` | Define TLS implícito no SMTP (`true` normalmente para porta 465). |
| `SMTP_USER` | Condicional | `undefined` | Usuário SMTP (se informado, exige `SMTP_PASS`). |
| `SMTP_PASS` | Condicional | `undefined` | Senha SMTP (se informada, exige `SMTP_USER`). |
| `MAIL_FROM` | Condicional | `undefined` | Remetente padrão dos e-mails transacionais (obrigatório quando `SMTP_HOST` está definido). |
| `GOOGLE_CLIENT_ID` | Condicional | `undefined` | Client ID OAuth2 do Google (exige `GOOGLE_CLIENT_SECRET` e `GOOGLE_CALLBACK_URL`). |
| `GOOGLE_CLIENT_SECRET` | Condicional | `undefined` | Client Secret OAuth2 do Google. |
| `GOOGLE_CALLBACK_URL` | Condicional | `undefined` | URL de callback OAuth2 do Google. |
| `GITHUB_CLIENT_ID` | Condicional | `undefined` | Client ID OAuth2 do GitHub (exige `GITHUB_CLIENT_SECRET` e `GITHUB_CALLBACK_URL`). |
| `GITHUB_CLIENT_SECRET` | Condicional | `undefined` | Client Secret OAuth2 do GitHub. |
| `GITHUB_CALLBACK_URL` | Condicional | `undefined` | URL de callback OAuth2 do GitHub. |

### Variáveis de Ambiente do Frontend (`Front-Blog`)

| Variável | Padrão no Código | Descrição |
|---|---|---|
| `API_ORIGIN` | `http://localhost:3001` | Origem HTTP do backend NestJS sem barra final e sem `/api/v1` (ex.: `http://localhost:3000`). Usada nos `rewrites` do Next.js e em Server Components/Route Handlers. |
| `SITE_ORIGIN` | `http://localhost:3000` | Origem canônica do frontend sem barra final (ex.: `http://localhost:5173`). Validada contra o header `Origin` pelo proxy de mutações (`src/proxy.ts`). |
| `EDITORIAL_WORKFLOW_ENABLED` | `undefined` (desativado) | Quando `"true"`, libera as rotas `/studio/novo` e `/studio/[id]` no frontend para criação e edição de rascunhos. |
| `ENABLE_ADMIN_BFF` | `undefined` (desativado) | Quando `"true"`, libera a rota `/gestao-editorial` para revisão administrativa de artigos pendentes. |

---

## 5. Autenticação e autorização

### 5.1. Cadastro de usuários e verificação de e-mail
1. **Cadastro (`POST /api/v1/users`):** Cria um usuário com `role: 'READER'`, `isActive: true`, `emailVerified: false`, `authVersion: 0` e `firstPostApproved: false`. A senha passa por hash `bcrypt` (10 rounds) e um token de verificação aleatório (32 bytes / 64 caracteres hexadecimais) tem seu hash SHA-256 salvo em `emailVerificationTokenHash` com validade de **24 horas**. Um e-mail de confirmação é enfileirado em `mail_jobs` apontando para `${FRONTEND_URL}/confirmar-email?token=<token>`.
2. **Confirmação de e-mail (`POST /api/v1/users/confirm-email`):** Recebe `{ "token": "<64-hex>" }`, valida o hash SHA-256 e a expiração, define `emailVerified = true` e limpa o token.
3. **Reenvio de verificação (`POST /api/v1/users/resend-verification`):** Recebe `{ "email": "..." }`. Para evitar enumeração de contas, responde sempre `200 OK` com mensagem neutra; se o usuário existir, estiver ativo e ainda não tiver confirmado o e-mail, gera novo token válido por 24 horas e enfileira novo e-mail.

### 5.2. Login, Bloqueio por Tentativas e Conta Suspensa
- **Endpoint:** `POST /api/v1/auth/login`
- **Validações em ordem:**
  1. Busca usuário ativo (`isActive: true`) pelo e-mail normalizado (`trim().toLowerCase()`).
  2. Se a conta estiver temporariamente bloqueada (`lockedUntil > NOW()`), retorna `401 Unauthorized` (`"Conta temporariamente bloqueada. Tente novamente mais tarde."`).
  3. Se a conta não possuir senha local (`passwordHash === null`, ex.: criada via login social) ou a senha estiver incorreta, incrementa `failedLoginAttempts`. A partir da **5ª tentativa falha**, aplica bloqueio progressivo exponencial: `15 min * 2^(tentativas - 5)`, limitado ao máximo de **60 minutos (1 hora)**.
  4. Se `emailVerified === false`, retorna `401 Unauthorized` (`"Confirme seu e-mail antes de fazer login."`).
  5. Se `moderationSuspended === true`:
     - Se `moderationSuspensionEndsAt <= NOW()`, restaura automaticamente o usuário e seus artigos que haviam sido ocultados pela suspensão.
     - Caso contrário, lança `403 Forbidden` com payload estruturado:
       ```json
       {
         "statusCode": 403,
         "message": "Conta suspensa.",
         "reason": "Motivo administrativo registrado",
         "endsAt": "2026-05-01T12:00:00.000-03:00"
       }
       ```
  6. Se `totpEnabled === true`, exige o campo `totpCode` (6 dígitos). Sem `totpCode` ou com código inválido, retorna `401 Unauthorized` (`"Código de dois fatores inválido."`).

### 5.3. Utilização do JWT (`access_token`)
- O login e o refresh retornam no corpo JSON:
  ```json
  {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "token_type": "Bearer",
    "expires_in": 900
  }
  ```
- **Claims assinados no JWT:**
  - `sub`: UUID do usuário (`user.id`)
  - `email`: e-mail atual do usuário
  - `role`: papel no momento da emissão (`READER`, `AUTHOR` ou `ADMIN`)
  - `ver`: versão de autenticação (`user.authVersion`)
  - `sid`: UUID da sessão (`AuthSession.id`)
- **Envio nas requisições autenticadas:** Header `Authorization: Bearer <access_token>`.
- **Validação em tempo real (`JwtStrategy.validate` em `src/modules/auth/jwt.strategy.ts`):**
  Em **toda** requisição protegida por `JwtAuthGuard`, o backend consulta o usuário no banco (`usersService.findById(payload.sub)`) e verifica:
  - `user.isActive === true` e `!user.moderationSuspended`
  - `user.authVersion === payload.ver` (qualquer incremento em `authVersion` invalida imediatamente todos os JWTs emitidos anteriormente)
  - Se `payload.sid` estiver presente, verifica no repositório `AuthSession` se a sessão existe, pertence ao usuário e não expirou (`expiresAt > NOW()`).
  - **Importante:** O `JwtStrategy` injeta em `req.user` o `role: user.role` **atual do banco de dados** (e não o `payload.role` congelado no token). Isso significa que quando um `READER` se promove a `AUTHOR` em `POST /api/v1/users/me/author`, o mesmo `access_token` passa imediatamente a ter permissão de `AUTHOR` no backend.

### 5.4. Refresh Token, Rotação e Detecção de Reuso
- No login (ou conclusão de desafio OAuth), o backend cria um registro em `auth_sessions` com validade de **7 dias** e define o cookie `refreshToken`:
  - `HttpOnly: true`
  - `Secure: true` (quando `NODE_ENV === 'production'`)
  - `SameSite: 'strict'`
  - `Path: '/api/v1/auth'`
  - `Max-Age: 604800` (7 dias)
- O token bruto tem formato `<sessionId>.<secretHex>` e apenas o hash `bcrypt` do segredo é salvo em `refreshTokenHash`.
- **Rotação (`POST /api/v1/auth/refresh`):**
  - Lê o cookie `refreshToken` (ou `refresh_token`).
  - Se o segredo corresponder ao `refreshTokenHash` atual, move o hash antigo para `previousTokenHash`, gera um novo segredo + novo cookie `refreshToken`, atualiza `lastUsedAt` e retorna um novo `access_token`.
  - **Detecção de reuso:** Se um cliente apresentar o token anterior já rotacionado (`previousTokenHash`), o backend **deleta imediatamente a sessão inteira (`auth_sessions`)** por suspeita de comprometimento e retorna `401 Unauthorized` (`"Refresh token inválido ou expirado"`).

### 5.5. Logout, Gerenciamento de Sessões e Invalidação Global
- **Logout da sessão atual (`POST /api/v1/auth/logout`):** Requer JWT. Remove a sessão identificada por `req.user.sessionId` (ou pelo cookie `refreshToken`) e limpa o cookie `refreshToken`.
- **Listagem de sessões ativas (`GET /api/v1/auth/sessions`):** Retorna todas as sessões não expiradas do usuário, indicando `current: true` na sessão correspondente ao JWT atual (`req.user.sessionId`).
- **Revogação de sessão específica (`DELETE /api/v1/auth/sessions/:id`):** Deleta a sessão informada (pode ser outra aba/dispositivo ou a própria sessão atual).
- **Invalidação global (`authVersion`):** As seguintes operações incrementam `user.authVersion` e apagam todas as sessões em `auth_sessions`, invalidando instantaneamente todos os JWTs e refresh tokens existentes:
  - Alteração de senha (`PATCH /api/v1/users/:id`)
  - Redefinição de senha (`POST /api/v1/auth/reset-password`)
  - Confirmação de troca de e-mail (`POST /api/v1/users/confirm-email-change`)
  - Ativação ou desativação do 2FA/TOTP (`POST /api/v1/auth/totp/enable` e `/disable`)
  - Suspensão administrativa (`POST /api/v1/admin/users/:id/suspension`)
  - Desativação da conta (`DELETE /api/v1/users/:id` ou `PATCH /api/v1/users/:id` com `isActive: false`)

### 5.6. Autenticação de Dois Fatores — TOTP (2FA)
1. **Setup (`POST /api/v1/auth/totp/setup`):** Usuário autenticado informa sua senha atual (`{ "password": "..." }`). O backend gera um segredo Base32 de 20 bytes, cifra-o com AES-256-GCM derivado de `JWT_SECRET`, salva em `totpPendingSecret` (válido por **10 minutos**) e retorna `{ secret, otpauthUri, expiresIn: 600 }`.
2. **Ativação (`POST /api/v1/auth/totp/enable`):** Usuário envia `{ "code": "123456" }` gerado no aplicativo autenticador (SHA-1, 6 dígitos, janela de 30s com tolerância de ±1 passo). Se válido, move o segredo para `totpSecret`, define `totpEnabled = true`, incrementa `authVersion` e revoga as sessões vigentes (exigindo novo login com 2FA).
3. **Desativação (`POST /api/v1/auth/totp/disable`):** Usuário envia `{ "password": "...", "code": "123456" }`. Valida senha e código TOTP, limpa `totpSecret`, define `totpEnabled = false`, incrementa `authVersion` e revoga as sessões vigentes.

### 5.7. Autenticação Social OAuth2 (Google e GitHub)
- Provedores suportados: `google` e `github`.
- **Fluxo de login (`GET /api/v1/auth/social/:provider/start`):** Gera um JWT `oauth-state` (10 min), grava-o no cookie `oauthState` (`HttpOnly`, `SameSite=Lax`, `Path=/api/v1/auth/social`) e retorna `{ url }` para redirecionar o navegador ao provedor.
- **Fluxo de vinculação (`POST /api/v1/auth/social/:provider/link`):** Igual ao start, mas exige JWT e grava `linkUserId` dentro do `oauthState`.
- **Callback (`GET /api/v1/auth/social/:provider/callback?code=...&state=...`):**
  - Valida `state` contra o cookie `oauthState`.
  - Troca `code` por token no provedor e obtém perfil e e-mail verificado.
  - Se for vinculação (`linkUserId`), cria registro em `social_accounts` e retorna `{ "linked": true }`.
  - Se for login: busca `social_accounts` ou vincula automaticamente a um usuário existente com o mesmo e-mail verificado; se não existir, cria novo usuário `READER` com `emailVerified: true` e `passwordHash: null`.
  - Se o usuário tiver `totpEnabled === true`, **não** emite sessão ainda: retorna `{ "requires_totp": true, "challenge": "<jwt-5m>", "expires_in": 300 }`, que deve ser trocado em `POST /api/v1/auth/social/challenge` enviando `{ challenge, code }`.

### 5.8. Recuperação e Alteração de Senha
- **Esqueci minha senha (`POST /api/v1/auth/forgot-password`):** Recebe `{ "email": "..." }`. Gera token de 32 bytes (64 hex), salva hash SHA-256 em `passwordResetTokenHash` com expiração de **1 hora** (`passwordResetExpiresAt`) e envia e-mail com link `${FRONTEND_URL}/reset-password?token=<token>`. Sempre retorna `200 OK` com mensagem genérica.
- **Redefinir senha (`POST /api/v1/auth/reset-password`):** Recebe `{ "token": "<64-hex>", "newPassword": "..." }` (8 a 72 caracteres e máximo de 72 bytes UTF-8 para compatibilidade com `bcrypt`). Atualiza `passwordHash`, zera contadores de bloqueio, incrementa `authVersion` e remove todas as sessões.
- **Alterar senha autenticado (`PATCH /api/v1/users/:id`):** Usuário envia `{ "currentPassword": "...", "password": "..." }`. Verifica `currentPassword`, garante que a nova senha é diferente da atual, incrementa `authVersion` e revoga todas as sessões.

### 5.9. Proteção das Rotas e Comportamento de Requisições Não Autenticadas
- **Rotas públicas:** Não exigem header `Authorization`.
- **Rotas com `OptionalJwtAuthGuard` (`GET /api/v1/posts/:id`):** Se não houver header `Authorization`, a requisição prossegue como anônima (`req.user = null`) e retorna apenas artigos publicados. Se um header `Authorization: Bearer <token>` for enviado com token inválido ou expirado, retorna `401 Unauthorized`. Se o token for válido, popula `req.user`, permitindo que o autor ou `ADMIN` visualize rascunhos.
- **Rotas com `JwtAuthGuard`:** Sem token, com token malformado/expirado ou com sessão revogada, retornam `401 Unauthorized` (`{ "statusCode": 401, "message": "Unauthorized" }`).
- **Rotas com `JwtAuthGuard` + `RolesGuard` (`@Roles(...)`):** Se o usuário estiver autenticado mas seu `req.user.role` não estiver na lista de roles permitidas, retornam `403 Forbidden` (`{ "statusCode": 403, "message": "Forbidden resource", "error": "Forbidden" }`).

### 5.10. Promoção de `READER` para `AUTHOR` e Fluxo do Primeiro Artigo
1. Qualquer visitante ou leitor consulta os termos editoriais em `GET /api/v1/users/author-rules` (versão atual: `'1'`).
2. O usuário autenticado com papel `READER` envia `POST /api/v1/users/me/author` com `{ "version": "1", "accepted": true }`.
3. O backend valida:
   - Usuário existe, está ativo (`isActive: true`) e tem `emailVerified: true` (caso contrário, `403 Confirme seu e-mail antes de se tornar autor`).
   - Usuário não possui bloqueio administrativo de promoção (`authorPromotionBlocked === false`; esse bloqueio é ativado quando um `ADMIN` rebaixa um `AUTHOR` para `READER` via `PATCH /api/v1/users/:id`).
   - `version === '1'` e `accepted === true`.
4. O usuário recebe `role = 'AUTHOR'`, `authorRulesAcceptedVersion = '1'` e `authorRulesAcceptedAt = NOW()`, mantendo `firstPostApproved = false`.
5. **Regra do Primeiro Artigo (garantida no código e por constraint `CHECK` no PostgreSQL):**
   - Enquanto `firstPostApproved === false`, o `AUTHOR` **só pode criar rascunhos** (`published: false`, `scheduledAt: null`). Tentar criar ou atualizar com `published: true` ou `scheduledAt` preenchido dispara erro `409 Conflict` (`"O primeiro artigo exige aprovação."`).
   - O autor cria o rascunho (`POST /api/v1/posts`) e o submete para revisão editorial (`POST /api/v1/post-reviews/:id/submit`), mudando `reviewStatus` de `'NONE'` (ou `'REJECTED'`) para `'PENDING'`.
   - Enquanto `reviewStatus === 'PENDING'`, o artigo **não pode ser editado** (`409 O artigo em revisão não pode ser editado.`).
   - Um `ADMIN` avalia a fila em `GET /api/v1/post-reviews` e decide em `POST /api/v1/post-reviews/:id/decision`:
     - `'APPROVED'`: publica o artigo (`published = true`, `publishedAt = NOW()`, `reviewStatus = 'APPROVED'`) e marca `author.firstPostApproved = true`. A partir desse momento, o autor pode publicar e agendar novos artigos diretamente sem revisão prévia.
     - `'REJECTED'`: marca `reviewStatus = 'REJECTED'` e mantém como rascunho para que o autor possa editar e reenviar.

### 5.11. Tabela de Permissões por Role (`READER`, `AUTHOR`, `ADMIN`)

| Funcionalidade / Operação | Anônimo | `READER` | `AUTHOR` | `ADMIN` |
|---|:---:|:---:|:---:|:---:|
| Ler artigos publicados, categorias, tags, séries públicas, autores, comentários, RSS/Atom/Sitemap e registrar views | Sim | Sim | Sim | Sim |
| Criar conta, confirmar e-mail, recuperar senha, assinar/cancelar newsletter | Sim | Sim | Sim | Sim |
| Gerenciar próprio perfil, foto, senha, e-mail, TOTP (2FA), sessões e excluir própria conta | Não | Sim | Sim | Sim |
| Curtir/salvar artigos, criar coleções, seguir autores, ver `/api/v1/feed`, curtir/criar comentários, denunciar conteúdo e ler notificações | Não | Sim | Sim | Sim |
| Editar o próprio comentário (`PATCH /api/v1/comments/:id`) | Não | Sim (próprio) | Sim (próprio) | Sim (qualquer) |
| Excluir comentário (`DELETE /api/v1/comments/:id`) | Não | Sim (próprio) | Sim (próprio ou em artigo de sua autoria) | Sim (qualquer) |
| Solicitar promoção para autor (`POST /api/v1/users/me/author`) | Não | Sim (se e-mail verificado e não bloqueado) | Já é `AUTHOR` (idempotente) | Retorna `400` |
| Criar artigos (`POST /api/v1/posts`) | Não | Não (`403`) | Sim (1º artigo restrito a rascunho) | Sim (publicação direta livre) |
| Editar/excluir artigos, enviar/remover capa, ver/restaurar revisões | Não | Não (`403`) | Sim (apenas artigos próprios e fora de revisão `PENDING`) | Sim (qualquer artigo) |
| Submeter 1º artigo à revisão (`POST /api/v1/post-reviews/:id/submit`) | Não | Não (`403`) | Sim (quando `firstPostApproved = false`) | Não aplicável |
| Criar, editar, ordenar e excluir séries (`POST/PATCH/PUT/DELETE /api/v1/series`) | Não | Não (`403`) | Sim (apenas séries e artigos próprios) | Sim (séries próprias / gerenciar qualquer) |
| Criar, editar e excluir categorias (`POST/PATCH/DELETE /api/v1/categories`) | Não | Não (`403`) | Não (`403`) | Sim |
| Listar todos os usuários (`GET /api/v1/users`), alterar `role`/`isActive` de terceiros | Não | Não (`403`) | Não (`403`) | Sim |
| Aprovar/rejeitar revisões (`GET/POST /api/v1/post-reviews`) | Não | Não (`403`) | Não (`403`) | Sim |
| Listar e julgar denúncias (`GET/PATCH /api/v1/reports`) | Não | Não (`403`) | Não (`403`) | Sim |
| Suspender/restaurar usuários (`POST /api/v1/admin/users/:id/suspension` e `/restore`) | Não | Não (`403`) | Não (`403`) | Sim |
| Consultar analytics e logs de auditoria (`GET /api/v1/admin/analytics/overview`, `/admin/audit-logs`) | Não | Não (`403`) | Não (`403`) | Sim |

---

## 6. Resumo geral de todos os endpoints

A API possui **104 endpoints HTTP** distribuídos em **23 controllers** dentro de **13 módulos HTTP** (além do módulo interno `mail`). Todos os endpoints abaixo possuem o prefixo `/api/v1`.

| # | Módulo | Método | Rota Completa | Autenticação | Roles / Permissão | Status Sucesso | Descrição Resumida |
|---|---|---|---|---|---|---|---|
| 1 | Health | `GET` | `/api/v1/health` | Pública | Qualquer | `200` | Verifica saúde da API e conectividade com PostgreSQL |
| 2 | Auth | `POST` | `/api/v1/auth/login` | Pública | Qualquer | `200` | Autentica por e-mail/senha (+ TOTP opcional) e define cookie `refreshToken` |
| 3 | Auth | `POST` | `/api/v1/auth/refresh` | Pública (Cookie) | Cookie `refreshToken` | `200` | Rotaciona o `refreshToken` e emite novo `access_token` |
| 4 | Auth | `POST` | `/api/v1/auth/logout` | JWT | Autenticado | `200` | Encerra a sessão atual e limpa o cookie `refreshToken` |
| 5 | Auth | `GET` | `/api/v1/auth/sessions` | JWT | Autenticado | `200` | Lista sessões ativas do usuário autenticado |
| 6 | Auth | `DELETE` | `/api/v1/auth/sessions/:id` | JWT | Autenticado (dono) | `204` | Revoga uma sessão específica do usuário |
| 7 | Auth | `POST` | `/api/v1/auth/forgot-password` | Pública | Qualquer | `200` | Solicita envio de token de redefinição de senha por e-mail |
| 8 | Auth | `POST` | `/api/v1/auth/reset-password` | Pública | Qualquer | `200` | Redefine a senha usando o token enviado por e-mail |
| 9 | Auth Social | `GET` | `/api/v1/auth/social/:provider/start` | Pública | Qualquer | `200` | Inicia fluxo OAuth2 (`google` ou `github`) e define cookie `oauthState` |
| 10 | Auth Social | `POST` | `/api/v1/auth/social/:provider/link` | JWT | Autenticado | `200` | Inicia vinculação de conta social ao usuário autenticado |
| 11 | Auth Social | `GET` | `/api/v1/auth/social/:provider/callback` | Pública (Cookie) | Cookie `oauthState` | `200` | Processa callback OAuth2 (login, vínculo ou desafio TOTP) |
| 12 | Auth Social | `POST` | `/api/v1/auth/social/challenge` | Pública | Token `challenge` | `200` | Conclui login social para contas que exigem código TOTP |
| 13 | Auth TOTP | `POST` | `/api/v1/auth/totp/setup` | JWT | Autenticado | `200` | Gera segredo temporário e URI `otpauth://` mediante confirmação de senha |
| 14 | Auth TOTP | `POST` | `/api/v1/auth/totp/enable` | JWT | Autenticado | `200` | Confirma código de 6 dígitos, ativa 2FA e invalida sessões anteriores |
| 15 | Auth TOTP | `POST` | `/api/v1/auth/totp/disable` | JWT | Autenticado | `200` | Desativa 2FA mediante senha + código TOTP e invalida sessões |
| 16 | Users | `GET` | `/api/v1/users/author-rules` | Pública | Qualquer | `200` | Retorna a versão atual e lista de regras para se tornar autor |
| 17 | Users | `POST` | `/api/v1/users/me/author` | JWT | `READER` (ou `AUTHOR`) | `200` | Aceita termos e promove o usuário autenticado para `AUTHOR` |
| 18 | Users | `POST` | `/api/v1/users/confirm-email` | Pública | Qualquer | `200` | Confirma o e-mail de cadastro a partir do token de 64 caracteres hex |
| 19 | Users | `POST` | `/api/v1/users/resend-verification` | Pública | Qualquer | `200` | Reenvia e-mail de confirmação para contas não verificadas |
| 20 | Users | `POST` | `/api/v1/users/confirm-email-change` | Pública | Qualquer | `200` | Confirma alteração de endereço de e-mail e invalida sessões |
| 21 | Users | `POST` | `/api/v1/users/:id/profile-photo` | JWT | Próprio usuário ou `ADMIN` | `201` | Faz upload da foto de perfil (`multipart/form-data`, WebP 512x512) |
| 22 | Users | `POST` | `/api/v1/users` | Pública | Qualquer | `201` | Cadastra novo usuário com papel inicial `READER` |
| 23 | Users | `GET` | `/api/v1/users` | JWT | `ADMIN` | `200` | Lista todos os usuários ativos com paginação |
| 24 | Users | `GET` | `/api/v1/users/:id` | JWT | Autenticado | `200` | Obtém perfil completo (próprio/Admin) ou resumido (outro usuário) |
| 25 | Users | `PATCH` | `/api/v1/users/:id` | JWT | Próprio usuário ou `ADMIN` | `200` | Atualiza dados de perfil, senha, e-mail ou (via Admin) `role`/`isActive` |
| 26 | Users | `DELETE` | `/api/v1/users/:id` | JWT | Próprio usuário ou `ADMIN` | `204` | Desativa (soft delete) a conta do usuário e revoga sessões |
| 27 | Posts | `GET` | `/api/v1/posts` | Pública | Qualquer | `200` | Lista artigos publicados com busca, filtros e paginação offset ou cursor |
| 28 | Posts | `GET` | `/api/v1/posts/me` | JWT | Autenticado | `200` | Lista todos os artigos ativos (incluindo rascunhos) do próprio usuário |
| 29 | Posts | `GET` | `/api/v1/posts/:id/related` | Pública | Qualquer | `200` | Retorna até 4 artigos publicados relacionados por tags/categorias |
| 30 | Posts | `GET` | `/api/v1/posts/:id` | JWT Opcional | Público (ou dono/`ADMIN` p/ rascunho) | `200` | Busca artigo por UUID, `slug` ou `legacySlug` (inclui `content` e `series`) |
| 31 | Posts | `POST` | `/api/v1/posts` | JWT | `AUTHOR`, `ADMIN` | `201` | Cria novo artigo (rascunho, publicado ou agendado) |
| 32 | Posts | `PATCH` | `/api/v1/posts/:id` | JWT | Dono (`AUTHOR`) ou `ADMIN` | `200` | Atualiza artigo existente e grava snapshot de revisão |
| 33 | Posts | `POST` | `/api/v1/posts/:id/cover-image` | JWT | Dono (`AUTHOR`) ou `ADMIN` | `201` | Faz upload de imagem de capa do artigo (`multipart/form-data`, WebP 1920x1080) |
| 34 | Posts | `DELETE` | `/api/v1/posts/:id/cover-image` | JWT | Dono (`AUTHOR`) ou `ADMIN` | `200` | Remove a imagem de capa do artigo |
| 35 | Posts | `DELETE` | `/api/v1/posts/:id` | JWT | Dono (`AUTHOR`) ou `ADMIN` | `204` | Desativa (soft delete) um artigo |
| 36 | Post Interactions | `GET` | `/api/v1/posts/saved` | JWT | Autenticado | `200` | Lista artigos salvos (favoritados) pelo usuário autenticado |
| 37 | Post Interactions | `GET` | `/api/v1/posts/:id/interaction` | JWT | Autenticado | `200` | Retorna estado `{ liked, saved, likes }` do usuário para o artigo |
| 38 | Post Interactions | `PUT` | `/api/v1/posts/:id/like` | JWT | Autenticado | `204` | Curte um artigo publicado (idempotente) e notifica o autor |
| 39 | Post Interactions | `DELETE` | `/api/v1/posts/:id/like` | JWT | Autenticado | `204` | Remove a curtida de um artigo publicado |
| 40 | Post Interactions | `PUT` | `/api/v1/posts/:id/save` | JWT | Autenticado | `204` | Salva (favorita) um artigo publicado (idempotente) |
| 41 | Post Interactions | `DELETE` | `/api/v1/posts/:id/save` | JWT | Autenticado | `204` | Remove um artigo dos salvos |
| 42 | Post Views | `GET` | `/api/v1/posts/trending` | Pública | Qualquer | `200` | Lista artigos em alta nos últimos 7 dias UTC ordenados por visualizações |
| 43 | Post Views | `POST` | `/api/v1/posts/:id/views` | Pública | Qualquer | `200` | Registra visualização deduplicada por IP + artigo + dia UTC |
| 44 | Post Reviews | `POST` | `/api/v1/post-reviews/:id/submit` | JWT | Dono (`AUTHOR` s/ 1º post aprovado) | `201` | Envia o primeiro artigo em rascunho para fila de revisão editorial |
| 45 | Post Reviews | `GET` | `/api/v1/post-reviews` | JWT | `ADMIN` | `200` | Lista até 100 artigos com `reviewStatus = 'PENDING'` |
| 46 | Post Reviews | `POST` | `/api/v1/post-reviews/:id/decision` | JWT | `ADMIN` | `201` | Aprova (publicando e liberando o autor) ou rejeita artigo em revisão |
| 47 | Post Revisions | `GET` | `/api/v1/posts/:postId/revisions` | JWT | Dono (`AUTHOR`) ou `ADMIN` | `200` | Lista histórico paginado de revisões de um artigo |
| 48 | Post Revisions | `GET` | `/api/v1/posts/:postId/revisions/:revisionId` | JWT | Dono (`AUTHOR`) ou `ADMIN` | `200` | Obtém o conteúdo completo de uma revisão específica |
| 49 | Post Revisions | `POST` | `/api/v1/posts/:postId/revisions/:revisionId/restore` | JWT | Dono (`AUTHOR`) ou `ADMIN` | `201` | Restaura título e conteúdo de uma revisão no artigo |
| 50 | Series | `GET` | `/api/v1/series/me` | JWT | `AUTHOR`, `ADMIN` | `200` | Lista séries pertencentes ao autor autenticado |
| 51 | Series | `GET` | `/api/v1/series/:id/manage` | JWT | Dono (`AUTHOR`) ou `ADMIN` | `200` | Detalha série para gestão (inclui artigos em rascunho) |
| 52 | Series | `GET` | `/api/v1/series/:id` | Pública | Qualquer | `200` | Detalha série pública por UUID ou slug (apenas artigos publicados) |
| 53 | Series | `POST` | `/api/v1/series` | JWT | `AUTHOR`, `ADMIN` | `201` | Cria uma nova série de artigos |
| 54 | Series | `PATCH` | `/api/v1/series/:id` | JWT | Dono (`AUTHOR`) ou `ADMIN` | `200` | Atualiza título e/ou descrição de uma série |
| 55 | Series | `PUT` | `/api/v1/series/:id/items` | JWT | Dono (`AUTHOR`) ou `ADMIN` | `200` | Define/reordena a lista de artigos (`postIds`) de uma série |
| 56 | Series | `DELETE` | `/api/v1/series/:id` | JWT | Dono (`AUTHOR`) ou `ADMIN` | `204` | Remove uma série e desvincula seus itens |
| 57 | Series Nav | `GET` | `/api/v1/posts/:postId/series` | Pública | Qualquer | `200` | Obtém dados da série à qual um artigo publicado pertence |
| 58 | Authors | `GET` | `/api/v1/authors/:id` | Pública | Qualquer | `200` | Retorna perfil público do autor e contagem de publicações |
| 59 | Author Follows | `GET` | `/api/v1/feed` | JWT | Autenticado | `200` | Lista feed paginado de artigos publicados pelos autores seguidos |
| 60 | Author Follows | `GET` | `/api/v1/authors/:id/follow` | JWT | Autenticado | `200` | Verifica se o usuário autenticado segue o autor (`{ following }`) |
| 61 | Author Follows | `PUT` | `/api/v1/authors/:id/follow` | JWT | Autenticado | `204` | Passa a seguir um autor ativo (`AUTHOR` ou `ADMIN`) |
| 62 | Author Follows | `DELETE` | `/api/v1/authors/:id/follow` | JWT | Autenticado | `204` | Deixa de seguir um autor |
| 63 | Feeds & Sitemap | `GET` | `/api/v1/feed/rss` | Pública | Qualquer | `200` | Feed RSS 2.0 dos 50 artigos publicados mais recentes (`application/rss+xml`) |
| 64 | Feeds & Sitemap | `GET` | `/api/v1/feed.xml` | Pública | Qualquer | `200` | Alias do Feed RSS 2.0 (`application/rss+xml`) |
| 65 | Feeds & Sitemap | `GET` | `/api/v1/feed/atom` | Pública | Qualquer | `200` | Feed Atom 1.0 dos 50 artigos publicados mais recentes (`application/atom+xml`) |
| 66 | Feeds & Sitemap | `GET` | `/api/v1/sitemap.xml` | Pública | Qualquer | `200` | Sitemap XML com home, artigos publicados e categorias (`application/xml`) |
| 67 | Collections | `POST` | `/api/v1/collections` | JWT | Autenticado | `201` | Cria uma coleção privada de artigos salvos |
| 68 | Collections | `GET` | `/api/v1/collections` | JWT | Autenticado | `200` | Lista todas as coleções privadas do usuário autenticado |
| 69 | Collections | `PATCH` | `/api/v1/collections/:id` | JWT | Autenticado (dono) | `200` | Renomeia uma coleção privada |
| 70 | Collections | `DELETE` | `/api/v1/collections/:id` | JWT | Autenticado (dono) | `204` | Exclui uma coleção privada |
| 71 | Collections | `GET` | `/api/v1/collections/:id/posts` | JWT | Autenticado (dono) | `200` | Lista artigos publicados contidos em uma coleção privada |
| 72 | Collections | `PUT` | `/api/v1/collections/:id/posts/:postId` | JWT | Autenticado (dono) | `204` | Adiciona um artigo publicado à coleção privada |
| 73 | Collections | `DELETE` | `/api/v1/collections/:id/posts/:postId` | JWT | Autenticado (dono) | `204` | Remove um artigo da coleção privada |
| 74 | Categories | `GET` | `/api/v1/categories` | Pública | Qualquer | `200` | Lista categorias ativas com paginação e filtro `search` |
| 75 | Categories | `GET` | `/api/v1/categories/:idOrSlug` | Pública | Qualquer | `200` | Busca categoria ativa por UUID ou `slug` |
| 76 | Categories | `GET` | `/api/v1/categories/:idOrSlug/posts` | Pública | Qualquer | `200` | Lista artigos publicados de uma categoria (por UUID ou `slug`) |
| 77 | Categories | `POST` | `/api/v1/categories` | JWT | `ADMIN` | `201` | Cria categoria (ou reativa categoria inativa de mesmo nome/slug) |
| 78 | Categories | `PATCH` | `/api/v1/categories/:id` | JWT | `ADMIN` | `200` | Atualiza nome, descrição ou slug de uma categoria |
| 79 | Categories | `DELETE` | `/api/v1/categories/:id` | JWT | `ADMIN` | `204` | Desativa (soft delete) uma categoria |
| 80 | Tags | `GET` | `/api/v1/tags` | Pública | Qualquer | `200` | Lista tags com paginação e filtro `search` |
| 81 | Tags | `GET` | `/api/v1/tags/:slug` | Pública | Qualquer | `200` | Busca detalhes de uma tag pelo `slug` |
| 82 | Comments | `GET` | `/api/v1/posts/:postId/comments` | Pública | Qualquer | `200` | Lista comentários raiz de um artigo (inclui até 5 respostas iniciais cada) |
| 83 | Comments | `GET` | `/api/v1/posts/:postId/comments/:id/replies` | Pública | Qualquer | `200` | Lista respostas paginadas de um comentário raiz |
| 84 | Comments | `POST` | `/api/v1/posts/:postId/comments` | JWT | Autenticado | `201` | Cria comentário raiz ou resposta (`replyToId`) em artigo com comentários ativos |
| 85 | Comments | `PATCH` | `/api/v1/comments/:id` | JWT | Autor do comentário ou `ADMIN` | `200` | Edita o texto de um comentário ativo |
| 86 | Comments | `DELETE` | `/api/v1/comments/:id` | JWT | Autor do comentário, autor do post ou `ADMIN` | `204` | Desativa comentário (substitui texto por `'Comentário excluído'`) |
| 87 | Comment Likes | `GET` | `/api/v1/comments/:id/like` | JWT | Autenticado | `200` | Obtém estado de curtida e total de likes de um comentário (`{ liked, likes }`) |
| 88 | Comment Likes | `PUT` | `/api/v1/comments/:id/like` | JWT | Autenticado | `204` | Curte um comentário ativo (idempotente) |
| 89 | Comment Likes | `DELETE` | `/api/v1/comments/:id/like` | JWT | Autenticado | `204` | Remove curtida de um comentário |
| 90 | Notifications | `GET` | `/api/v1/notifications` | JWT | Autenticado | `200` | Lista notificações paginadas do usuário e contagem `unread` |
| 91 | Notifications | `PATCH` | `/api/v1/notifications/read-all` | JWT | Autenticado | `204` | Marca todas as notificações não lidas do usuário como lidas |
| 92 | Notifications | `PATCH` | `/api/v1/notifications/:id/read` | JWT | Autenticado (dono) | `204` | Marca uma notificação específica como lida |
| 93 | Newsletter | `GET` | `/api/v1/newsletter/confirm` | Pública | Qualquer | `200` (HTML) | Confirma inscrição na newsletter via link clicável (`?token=...`) |
| 94 | Newsletter | `GET` | `/api/v1/newsletter/unsubscribe` | Pública | Qualquer | `200` (HTML) | Cancela inscrição na newsletter via link clicável (`?token=...`) |
| 95 | Newsletter | `POST` | `/api/v1/newsletter/subscribe` | Pública | Qualquer | `200` | Solicita inscrição na newsletter (envia e-mail de double opt-in) |
| 96 | Newsletter | `POST` | `/api/v1/newsletter/confirm` | Pública | Qualquer | `200` | Confirma inscrição na newsletter via JSON (`{ token }`) |
| 97 | Newsletter | `POST` | `/api/v1/newsletter/unsubscribe` | Pública | Qualquer | `200` | Cancela inscrição na newsletter via JSON (`{ token }`) |
| 98 | Reports | `POST` | `/api/v1/reports` | JWT | Autenticado | `201` | Registra denúncia contra artigo (`POST`) ou comentário (`COMMENT`) |
| 99 | Reports | `GET` | `/api/v1/reports` | JWT | `ADMIN` | `200` | Lista denúncias com paginação e filtro por `status` |
| 100 | Reports | `PATCH` | `/api/v1/reports/:id` | JWT | `ADMIN` | `200` | Resolve (`RESOLVED`) ou arquiva (`DISMISSED`) uma denúncia |
| 101 | Moderation | `POST` | `/api/v1/admin/users/:id/suspension` | JWT | `ADMIN` | `201` | Suspende usuário, revoga sessões e opcionalmente oculta artigos |
| 102 | Moderation | `POST` | `/api/v1/admin/users/:id/restore` | JWT | `ADMIN` | `201` | Restaura usuário suspenso e reativa artigos ocultados na suspensão |
| 103 | Analytics | `GET` | `/api/v1/admin/analytics/overview` | JWT | `ADMIN` | `200` | Retorna contadores consolidados de usuários, artigos, comentários e denúncias |
| 104 | Audit Logs | `GET` | `/api/v1/admin/audit-logs` | JWT | `ADMIN` | `200` | Lista trilha de auditoria administrativa paginada |

*(Total exato: **104 rotas HTTP registradas** em **23 controllers** distribuídos nos **13 módulos HTTP** da aplicação).*

---

## 7. Referência detalhada dos endpoints por módulo

> **Convenções gerais aplicadas a todos os endpoints:**
> - **Headers para rotas autenticadas (JWT):** `Authorization: Bearer <access_token>`
> - **Headers para rotas com body JSON:** `Content-Type: application/json`
> - **Rate Limit padrão:** `100 requisições / 60s` por IP, salvo quando indicado limite específico (`@Throttle`).
> - **Validação de DTO:** Propriedades não documentadas no body retornam `400 Bad Request` (`forbidNonWhitelisted: true`).

---

### 7.1. Health Check
Controller: `src/common/health.controller.ts`

#### `GET /api/v1/health`
- **Descrição:** Verifica se a aplicação está no ar e executa um `pingCheck('database')` no PostgreSQL via `@nestjs/terminus`.
- **Autenticação / Roles:** Pública.
- **Parâmetros (Rota / Query / Body):** Nenhum.
- **Status de Sucesso:** `200 OK`
- **Formato da Resposta (`200 OK`):**
  ```json
  {
    "status": "ok",
    "info": { "database": { "status": "up" } },
    "error": {},
    "details": { "database": { "status": "up" } }
  }
  ```
- **Possíveis Erros:** `503 Service Unavailable` (quando o PostgreSQL está inacessível).

---

### 7.2. Autenticação e Sessões (`auth`)
Controller: `src/modules/auth/auth.controller.ts`

#### `POST /api/v1/auth/login`
- **Descrição:** Autentica usuário com e-mail e senha (e código TOTP se 2FA estiver ativo), retorna `access_token` JWT e define o cookie `HttpOnly` `refreshToken` (`Path=/api/v1/auth`, `SameSite=Strict`, `Max-Age=604800`).
- **Autenticação / Roles:** Pública. Rate limit: **20 req/min**.
- **Request Body (`LoginDto`):**
  | Campo | Tipo | Obrigatório | Validação |
  |---|---|---|---|
  | `email` | `string` | Sim | `@IsEmail()`, `@IsNotEmpty()` (normalizado com `trim().toLowerCase()`) |
  | `password` | `string` | Sim | `@IsString()`, `@IsNotEmpty()`, `@MaxLength(72)` |
  | `totpCode` | `string` | Condicional | `@IsOptional()`, `@Matches(/^\d{6}$/)` (obrigatório se `totpEnabled = true`) |
- **Status de Sucesso:** `200 OK`
- **Resposta:** `{ "access_token": "<jwt>", "token_type": "Bearer", "expires_in": 900 }` + Header `Set-Cookie: refreshToken=...; Path=/api/v1/auth; HttpOnly; SameSite=Strict`.
- **Erros:**
  - `400`: Campos inválidos.
  - `401`: `"E-mail ou senha incorretos"`, `"Confirme seu e-mail antes de fazer login."`, `"Conta temporariamente bloqueada. Tente novamente mais tarde."` (após 5 falhas consecutivas), `"Código de dois fatores inválido."`.
  - `403`: `"Conta suspensa."` (retorna também `reason` e `endsAt`).

#### `POST /api/v1/auth/refresh`
- **Descrição:** Lê o cookie `refreshToken` (ou `refresh_token`), valida a sessão em `auth_sessions`, rotaciona o segredo do refresh token (atualizando o cookie `Set-Cookie`) e retorna novo `access_token`.
- **Autenticação / Roles:** Pública (baseada no cookie `HttpOnly` enviado em `/api/v1/auth`).
- **Headers necessários:** `Cookie: refreshToken=<sessionId>.<secret>`
- **Request Body:** Nenhum.
- **Status de Sucesso:** `200 OK`
- **Resposta:** `{ "access_token": "<jwt>", "token_type": "Bearer", "expires_in": 900 }` + novo cookie `refreshToken`.
- **Erros:** `401 Unauthorized` (`"Refresh token ausente"` ou `"Refresh token inválido ou expirado"`). Reuso de token já rotacionado apaga a sessão inteira e limpa o cookie.

#### `POST /api/v1/auth/logout`
- **Descrição:** Revoga a sessão atual no banco (`auth_sessions`) e instrui o navegador a limpar o cookie `refreshToken`.
- **Autenticação / Roles:** JWT (`JwtAuthGuard`). Qualquer role.
- **Headers:** `Authorization: Bearer <access_token>` (e opcionalmente `Cookie: refreshToken=...`).
- **Status de Sucesso:** `200 OK`
- **Resposta:** `{ "message": "Logout realizado com sucesso." }`
- **Erros:** `401 Unauthorized`.

#### `GET /api/v1/auth/sessions`
- **Descrição:** Lista todas as sessões ativas (não expiradas) do usuário autenticado, ordenadas por `lastUsedAt DESC`.
- **Autenticação / Roles:** JWT (`JwtAuthGuard`). Qualquer role.
- **Status de Sucesso:** `200 OK`
- **Resposta:**
  ```json
  [
    {
      "id": "b63f9e53-7c52-4962-84c6-70e2e3bd7f98",
      "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
      "createdAt": "2026-04-19T12:00:00.000-03:00",
      "lastUsedAt": "2026-04-19T12:15:00.000-03:00",
      "expiresAt": "2026-04-26T12:00:00.000-03:00",
      "current": true
    }
  ]
  ```
- **Erros:** `401 Unauthorized`.

#### `DELETE /api/v1/auth/sessions/:id`
- **Descrição:** Revoga uma sessão específica pertencente ao usuário autenticado.
- **Autenticação / Roles:** JWT (`JwtAuthGuard`). Qualquer role.
- **Parâmetros de Rota:** `id` (`UUID` v4 da sessão).
- **Status de Sucesso:** `204 No Content`
- **Erros:** `400` (UUID inválido), `401`, `404` (`"Sessão não encontrada"`).

#### `POST /api/v1/auth/forgot-password`
- **Descrição:** Gera um token de redefinição de senha válido por 1 hora e enfileira e-mail para o usuário (se existir e estiver ativo).
- **Autenticação / Roles:** Pública. Rate limit: **5 req/min**.
- **Request Body (`ForgotPasswordDto`):** `{ "email": "usuario@exemplo.com" }` (`@IsEmail()`, `@IsNotEmpty()`).
- **Status de Sucesso:** `200 OK`
- **Resposta:** `{ "message": "Se o e-mail estiver cadastrado, enviaremos instruções de recuperação." }`
- **Erros:** `400 Bad Request`, `429 Too Many Requests`.

#### `POST /api/v1/auth/reset-password`
- **Descrição:** Redefine a senha do usuário a partir do token de 64 caracteres hexadecimais recebido por e-mail, incrementa `authVersion` e invalida todas as sessões.
- **Autenticação / Roles:** Pública. Rate limit: **10 req/min**.
- **Request Body (`ResetPasswordDto`):**
  | Campo | Tipo | Obrigatório | Validação |
  |---|---|---|---|
  | `token` | `string` | Sim | `@Matches(/^[a-f0-9]{64}$/i)` |
  | `newPassword` | `string` | Sim | `@MinLength(8)`, `@MaxLength(72)` e `<= 72 bytes` em UTF-8 |
- **Status de Sucesso:** `200 OK`
- **Resposta:** `{ "message": "Senha redefinida com sucesso." }`
- **Erros:** `400 Bad Request` (`"Token inválido ou expirado"` ou validação de senha).

---

### 7.3. Autenticação Social OAuth2 (`auth/social`)
Controller: `src/modules/auth/social-auth.controller.ts`

#### `GET /api/v1/auth/social/:provider/start`
- **Descrição:** Gera URL de autorização OAuth2 para `google` ou `github` e grava cookie `oauthState` (`HttpOnly`, `SameSite=Lax`, `Path=/api/v1/auth/social`, 10 min).
- **Autenticação / Roles:** Pública. Rate limit: **10 req/min**.
- **Parâmetros de Rota:** `provider` (`'google'` | `'github'`).
- **Status de Sucesso:** `200 OK` -> `{ "url": "https://accounts.google.com/o/oauth2/v2/auth?..." }`
- **Erros:** `400` (`"Provedor social inválido."`), `503` (`"Provedor social não configurado."`).

#### `POST /api/v1/auth/social/:provider/link`
- **Descrição:** Inicia fluxo OAuth2 para vincular uma conta Google ou GitHub ao usuário autenticado.
- **Autenticação / Roles:** JWT (`JwtAuthGuard`). Rate limit: **10 req/min**.
- **Parâmetros de Rota:** `provider` (`'google'` | `'github'`).
- **Status de Sucesso:** `200 OK` -> `{ "url": "https://github.com/login/oauth/authorize?..." }`
- **Erros:** `400`, `401`, `503`.

#### `GET /api/v1/auth/social/:provider/callback`
- **Descrição:** Recebe `code` e `state` do provedor OAuth2, valida o cookie `oauthState` e autentica, vincula ou solicita TOTP.
- **Autenticação / Roles:** Pública (exige cookie `oauthState`). Rate limit: **20 req/min**.
- **Parâmetros de Rota:** `provider` (`'google'` | `'github'`).
- **Query Parameters (`SocialCallbackDto`):** `code` (`string`, máx 512), `state` (`string`, máx 1024).
- **Status de Sucesso:** `200 OK`
- **Formatos possíveis de Resposta:**
  - Login direto (define também cookie `refreshToken`): `{ "access_token": "...", "token_type": "Bearer", "expires_in": 900 }`
  - Conta com 2FA ativo: `{ "requires_totp": true, "challenge": "<jwt>", "expires_in": 300 }`
  - Vínculo concluído: `{ "linked": true }`
- **Erros:** `400`, `401` (`"Estado OAuth inválido."`, `"E-mail do provedor não verificado."`), `403` (`"Conta suspensa."`), `409` (`"Conta social já vinculada a outro usuário."`).

#### `POST /api/v1/auth/social/challenge`
- **Descrição:** Valida o código TOTP de 6 dígitos para concluir um login social que retornou `requires_totp: true`.
- **Autenticação / Roles:** Pública. Rate limit: **5 req/min**.
- **Request Body (`SocialChallengeDto`):** `{ "challenge": "<jwt-challenge>", "code": "123456" }`
- **Status de Sucesso:** `200 OK` -> `{ "access_token": "...", "token_type": "Bearer", "expires_in": 900 }` + cookie `refreshToken`.
- **Erros:** `401` (`"Desafio inválido ou expirado."`, `"Código de dois fatores inválido."`), `403`.

---

### 7.4. Autenticação de Dois Fatores — TOTP (`auth/totp`)
Controller: `src/modules/auth/totp.controller.ts`

#### `POST /api/v1/auth/totp/setup`
- **Descrição:** Inicia configuração de 2FA verificando a senha atual do usuário e gerando um segredo TOTP pendente por 10 minutos.
- **Autenticação / Roles:** JWT (`JwtAuthGuard`). Rate limit: **5 req/min**.
- **Request Body (`TotpPasswordDto`):** `{ "password": "SenhaAtual123" }` (`@IsString()`, `@IsNotEmpty()`, `@MaxLength(72)`).
- **Status de Sucesso:** `200 OK`
- **Resposta:**
  ```json
  {
    "secret": "JBSWY3DPEHPK3PXP...",
    "otpauthUri": "otpauth://totp/Blog%20API:usuario%40exemplo.com?secret=...&issuer=Blog%20API&algorithm=SHA1&digits=6&period=30",
    "expiresIn": 600
  }
  ```
- **Erros:** `401` (`"Senha incorreta."`), `409` (`"Autenticação em dois fatores já está ativa."`).

#### `POST /api/v1/auth/totp/enable`
- **Descrição:** Valida o código de 6 dígitos contra o segredo pendente, ativa `totpEnabled = true`, incrementa `authVersion` e encerra todas as sessões.
- **Autenticação / Roles:** JWT (`JwtAuthGuard`). Rate limit: **5 req/min**.
- **Request Body (`TotpCodeDto`):** `{ "code": "123456" }` (`@Matches(/^\d{6}$/)`).
- **Status de Sucesso:** `200 OK` -> `{ "enabled": true }`
- **Erros:** `400` (`"Configuração TOTP não iniciada ou expirada."`), `401` (`"Código TOTP inválido."`), `409` (`"Autenticação em dois fatores já está ativa."`).

#### `POST /api/v1/auth/totp/disable`
- **Descrição:** Desativa o 2FA após validar a senha atual e um código TOTP válido, incrementando `authVersion` e encerrando todas as sessões.
- **Autenticação / Roles:** JWT (`JwtAuthGuard`). Rate limit: **5 req/min**.
- **Request Body (`TotpDisableDto`):** `{ "password": "SenhaAtual123", "code": "123456" }`.
- **Status de Sucesso:** `200 OK` -> `{ "enabled": false }`
- **Erros:** `400` (`"Autenticação em dois fatores não está ativa."`), `401` (`"Senha incorreta."` ou `"Código TOTP inválido."`).

---

### 7.5. Usuários e Promoção de Autor (`users`)
Controller: `src/modules/users/users.controller.ts`

#### `GET /api/v1/users/author-rules`
- **Descrição:** Retorna a versão vigente e a lista de regras editoriais para promoção de leitor a autor.
- **Autenticação / Roles:** Pública.
- **Status de Sucesso:** `200 OK`
- **Resposta:**
  ```json
  {
    "version": "1",
    "rules": [
      "Publicar apenas conteúdo autoral ou com direito de uso.",
      "Não publicar spam, discurso de ódio, assédio ou conteúdo ilegal.",
      "O primeiro artigo exige aprovação de um administrador antes de ser publicado.",
      "Artigos seguintes serão publicados diretamente e continuam sujeitos à moderação."
    ]
  }
  ```

#### `POST /api/v1/users/me/author`
- **Descrição:** Promove o usuário autenticado de `READER` para `AUTHOR` mediante aceite explícito das regras vigentes (`version: "1"`). Se o usuário já for `AUTHOR`, retorna sucesso de forma idempotente.
- **Autenticação / Roles:** JWT (`JwtAuthGuard`).
- **Request Body (`AcceptAuthorRulesDto`):**
  | Campo | Tipo | Obrigatório | Validação |
  |---|---|---|---|
  | `version` | `string` | Sim | `@IsNotEmpty()`, `@MaxLength(16)` — deve ser `"1"` |
  | `accepted` | `boolean` | Sim | `@Equals(true)` |
- **Status de Sucesso:** `200 OK` -> `{ "role": "AUTHOR", "rulesVersion": "1" }`
- **Erros:**
  - `400`: Versão das regras inválida ou usuário é `ADMIN` (`"Administradores não podem alterar o papel por esta rota"`).
  - `403`: `"Confirme seu e-mail antes de se tornar autor"` ou `"Promoção para autor bloqueada para esta conta"`.

#### `POST /api/v1/users/confirm-email`
- **Descrição:** Confirma o e-mail de cadastro usando o token hexadecimal de 64 caracteres enviado por e-mail.
- **Autenticação / Roles:** Pública. Rate limit: **10 req/min**.
- **Request Body (`ConfirmEmailDto`):** `{ "token": "<64-hex>" }` (`@Matches(/^[a-f0-9]{64}$/i)`).
- **Status de Sucesso:** `200 OK` -> `{ "message": "E-mail confirmado com sucesso." }`
- **Erros:** `400` (`"Token inválido ou expirado"`).

#### `POST /api/v1/users/resend-verification`
- **Descrição:** Reenvia e-mail de confirmação se a conta existir, estiver ativa e ainda não estiver verificada.
- **Autenticação / Roles:** Pública. Rate limit: **5 req/min**.
- **Request Body (`ResendVerificationDto`):** `{ "email": "usuario@exemplo.com" }`.
- **Status de Sucesso:** `200 OK` -> `{ "message": "Se o e-mail corresponder a uma conta pendente, enviaremos um novo link." }`

#### `POST /api/v1/users/confirm-email-change`
- **Descrição:** Efetiva a troca de e-mail solicitada em `PATCH /api/v1/users/:id`, incrementa `authVersion` e invalida todas as sessões.
- **Autenticação / Roles:** Pública. Rate limit: **10 req/min**.
- **Request Body (`ConfirmEmailDto`):** `{ "token": "<64-hex>" }`.
- **Status de Sucesso:** `200 OK` -> `{ "message": "E-mail confirmado com sucesso." }`
- **Erros:** `400` (`"Token inválido ou expirado"`), `409` (`"Este e-mail já está em uso"`).

#### `POST /api/v1/users/:id/profile-photo`
- **Descrição:** Faz upload e processamento da foto de perfil do usuário (convertida para WebP 512x512). Veja detalhes completos na [Seção 11](#11-upload-de-arquivos).
- **Autenticação / Roles:** JWT (`JwtAuthGuard`). Próprio usuário (`req.user.id === :id`) ou `ADMIN`.
- **Parâmetros de Rota:** `id` (`UUID`).
- **Headers:** `Content-Type: multipart/form-data`
- **Request Body:** Form field `file` (JPEG, PNG ou WebP, máx 5 MB).
- **Status de Sucesso:** `201 Created` -> Objeto `UserResponseDto` atualizado com `"profilePhoto": "/uploads/profile-photos/<uuid>.webp"`.
- **Erros:** `400` (arquivo ausente ou assinatura binária inválida), `403`, `409` (`"Atualização concorrente da foto de perfil. Tente novamente."`), `413` (> 5 MB).

#### `POST /api/v1/users`
- **Descrição:** Cadastra um novo usuário (`READER`) e enfileira e-mail de confirmação.
- **Autenticação / Roles:** Pública.
- **Request Body (`CreateUserDto`):**
  | Campo | Tipo | Obrigatório | Validação |
  |---|---|---|---|
  | `name` | `string` | Sim | 2 a 150 caracteres após sanitização de texto plano |
  | `email` | `string` | Sim | E-mail válido, máx 255 caracteres (normalizado para minúsculas) |
  | `password` | `string` | Sim | 8 a 72 caracteres e máximo de 72 bytes UTF-8 |
- **Status de Sucesso:** `201 Created`
- **Resposta:** `UserResponseDto` (`id`, `name`, `email`, `profilePhoto`, `bio`, `websiteUrl`, `socialUrl`, `role`, `isActive`, `createdAt`, `updatedAt`).
- **Erros:** `400` (validação), `409 Conflict` (`"Este e-mail já está em uso"`).

#### `GET /api/v1/users`
- **Descrição:** Lista todos os usuários ativos (`isActive: true`) com paginação.
- **Autenticação / Roles:** JWT + `RolesGuard` (`@Roles(UserRole.ADMIN)`).
- **Query Parameters (`PaginationQueryDto`):** `page` (padrão `1`), `limit` (padrão `10`, máx `100`).
- **Status de Sucesso:** `200 OK` -> `PaginatedResult<UserResponseDto>`.
- **Erros:** `401`, `403`.

#### `GET /api/v1/users/:id`
- **Descrição:** Busca dados de um usuário ativo por UUID.
  - Se o solicitante for o **próprio usuário**, retorna perfil completo incluindo `"firstPostApproved": boolean`.
  - Se o solicitante for **`ADMIN`** consultando outro usuário, retorna perfil completo (`email`, `role`, `isActive`, etc., sem `firstPostApproved`).
  - Se o solicitante for **outro usuário comum (`READER`/`AUTHOR`)**, retorna apenas o perfil público: `{ id, name, profilePhoto, createdAt }`.
- **Autenticação / Roles:** JWT (`JwtAuthGuard`).
- **Parâmetros de Rota:** `id` (`UUID`).
- **Status de Sucesso:** `200 OK`
- **Erros:** `400` (UUID inválido), `401`, `404` (`"Usuário com ID ... não encontrado"`).

#### `PATCH /api/v1/users/:id`
- **Descrição:** Atualiza dados do usuário.
- **Autenticação / Roles:** JWT (`JwtAuthGuard`). Próprio usuário ou `ADMIN`.
- **Request Body (`UpdateUserDto` — todos os campos são opcionais):**
  | Campo | Tipo | Quem pode alterar | Regras e Validações |
  |---|---|---|---|
  | `name` | `string` | Próprio ou `ADMIN` | 2 a 150 caracteres (texto plano sanitizado) |
  | `bio` | `string \| null` | Próprio ou `ADMIN` | Máx 500 caracteres (`""` vira `null`) |
  | `websiteUrl` | `string \| null` | Próprio ou `ADMIN` | URL `http://` ou `https://` válida, máx 2048 chars (`""` vira `null`) |
  | `socialUrl` | `string \| null` | Próprio ou `ADMIN` | URL `http://` ou `https://` válida, máx 2048 chars (`""` vira `null`) |
  | `currentPassword` | `string` | Próprio usuário | Obrigatório ao alterar `password` ou `email` (máx 72 chars) |
  | `password` | `string` | Apenas próprio usuário | 8 a 72 chars / bytes; exige `currentPassword`; invalida todas as sessões |
  | `email` | `string` | Apenas próprio usuário | Exige `currentPassword`; grava em `pendingEmail` e envia link para `/confirmar-email?token=...&type=email-change` |
  | `role` | `UserRole` | Apenas `ADMIN` | `'READER' \| 'AUTHOR' \| 'ADMIN'`. Rebaixar `AUTHOR` -> `READER` define `authorPromotionBlocked = true` e rejeita posts `PENDING` |
  | `isActive` | `boolean` | Apenas `ADMIN` | Se `false`, incrementa `authVersion` e apaga sessões |
- **Status de Sucesso:** `200 OK` -> `UserResponseDto`.
- **Erros:** `400` (senha atual ausente ou nova senha igual à atual), `401` (`"Senha atual incorreta"`), `403` (tentativa de alterar outro usuário ou campos restritos), `404`, `409` (e-mail em uso).

#### `DELETE /api/v1/users/:id`
- **Descrição:** Realiza soft delete da conta (`isActive = false`), incrementa `authVersion` e apaga todas as sessões.
- **Autenticação / Roles:** JWT (`JwtAuthGuard`). Próprio usuário ou `ADMIN`.
- **Parâmetros de Rota:** `id` (`UUID`).
- **Status de Sucesso:** `204 No Content`
- **Erros:** `401`, `403`, `404`.

---

### 7.6. Artigos (`posts`)
Controller: `src/modules/posts/posts.controller.ts`

#### `GET /api/v1/posts`
- **Descrição:** Lista artigos públicos (`published: true`, `isActive: true`). Não retorna o campo `content` para economizar banda, mas calcula e retorna `readingTimeMinutes` (estimado a 200 palavras/minuto, mínimo 1). Cacheada em Redis por 60s para requisições anônimas.
- **Autenticação / Roles:** Pública.
- **Query Parameters (`FindPostsQueryDto`):**
  | Parâmetro | Tipo | Padrão | Descrição / Validação |
  |---|---|---|---|
  | `page` | `number` | `1` | Página (`>= 1`). Ignorado quando `cursor` é enviado. |
  | `limit` | `number` | `10` | Itens por página (`1` a `100`). |
  | `cursor` | `string` | `undefined` | `'start'` para iniciar paginação por cursor (keyset) ou token `nextCursor` retornado na página anterior. |
  | `search` | `string` | `undefined` | Busca full-text (`websearch_to_tsquery('blog_portuguese', ...)`) combinada com `unaccent` + `ILIKE` em título e conteúdo (máx 100 chars). |
  | `author` | `string` | `undefined` | Filtro parcial (`ILIKE`) pelo nome do autor (máx 150 chars). |
  | `authorId` | `UUID` | `undefined` | Filtro exato pelo UUID v4 do autor. |
  | `categoryName` | `string` | `undefined` | Filtro parcial (`ILIKE`) pelo nome da categoria (máx 100 chars). |
  | `categoryId` | `UUID` | `undefined` | Filtro exato pelo UUID v4 da categoria. |
  | `categorySlug` | `string` | `undefined` | Filtro exato pelo `slug` da categoria (`^[a-z0-9]+(?:-[a-z0-9]+)*$`, máx 120 chars). |
  | `tagSlug` | `string` | `undefined` | Filtro exato pelo `slug` da tag (`^[a-z0-9]+(?:-[a-z0-9]+)*$`, máx 80 chars). |
- **Status de Sucesso:** `200 OK`
- **Formato da Resposta:**
  - Sem `cursor`: `{ "data": [...], "meta": { "totalItems", "itemCount", "itemsPerPage", "totalPages", "currentPage" } }`
  - Com `cursor`: `{ "data": [...], "meta": { "itemCount", "itemsPerPage", "nextCursor", "hasMore" } }`
- **Erros:** `400 Bad Request` (cursor inválido ou parâmetros fora do formato).

#### `GET /api/v1/posts/me`
- **Descrição:** Lista todos os artigos ativos (`isActive: true`) cujo `authorId` é o usuário autenticado, incluindo rascunhos, agendados e artigos em revisão (`reviewStatus`).
- **Autenticação / Roles:** JWT (`JwtAuthGuard`). Qualquer role autenticado.
- **Query Parameters:** `page` (padrão `1`), `limit` (padrão `10`, máx `100`).
- **Status de Sucesso:** `200 OK` -> `PaginatedResult<PostSummary>` (inclui `scheduledAt` e `reviewStatus`).

#### `GET /api/v1/posts/:id/related`
- **Descrição:** Retorna até **4 artigos publicados** relacionados ao artigo `:id` (aceita UUID, `slug` ou `legacySlug`), priorizando artigos que compartilham tags ou categorias com o artigo original e completando com os publicados mais recentes se necessário.
- **Autenticação / Roles:** Pública.
- **Parâmetros de Rota:** `id` (`UUID`, `slug` ou `legacySlug`).
- **Status de Sucesso:** `200 OK` -> Array de até 4 objetos de artigo (`id`, `slug`, `title`, `excerpt`, `coverImage`, `publishedAt`, `author`, `categories`, `tags`).
- **Erros:** `404 Not Found` (se o artigo base não existir ou não estiver publicado).

#### `GET /api/v1/posts/:id`
- **Descrição:** Retorna os detalhes completos de um artigo (incluindo `content`, `readingTimeMinutes` e, se pertencer a uma série e estiver publicado, o objeto de navegação `series`). Aceita busca por UUID, `slug` atual ou `legacySlug` (mantido quando o título de um artigo é alterado).
- **Autenticação / Roles:** `OptionalJwtAuthGuard`. Artigos publicados são públicos; rascunhos (`published: false`) exigem JWT do próprio autor ou `ADMIN` (caso contrário retorna `404`).
- **Parâmetros de Rota:** `id` (`UUID`, `slug` ou `legacySlug`).
- **Status de Sucesso:** `200 OK`
- **Erros:** `401` (se enviar JWT inválido), `404` (`"Post com identificador ... não encontrado"`).

#### `POST /api/v1/posts`
- **Descrição:** Cria um novo artigo, gera `slug` único a partir do título, gera `excerpt` automático (primeiros 300 caracteres do texto limpo), vincula categorias existentes e cria/reutiliza tags automaticamente.
- **Autenticação / Roles:** JWT + `RolesGuard` (`@Roles(UserRole.AUTHOR, UserRole.ADMIN)`). Rate limit: **10 req/min**.
- **Request Body (`CreatePostDto`):**
  | Campo | Tipo | Obrigatório | Validação e Regras de Negócio |
  |---|---|---|---|
  | `title` | `string` | Sim | 3 a 255 caracteres após sanitização |
  | `content` | `string` | Sim | Mínimo de 10 caracteres visíveis após sanitização HTML |
  | `published` | `boolean` | Não | Padrão `false`. Se `scheduledAt` for informado, `published` é forçado para `false`. |
  | `scheduledAt` | `string (ISO)` | Não | Data futura (`> NOW()`). Não permitido para autor com `firstPostApproved = false`. |
  | `categoryIds` | `UUID[]` | Não | Máximo de 10 UUIDs v4 de categorias ativas. |
  | `tagNames` | `string[]` | Não | Máximo de 10 strings (1 a 60 chars cada). Tags inexistentes são criadas automaticamente. |
- **Status de Sucesso:** `201 Created` -> Objeto `Post` completo.
- **Erros:**
  - `400`: Validação, data de agendamento no passado ou categorias inexistentes.
  - `403`: Usuário é `READER`.
  - `409 Conflict`: `"O primeiro artigo exige aprovação."` (quando autor com `firstPostApproved = false` envia `published: true` ou `scheduledAt`).

#### `PATCH /api/v1/posts/:id`
- **Descrição:** Atualiza um artigo existente. Quando `title` ou `content` são alterados, salva um snapshot do estado anterior em `post_revisions`. Se o `title` mudar, o `slug` antigo é preservado em `legacySlug` (caso ainda esteja vazio) e um novo `slug` é gerado.
- **Autenticação / Roles:** JWT (`JwtAuthGuard`). Apenas o autor dono do artigo ou `ADMIN`. Rate limit: **20 req/min**.
- **Parâmetros de Rota:** `id` (`UUID`).
- **Request Body (`UpdatePostDto` — todos opcionais):**
  - `title` (`string`, 3..255), `content` (`string`, mín 10), `published` (`boolean`), `scheduledAt` (`string ISO | null`), `commentsEnabled` (`boolean`), `categoryIds` (`UUID[]`, máx 10), `tagNames` (`string[]`, máx 10).
- **Status de Sucesso:** `200 OK` -> Objeto `Post` atualizado.
- **Erros:** `400`, `403`, `404`, `409` (`"O artigo em revisão não pode ser editado."` ou `"O primeiro artigo exige aprovação."`).

#### `POST /api/v1/posts/:id/cover-image`
- **Descrição:** Faz upload da imagem de capa do artigo (convertida para WebP até 1920x1080). Veja [Seção 11](#11-upload-de-arquivos).
- **Autenticação / Roles:** JWT (`JwtAuthGuard`). Dono do artigo ou `ADMIN`.
- **Parâmetros de Rota:** `id` (`UUID`).
- **Request Body:** `multipart/form-data` com campo `file` (JPEG, PNG ou WebP, máx 5 MB).
- **Status de Sucesso:** `201 Created` -> `{ "coverImage": "/uploads/post-covers/<uuid>.webp" }`.
- **Erros:** `400`, `403`, `404`, `409` (atualização concorrente ou artigo em revisão), `413`.

#### `DELETE /api/v1/posts/:id/cover-image`
- **Descrição:** Remove a imagem de capa do artigo e apaga o arquivo físico em `uploads/post-covers/`.
- **Autenticação / Roles:** JWT (`JwtAuthGuard`). Dono do artigo ou `ADMIN`.
- **Status de Sucesso:** `200 OK` -> `{ "coverImage": null }`.

#### `DELETE /api/v1/posts/:id`
- **Descrição:** Desativa (soft delete, `isActive = false`) um artigo.
- **Autenticação / Roles:** JWT (`JwtAuthGuard`). Dono do artigo ou `ADMIN`.
- **Status de Sucesso:** `204 No Content`.

---

### 7.7. Interações em Artigos (`posts` — likes e salvos)
Controller: `src/modules/posts/post-interactions.controller.ts`

#### `GET /api/v1/posts/saved`
- **Descrição:** Lista os artigos publicados e ativos salvos pelo usuário autenticado, ordenados pela data em que foram salvos (`saved.createdAt DESC`).
- **Autenticação / Roles:** JWT (`JwtAuthGuard`).
- **Query Parameters:** `page` (padrão `1`), `limit` (padrão `10`, máx `100`).
- **Status de Sucesso:** `200 OK` -> `PaginatedResult` de artigos salvos. *(Nota de implementação: o `select` de `PostInteractionsService.saved` retorna `id`, `title`, `excerpt`, `publishedAt`, `published`, `commentsEnabled`, `isActive`, `createdAt`, `updatedAt`, `author`, `categories` e `tags`, mas não projeta `slug`).*

#### `GET /api/v1/posts/:id/interaction`
- **Descrição:** Retorna se o usuário autenticado curtiu e/ou salvou o artigo `:id` e o total de curtidas do artigo.
- **Autenticação / Roles:** JWT (`JwtAuthGuard`).
- **Parâmetros de Rota:** `id` (`UUID` do artigo).
- **Status de Sucesso:** `200 OK` -> `{ "liked": true, "saved": false, "likes": 12 }`.
- **Erros:** `404` (artigo inexistente ou não publicado).

#### `PUT /api/v1/posts/:id/like` e `DELETE /api/v1/posts/:id/like`
- **Descrição:** `PUT` adiciona curtida de forma idempotente (`ON CONFLICT DO NOTHING`) e cria notificação `POST_LIKED` para o autor (se não for auto-curtida); `DELETE` remove a curtida.
- **Autenticação / Roles:** JWT (`JwtAuthGuard`). Rate limit: **30 req/min**.
- **Parâmetros de Rota:** `id` (`UUID`).
- **Status de Sucesso:** `204 No Content`.

#### `PUT /api/v1/posts/:id/save` e `DELETE /api/v1/posts/:id/save`
- **Descrição:** `PUT` salva o artigo publicado nos favoritos do usuário (idempotente); `DELETE` remove dos salvos.
- **Autenticação / Roles:** JWT (`JwtAuthGuard`).
- **Parâmetros de Rota:** `id` (`UUID`).
- **Status de Sucesso:** `204 No Content`.

---

### 7.8. Visualizações e Artigos em Alta (`posts` — views e trending)
Controller: `src/modules/posts/post-views.controller.ts`

#### `GET /api/v1/posts/trending`
- **Descrição:** Lista artigos publicados com mais visualizações registradas nos últimos **7 dias UTC**.
- **Autenticação / Roles:** Pública.
- **Query Parameters:** `page` (padrão `1`), `limit` (padrão `10`, máx `100`).
- **Status de Sucesso:** `200 OK`
- **Resposta:**
  ```json
  {
    "data": [
      {
        "id": "8e8c3386-3d64-4803-b811-9c9a279a74c5",
        "slug": "arquitetura-nestjs-em-producao",
        "title": "Arquitetura NestJS em Produção",
        "excerpt": "Resumo do artigo...",
        "views": 48
      }
    ],
    "meta": { "totalItems": 1, "itemCount": 1, "itemsPerPage": 10, "totalPages": 1, "currentPage": 1 }
  }
  ```

#### `POST /api/v1/posts/:id/views`
- **Descrição:** Contabiliza uma visualização para o artigo publicado `:id` (aceita UUID ou `slug`). Deduplica visualizações calculando `HMAC-SHA256(JWT_SECRET, "view:<postId>:<ip>:<YYYY-MM-DD>")`, garantindo no máximo 1 view por IP por artigo a cada dia UTC.
- **Autenticação / Roles:** Pública.
- **Parâmetros de Rota:** `id` (`UUID` ou `slug`).
- **Status de Sucesso:** `200 OK` -> `{ "counted": true, "total": 15 }` (`counted: false` se o mesmo IP já visualizou hoje).
- **Erros:** `404` (artigo não encontrado ou não publicado).

---

### 7.9. Revisão Editorial (`post-reviews`)
Controller: `src/modules/posts/post-review.controller.ts`

#### `POST /api/v1/post-reviews/:id/submit`
- **Descrição:** Submete o primeiro artigo de um `AUTHOR` (`firstPostApproved === false`) para revisão de um administrador, mudando `reviewStatus` para `'PENDING'`.
- **Autenticação / Roles:** JWT (`JwtAuthGuard`). Apenas o autor dono do artigo.
- **Parâmetros de Rota:** `id` (`UUID` do artigo).
- **Status de Sucesso:** `201 Created` -> `{ "status": "PENDING" }`.
- **Erros:**
  - `400`: `"Autor já possui aprovação para publicar diretamente"` ou `"Artigo já está publicado"`.
  - `403`: Não é o autor do artigo ou não possui papel `AUTHOR`.
  - `404`: Artigo não encontrado.
  - `409`: `"Artigo já está em revisão"`.

#### `GET /api/v1/post-reviews`
- **Descrição:** Lista até 100 artigos ativos que estão aguardando revisão (`reviewStatus: 'PENDING'`), ordenados dos mais antigos para os mais novos (`createdAt ASC`), incluindo dados do `author`.
- **Autenticação / Roles:** JWT + `RolesGuard` (`@Roles(UserRole.ADMIN)`).
- **Status de Sucesso:** `200 OK` -> `Post[]`.

#### `POST /api/v1/post-reviews/:id/decision`
- **Descrição:** Aprova ou rejeita um artigo com `reviewStatus === 'PENDING'`.
  - Se `decision === 'APPROVED'`: publica o artigo (`published = true`, `publishedAt = NOW()`), atualiza `author.firstPostApproved = true`, registra `AuditLog` (`POST_REVIEW_APPROVED`), enfileira e-mail para o autor e dispara notificações aos seguidores/newsletter.
  - Se `decision === 'REJECTED'`: define `reviewStatus = 'REJECTED'`, registra `AuditLog` (`POST_REVIEW_REJECTED`) e enfileira e-mail informando o autor.
- **Autenticação / Roles:** JWT + `RolesGuard` (`@Roles(UserRole.ADMIN)`).
- **Parâmetros de Rota:** `id` (`UUID` do artigo).
- **Request Body (`ReviewDecisionDto`):** `{ "decision": "APPROVED" }` ou `{ "decision": "REJECTED" }`.
- **Status de Sucesso:** `201 Created` -> `{ "status": "APPROVED" | "REJECTED" }`.
- **Erros:** `400` (`"Artigo não está pendente de revisão"`), `401`, `403`, `404`.

---

### 7.10. Histórico de Revisões (`posts/:postId/revisions`)
Controller: `src/modules/posts/post-revisions.controller.ts`

#### `GET /api/v1/posts/:postId/revisions`
- **Descrição:** Lista o histórico paginado de revisões salvas de um artigo (`id`, `title`, `createdAt`).
- **Autenticação / Roles:** JWT (`JwtAuthGuard`). Dono do artigo ou `ADMIN`.
- **Parâmetros de Rota:** `postId` (`UUID`).
- **Query Parameters:** `page` (padrão `1`), `limit` (padrão `10`, máx `100`).
- **Status de Sucesso:** `200 OK` -> `PaginatedResult<{ id, title, createdAt }>`.

#### `GET /api/v1/posts/:postId/revisions/:revisionId`
- **Descrição:** Retorna os detalhes completos de uma revisão específica (`id`, `title`, `content`, `createdAt`).
- **Autenticação / Roles:** JWT (`JwtAuthGuard`). Dono do artigo ou `ADMIN`.
- **Parâmetros de Rota:** `postId` (`UUID`), `revisionId` (`UUID`).
- **Status de Sucesso:** `200 OK`.

#### `POST /api/v1/posts/:postId/revisions/:revisionId/restore`
- **Descrição:** Restaura o `title` e o `content` da revisão selecionada no artigo atual (salvando antes o estado atual como uma nova revisão). Não permitido se o artigo estiver `PENDING` em revisão editorial (`409`).
- **Autenticação / Roles:** JWT (`JwtAuthGuard`). Dono do artigo ou `ADMIN`.
- **Parâmetros de Rota:** `postId` (`UUID`), `revisionId` (`UUID`).
- **Status de Sucesso:** `201 Created` -> Objeto `Post` restaurado.

---

### 7.11. Séries de Artigos (`series` e `posts/:postId/series`)
Controllers: `src/modules/posts/post-series.controller.ts` e `src/modules/posts/post-series-navigation.controller.ts`

- **`GET /api/v1/series/me`** (JWT + `@Roles(AUTHOR, ADMIN)`): Lista todas as séries criadas pelo usuário autenticado (`[{ id, slug, title, description, authorId, createdAt }]`).
- **`GET /api/v1/series/:id/manage`** (JWT + `@Roles(AUTHOR, ADMIN)`, dono ou Admin): Retorna `{ id, slug, title, description, authorId, posts: [{ id, slug, title, excerpt, position }] }` incluindo artigos ainda em rascunho.
- **`GET /api/v1/series/:id`** (Pública, aceita UUID ou `slug`): Retorna a série contendo apenas seus artigos publicados e ativos ordenados por `position ASC`.
- **`POST /api/v1/series`** (JWT + `@Roles(AUTHOR, ADMIN)`): Cria série. Body (`CreateSeriesDto`): `{ "title": "...", "description": "..." }` (`title` 3..200 chars; `description` opcional até 1000 chars). Retorna `201 Created`.
- **`PATCH /api/v1/series/:id`** (JWT + `@Roles(AUTHOR, ADMIN)`, dono ou Admin): Atualiza `title` e/ou `description` da série. Retorna `200 OK`.
- **`PUT /api/v1/series/:id/items`** (JWT + `@Roles(AUTHOR, ADMIN)`, dono ou Admin): Substitui e ordena os artigos da série. Body (`SeriesItemsDto`): `{ "postIds": ["<uuid-1>", "<uuid-2>"] }` (máx 100 UUIDs únicos de artigos pertencentes ao autor da série). Nota: um artigo só pode pertencer a uma única série por vez (`UNIQUE (post_id)`). Retorna `200 OK` -> `{ "postIds": [...] }`.
- **`DELETE /api/v1/series/:id`** (JWT + `@Roles(AUTHOR, ADMIN)`, dono ou Admin): Remove a série e seus vínculos. Retorna `204 No Content`.
- **`GET /api/v1/posts/:postId/series`** (Pública, `:postId` aceita UUID ou `slug`): Retorna a série à qual o artigo publicado pertence (ou `404` se não pertencer a nenhuma série).

---

### 7.12. Autores Públicos e Seguidores (`authors` e `feed`)
Controllers: `src/modules/posts/authors.controller.ts` e `src/modules/posts/author-follows.controller.ts`

#### `GET /api/v1/authors/:id`
- **Descrição:** Retorna perfil público de um autor (`AUTHOR` ou `ADMIN` ativo) e o total de artigos publicados por ele.
- **Autenticação / Roles:** Pública.
- **Parâmetros de Rota:** `id` (`UUID`).
- **Status de Sucesso:** `200 OK`
- **Resposta:**
  ```json
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Maria Silva",
    "profilePhoto": "/uploads/profile-photos/550e8400.webp",
    "bio": "Engenheira de software e escritora técnica.",
    "websiteUrl": "https://mariasilva.dev",
    "socialUrl": "https://github.com/mariasilva",
    "publicationCount": 7
  }
  ```
- **Erros:** `404` (se o usuário não existir, estiver inativo ou for apenas `READER`).

#### `GET /api/v1/feed`
- **Descrição:** Retorna o feed personalizado de artigos publicados pelos autores que o usuário autenticado segue, ordenados por `publishedAt DESC`.
- **Autenticação / Roles:** JWT (`JwtAuthGuard`).
- **Query Parameters:** `page` (padrão `1`), `limit` (padrão `10`, máx `100`).
- **Status de Sucesso:** `200 OK` -> `PaginatedResult` de artigos (`id`, `slug`, `title`, `excerpt`, `coverImage`, `publishedAt`, `authorId`).

#### `GET /api/v1/authors/:id/follow`, `PUT /api/v1/authors/:id/follow` e `DELETE /api/v1/authors/:id/follow`
- **Descrição:**
  - `GET`: Retorna `{ "following": boolean }`.
  - `PUT`: Segue o autor `:id` (não permite seguir a si mesmo -> `400`, nem seguir `READER` -> `404`). Retorna `204 No Content`.
  - `DELETE`: Deixa de seguir o autor `:id`. Retorna `204 No Content`.
- **Autenticação / Roles:** JWT (`JwtAuthGuard`).

---

### 7.13. Feeds Sindicados e Sitemap (`feed/rss`, `feed.xml`, `feed/atom`, `sitemap.xml`)
Controller: `src/modules/posts/feed.controller.ts`

| Método e Rota | Content-Type | Cache-Control | Descrição |
|---|---|---|---|
| `GET /api/v1/feed/rss` | `application/rss+xml; charset=utf-8` | `public, max-age=300` | RSS 2.0 com os 50 artigos publicados mais recentes |
| `GET /api/v1/feed.xml` | `application/rss+xml; charset=utf-8` | `public, max-age=300` | Mesmo conteúdo de `/api/v1/feed/rss` |
| `GET /api/v1/feed/atom` | `application/atom+xml; charset=utf-8` | `public, max-age=300` | Atom 1.0 com os 50 artigos publicados mais recentes |
| `GET /api/v1/sitemap.xml` | `application/xml; charset=utf-8` | `public, max-age=300` | Sitemap XML com home (`/`), artigos (`/posts/:slug`, até 1000) e categorias (`/categories/:slug`, até 200) usando `FRONTEND_URL` |

---

### 7.14. Coleções de Artigos Salvos (`collections`)
Controller: `src/modules/posts/saved-collections.controller.ts`

Todas as rotas de `/api/v1/collections` são privadas e exigem **JWT (`JwtAuthGuard`)**:
- **`POST /api/v1/collections`**: Cria coleção. Body (`CollectionNameDto`): `{ "name": "Para ler depois" }` (1 a 100 chars). Retorna `201 Created` -> `{ id, name, createdAt }`.
- **`GET /api/v1/collections`**: Lista coleções do usuário autenticado (`[{ id, name, createdAt }]`). Retorna `200 OK`.
- **`PATCH /api/v1/collections/:id`**: Renomeia coleção do usuário. Body: `{ "name": "Arquitetura" }`. Retorna `200 OK`.
- **`DELETE /api/v1/collections/:id`**: Exclui coleção do usuário. Retorna `204 No Content`.
- **`GET /api/v1/collections/:id/posts`**: Lista artigos publicados dentro da coleção (`page`, `limit`). Retorna `200 OK` -> `PaginatedResult<{ id, slug, title, excerpt }>`.
- **`PUT /api/v1/collections/:id/posts/:postId`**: Adiciona artigo publicado à coleção (idempotente). Retorna `204 No Content`.
- **`DELETE /api/v1/collections/:id/posts/:postId`**: Remove artigo da coleção. Retorna `204 No Content`.

---

### 7.15. Categorias (`categories`)
Controller: `src/modules/categories/categories.controller.ts`

- **`GET /api/v1/categories`** (Pública): Lista categorias ativas ordenadas por `name ASC`. Query (`FindCategoriesQueryDto`): `page` (1), `limit` (10, máx 100), `search` (opcional, máx 100 chars, busca por `name` ou `description`). Retorna `200 OK` -> `PaginatedResult<Category>`.
- **`GET /api/v1/categories/:idOrSlug`** (Pública): Busca categoria ativa por UUID ou `slug`. Retorna `200 OK` -> `{ id, name, slug, description, isActive, createdAt, updatedAt }`.
- **`GET /api/v1/categories/:idOrSlug/posts`** (Pública): Lista artigos publicados dessa categoria (`page`, `limit`). Retorna `200 OK` -> `PaginatedResult<PostSummary>`.
- **`POST /api/v1/categories`** (JWT + `@Roles(ADMIN)`): Cria categoria (ou reativa automaticamente se já existir uma categoria inativa com mesmo nome ou slug). Body (`CreateCategoryDto`): `{ "name": "Tecnologia", "description": "Opcional até 255 chars", "slug": "opcional-slug" }`. Retorna `201 Created`. Erros: `409 Conflict` se já existir ativa.
- **`PATCH /api/v1/categories/:id`** (JWT + `@Roles(ADMIN)`): Atualiza `name`, `description` ou `slug`. Retorna `200 OK`.
- **`DELETE /api/v1/categories/:id`** (JWT + `@Roles(ADMIN)`): Soft delete (`isActive = false`). Retorna `204 No Content`.

---

### 7.16. Tags (`tags`)
Controller: `src/modules/tags/tags.controller.ts`

- **`GET /api/v1/tags`** (Pública): Lista tags ordenadas por `name ASC`. Query (`FindTagsQueryDto`): `page` (1), `limit` (10, máx 100), `search` (opcional, máx 60 chars). Retorna `200 OK` -> `PaginatedResult<{ id, name, slug, createdAt, updatedAt }>`.
- **`GET /api/v1/tags/:slug`** (Pública): Busca uma tag pelo `slug`. Retorna `200 OK` (ou `404` se não existir).
  *(Nota: tags são criadas automaticamente ao enviar `tagNames` em `POST /api/v1/posts` ou `PATCH /api/v1/posts/:id`).*

---

### 7.17. Comentários e Curtidas em Comentários (`posts/:postId/comments` e `comments`)
Controllers: `src/modules/comments/post-comments.controller.ts`, `src/modules/comments/comments.controller.ts` e `src/modules/comments/comment-likes.controller.ts`

#### `GET /api/v1/posts/:postId/comments`
- **Descrição:** Lista os comentários raiz (`rootId IS NULL`) de um artigo publicado, ordenados por `createdAt ASC`. Cada comentário raiz traz embutido um objeto `replies` com as **5 primeiras respostas** e seus próprios metadados de paginação (`meta`). Comentários excluídos mas que possuem respostas permanecem visíveis com `content: "Comentário excluído"` e `isActive: false`.
- **Autenticação / Roles:** Pública.
- **Parâmetros de Rota:** `postId` (`UUID`).
- **Query Parameters (`FindCommentsQueryDto`):** `page` (padrão `1`), `limit` (padrão `20`, máx `100`), `cursor` (opcional: `'start'` ou token `nextCursor`).
- **Status de Sucesso:** `200 OK`.

#### `GET /api/v1/posts/:postId/comments/:id/replies`
- **Descrição:** Lista páginas adicionais de respostas de um comentário raiz `:id` (`rootId = :id`), ordenadas por `createdAt ASC`.
- **Autenticação / Roles:** Pública.
- **Parâmetros de Rota:** `postId` (`UUID`), `id` (`UUID` do comentário raiz).
- **Query Parameters (`FindRepliesQueryDto`):** `page` (padrão `1`), `limit` (padrão `5`, máx `100`).
- **Status de Sucesso:** `200 OK` -> `PaginatedResult<CommentReply>`.

#### `POST /api/v1/posts/:postId/comments`
- **Descrição:** Cria um comentário raiz ou uma resposta (`replyToId`) em um artigo publicado e ativo que esteja com `commentsEnabled: true`. Se for resposta a uma resposta, o backend resolve automaticamente `rootId = target.rootId ?? target.id` (mantendo a árvore em 2 níveis de agrupamento visual). Dispara notificações `POST_COMMENTED` (para o autor do post) e `COMMENT_REPLIED` (para o autor do comentário respondido).
- **Autenticação / Roles:** JWT (`JwtAuthGuard`). Rate limit: **5 req/min**.
- **Parâmetros de Rota:** `postId` (`UUID`).
- **Request Body (`CreateCommentDto`):**
  | Campo | Tipo | Obrigatório | Validação |
  |---|---|---|---|
  | `content` | `string` | Sim | 1 a 2000 caracteres após sanitização de texto plano |
  | `replyToId` | `UUID` | Não | UUID v4 de um comentário ativo pertencente ao mesmo artigo |
- **Status de Sucesso:** `201 Created` -> Objeto `Comment` criado com `author: { id, name, profilePhoto }`.
- **Erros:** `400` (`replyToId` de outro post ou texto vazio), `403` (`"Comentários estão desabilitados neste post"`), `404`, `429`.

#### `PATCH /api/v1/comments/:id`
- **Descrição:** Atualiza o texto (`content`) de um comentário ativo.
- **Autenticação / Roles:** JWT (`JwtAuthGuard`). Apenas o autor do comentário ou `ADMIN`.
- **Parâmetros de Rota:** `id` (`UUID`).
- **Request Body (`UpdateCommentDto`):** `{ "content": "Texto atualizado" }` (1 a 2000 chars).
- **Status de Sucesso:** `200 OK` -> `Comment` atualizado.

#### `DELETE /api/v1/comments/:id`
- **Descrição:** Desativa um comentário (`isActive = false`, `content = 'Comentário excluído'`).
- **Autenticação / Roles:** JWT (`JwtAuthGuard`). Autor do comentário, **autor do artigo onde o comentário foi feito** ou `ADMIN`.
- **Parâmetros de Rota:** `id` (`UUID`).
- **Status de Sucesso:** `204 No Content`.

#### `GET /api/v1/comments/:id/like`, `PUT /api/v1/comments/:id/like` e `DELETE /api/v1/comments/:id/like`
- **Descrição:**
  - `GET`: Retorna `{ "liked": boolean, "likes": number }`.
  - `PUT` (Rate limit **30 req/min**): Curte um comentário ativo (idempotente). Retorna `204 No Content`.
  - `DELETE` (Rate limit **30 req/min**): Remove a curtida. Retorna `204 No Content`.
- **Autenticação / Roles:** JWT (`JwtAuthGuard`).

---

### 7.18. Notificações (`notifications`)
Controller: `src/modules/notifications/notifications.controller.ts`

- **`GET /api/v1/notifications`** (JWT): Lista notificações do usuário autenticado (`page` padrão 1, `limit` padrão 10) ordenadas por `createdAt DESC`, acrescida do contador global `"unread"` de notificações não lidas. Tipos possíveis (`type`): `'POST_COMMENTED'`, `'COMMENT_REPLIED'`, `'POST_LIKED'`, `'AUTHOR_NEW_POST'`.
- **`PATCH /api/v1/notifications/read-all`** (JWT): Marca todas as notificações não lidas do usuário como lidas (`readAt = NOW()`). Retorna `204 No Content`.
- **`PATCH /api/v1/notifications/:id/read`** (JWT): Marca uma notificação específica como lida. Retorna `204 No Content` (ou `404` se não pertencer ao usuário).

---

### 7.19. Newsletter (`newsletter`)
Controller: `src/modules/newsletter/newsletter.controller.ts`

- **`POST /api/v1/newsletter/subscribe`** (Pública, Throttle **5 req/min**): Recebe `{ "email": "leitor@exemplo.com" }`. Cria/atualiza inscrição com status `'PENDING'` e enfileira e-mail de confirmação (double opt-in). Retorna `200 OK` -> `{ "message": "Se o e-mail for válido, enviaremos um link de confirmação." }`.
- **`GET /api/v1/newsletter/confirm?token=<64-hex>`** (Pública, Throttle **10 req/min**): Confirma inscrição e retorna página HTML (`text/html`).
- **`POST /api/v1/newsletter/confirm`** (Pública, Throttle **10 req/min**): Confirma inscrição via JSON `{ "token": "<64-hex>" }` e retorna `200 OK` -> `{ "message": "Inscrição confirmada com sucesso." }`.
- **`GET /api/v1/newsletter/unsubscribe?token=<64-hex>`** (Pública, Throttle **10 req/min**): Cancela inscrição (`status = 'UNSUBSCRIBED'`) e retorna página HTML (`text/html`).
- **`POST /api/v1/newsletter/unsubscribe`** (Pública, Throttle **10 req/min**): Cancela inscrição via JSON `{ "token": "<64-hex>" }` e retorna `200 OK` -> `{ "message": "Inscrição cancelada com sucesso." }`.

---

### 7.20. Denúncias (`reports`)
Controller: `src/modules/reports/reports.controller.ts`

- **`POST /api/v1/reports`** (JWT, Throttle **10 req/min**): Cria denúncia contra um artigo publicado (`target: 'POST'`) ou comentário ativo (`target: 'COMMENT'`). Body (`CreateReportDto`):
  ```json
  {
    "target": "POST",
    "targetId": "8e8c3386-3d64-4803-b811-9c9a279a74c5",
    "reason": "Conteúdo plagiado ou spam comercial."
  }
  ```
  (`reason`: 3 a 500 chars). Retorna `201 Created` -> Objeto `Report` (`status: 'OPEN'`).
- **`GET /api/v1/reports`** (JWT + `@Roles(ADMIN)`): Lista denúncias paginadas (`page` 1, `limit` 20, filtro opcional `status`: `'OPEN' | 'RESOLVED' | 'DISMISSED'`). Retorna `200 OK`.
- **`PATCH /api/v1/reports/:id`** (JWT + `@Roles(ADMIN)`): Atualiza status da denúncia (`status: 'RESOLVED' | 'DISMISSED'`, `note` opcional até 500 chars) e grava `AuditLog`. Retorna `200 OK`.

---

### 7.21. Moderação Administrativa (`admin/users`)
Controller: `src/modules/moderation/moderation.controller.ts`

- **`POST /api/v1/admin/users/:id/suspension`** (JWT + `@Roles(ADMIN)`): Suspende um usuário (não pode suspender outro `ADMIN`), incrementa `authVersion`, apaga todas as sessões ativas, oculta opcionalmente uma lista de artigos (`hidePostIds`) marcando `hiddenByModeration = true` e `isActive = false`, e grava `AuditLog` (`USER_SUSPENDED`).
  - Body (`SuspendDto`): `{ "reason": "Violação reiterada", "endsAt": "2026-05-01T00:00:00.000-03:00", "hidePostIds": ["<uuid>"] }` (`endsAt` e `hidePostIds` opcionais).
  - Status: `201 Created` -> `{ "suspended": true, "endsAt": "..." }`.
- **`POST /api/v1/admin/users/:id/restore`** (JWT + `@Roles(ADMIN)`): Remove suspensão de um usuário, restaura automaticamente todos os seus artigos que estavam marcados com `hiddenByModeration = true` e grava `AuditLog` (`USER_RESTORED`).
  - Status: `201 Created` -> `{ "suspended": false }`.

---

### 7.22. Analytics Administrativo (`admin/analytics`)
Controller: `src/modules/analytics/analytics.controller.ts`

#### `GET /api/v1/admin/analytics/overview`
- **Descrição:** Retorna painel consolidado de métricas da plataforma.
- **Autenticação / Roles:** JWT + `RolesGuard` (`@Roles(UserRole.ADMIN)`).
- **Status de Sucesso:** `200 OK`
- **Resposta:**
  ```json
  {
    "users": 142,
    "posts": 38,
    "comments": 215,
    "reports": 3,
    "generatedAt": "2026-04-19T15:00:00.000-03:00"
  }
  ```

---

### 7.23. Logs de Auditoria (`admin/audit-logs`)
Controller: `src/modules/audit/audit.controller.ts`

#### `GET /api/v1/admin/audit-logs`
- **Descrição:** Lista os registros da trilha de auditoria administrativa (`POST_REVIEW_APPROVED`, `POST_REVIEW_REJECTED`, `REPORT_RESOLVED`, `REPORT_DISMISSED`, `USER_SUSPENDED`, `USER_RESTORED`) ordenados por `createdAt DESC`.
- **Autenticação / Roles:** JWT + `RolesGuard` (`@Roles(UserRole.ADMIN)`).
- **Query Parameters:** `page` (padrão `1`), `limit` (padrão `20`, máx `100`).
- **Status de Sucesso:** `200 OK` -> `PaginatedResult<AuditLog>`.

---

## 8. Exemplos de requisições e respostas

Abaixo estão exemplos reais de requisições HTTP e payloads JSON (sucesso e erro) extraídos diretamente dos DTOs, services e filtros do backend.

### 8.1. Cadastro de Usuário (`POST /api/v1/users`)

**Requisição:**
```http
POST /api/v1/users HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "name": "Otávio Augusto",
  "email": "otavio@exemplo.com",
  "password": "SenhaForte!2026"
}
```

**Resposta de Sucesso (`201 Created`):**
```json
{
  "id": "c7b8a910-1234-4ef0-9123-abcdef012345",
  "name": "Otávio Augusto",
  "email": "otavio@exemplo.com",
  "profilePhoto": null,
  "bio": null,
  "websiteUrl": null,
  "socialUrl": null,
  "role": "READER",
  "isActive": true,
  "createdAt": "2026-04-19T14:00:00.000-03:00",
  "updatedAt": "2026-04-19T14:00:00.000-03:00"
}
```

**Resposta de Erro — E-mail duplicado (`409 Conflict`):**
```json
{
  "statusCode": 409,
  "message": "Este e-mail já está em uso",
  "error": "Conflict"
}
```

---

### 8.2. Login com e sem 2FA (`POST /api/v1/auth/login`)

**Requisição:**
```http
POST /api/v1/auth/login HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "email": "otavio@exemplo.com",
  "password": "SenhaForte!2026",
  "totpCode": "482910"
}
```
*(O campo `totpCode` é opcional e só é exigido quando `totpEnabled = true` na conta).*

**Resposta de Sucesso (`200 OK`):**
```http
HTTP/1.1 200 OK
Set-Cookie: refreshToken=b63f9e53-7c52-4962-84c6-70e2e3bd7f98.9f8e7d6c5b4a...; Max-Age=604800; Path=/api/v1/auth; HttpOnly; SameSite=Strict
Content-Type: application/json

{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 900
}
```

**Resposta de Erro — Conta Suspensa (`403 Forbidden`):**
```json
{
  "statusCode": 403,
  "message": "Conta suspensa.",
  "reason": "Publicação de spam promocional em comentários",
  "endsAt": "2026-04-26T14:00:00.000-03:00"
}
```

---

### 8.3. Promoção de `READER` para `AUTHOR` (`POST /api/v1/users/me/author`)

**Requisição:**
```http
POST /api/v1/users/me/author HTTP/1.1
Host: localhost:3000
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
  "version": "1",
  "accepted": true
}
```

**Resposta de Sucesso (`200 OK`):**
```json
{
  "role": "AUTHOR",
  "rulesVersion": "1"
}
```

---

### 8.4. Criação e Leitura de Artigo (`POST /api/v1/posts` e `GET /api/v1/posts/:id`)

**Requisição (`POST /api/v1/posts`):**
```http
POST /api/v1/posts HTTP/1.1
Host: localhost:3000
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
  "title": "Guia Prático de NestJS com TypeORM",
  "content": "<p>Neste artigo exploramos a arquitetura modular do <strong>NestJS</strong> integrada ao PostgreSQL.</p><h2>Boas práticas</h2><p>Valide sempre seus DTOs.</p>",
  "published": false,
  "categoryIds": ["41a9f1d0-827b-483e-9a4a-1e8e4a8b3c12"],
  "tagNames": ["NestJS", "TypeScript", "PostgreSQL"]
}
```

**Resposta de Sucesso (`201 Created`):**
```json
{
  "id": "8e8c3386-3d64-4803-b811-9c9a279a74c5",
  "title": "Guia Prático de NestJS com TypeORM",
  "slug": "guia-pratico-de-nestjs-com-typeorm",
  "legacySlug": null,
  "content": "<p>Neste artigo exploramos a arquitetura modular do <strong>NestJS</strong> integrada ao PostgreSQL.</p><h2>Boas práticas</h2><p>Valide sempre seus DTOs.</p>",
  "excerpt": "Neste artigo exploramos a arquitetura modular do NestJS integrada ao PostgreSQL. Boas práticas Valide sempre seus DTOs.",
  "coverImage": null,
  "publishedAt": null,
  "scheduledAt": null,
  "reviewStatus": "NONE",
  "published": false,
  "commentsEnabled": true,
  "isActive": true,
  "hiddenByModeration": false,
  "authorId": "c7b8a910-1234-4ef0-9123-abcdef012345",
  "categories": [
    {
      "id": "41a9f1d0-827b-483e-9a4a-1e8e4a8b3c12",
      "name": "Backend",
      "slug": "backend",
      "description": "Arquitetura e desenvolvimento servidor",
      "isActive": true,
      "createdAt": "2026-04-10T10:00:00.000-03:00",
      "updatedAt": "2026-04-10T10:00:00.000-03:00"
    }
  ],
  "tags": [
    {
      "id": "f0011223-3445-4556-8667-778899aabbcc",
      "name": "NestJS",
      "slug": "nestjs",
      "createdAt": "2026-04-19T14:10:00.000-03:00",
      "updatedAt": "2026-04-19T14:10:00.000-03:00"
    }
  ],
  "createdAt": "2026-04-19T14:10:00.000-03:00",
  "updatedAt": "2026-04-19T14:10:00.000-03:00",
  "readingTimeMinutes": 1
}
```

**Resposta de Erro — Primeiro artigo tentando publicar sem aprovação (`409 Conflict`):**
```json
{
  "statusCode": 409,
  "message": "O primeiro artigo exige aprovação."
}
```

**Resposta de `GET /api/v1/posts/:id` quando o artigo publicado pertence a uma série (`200 OK`):**
Além dos campos acima, inclui o objeto `series`:
```json
{
  "id": "8e8c3386-3d64-4803-b811-9c9a279a74c5",
  "slug": "guia-pratico-de-nestjs-com-typeorm",
  "title": "Guia Prático de NestJS com TypeORM",
  "content": "<p>...</p>",
  "readingTimeMinutes": 4,
  "series": {
    "id": "99112233-4455-4667-8899-aabbccddeeff",
    "slug": "dominando-backend",
    "title": "Dominando Backend",
    "position": 2,
    "total": 3,
    "previous": { "id": "11111111-2222-4333-8444-555555555555", "slug": "introducao-ao-node", "title": "Introdução ao Node" },
    "next": { "id": "66666666-7777-4888-8999-000000000000", "slug": "deploy-com-docker", "title": "Deploy com Docker" }
  }
}
```

---

### 8.5. Comentários Raiz e Respostas (`GET` e `POST /api/v1/posts/:postId/comments`)

**Requisição para criar resposta (`POST /api/v1/posts/8e8c3386-3d64-4803-b811-9c9a279a74c5/comments`):**
```json
{
  "content": "Excelente explicação sobre os guards!",
  "replyToId": "a1b2c3d4-e5f6-4789-8012-34567890abcd"
}
```

**Resposta de listagem (`GET /api/v1/posts/8e8c3386-3d64-4803-b811-9c9a279a74c5/comments?page=1&limit=20`):**
```json
{
  "data": [
    {
      "id": "a1b2c3d4-e5f6-4789-8012-34567890abcd",
      "content": "Muito bom o artigo!",
      "postId": "8e8c3386-3d64-4803-b811-9c9a279a74c5",
      "authorId": "c7b8a910-1234-4ef0-9123-abcdef012345",
      "rootId": null,
      "replyToId": null,
      "isActive": true,
      "createdAt": "2026-04-19T14:20:00.000-03:00",
      "updatedAt": "2026-04-19T14:20:00.000-03:00",
      "author": {
        "id": "c7b8a910-1234-4ef0-9123-abcdef012345",
        "name": "Otávio Augusto",
        "profilePhoto": "/uploads/profile-photos/c7b8a910.webp"
      },
      "replies": {
        "data": [
          {
            "id": "d4c3b2a1-6f5e-4987-8210-dcba09876543",
            "content": "Excelente explicação sobre os guards!",
            "postId": "8e8c3386-3d64-4803-b811-9c9a279a74c5",
            "authorId": "550e8400-e29b-41d4-a716-446655440000",
            "rootId": "a1b2c3d4-e5f6-4789-8012-34567890abcd",
            "replyToId": "a1b2c3d4-e5f6-4789-8012-34567890abcd",
            "isActive": true,
            "createdAt": "2026-04-19T14:22:00.000-03:00",
            "updatedAt": "2026-04-19T14:22:00.000-03:00",
            "author": {
              "id": "550e8400-e29b-41d4-a716-446655440000",
              "name": "Maria Silva",
              "profilePhoto": null
            }
          }
        ],
        "meta": {
          "totalItems": 1,
          "itemCount": 1,
          "itemsPerPage": 5,
          "totalPages": 1,
          "currentPage": 1
        }
      }
    }
  ],
  "meta": {
    "totalItems": 1,
    "itemCount": 1,
    "itemsPerPage": 20,
    "totalPages": 1,
    "currentPage": 1
  }
}
```

---

## 9. Integração com o frontend React

O projeto frontend (`Front-Blog`) utiliza **Next.js App Router + React 19 + TypeScript** e já define uma arquitetura sólida e segura que deve ser reutilizada ao consumir qualquer endpoint da API.

### 9.1. Arquitetura HTTP e Coordenação de Sessão no Frontend

1. **Rewrites transparentes (`Front-Blog/next.config.ts`):**
   - Todas as chamadas cliente para `/api/v1/:path*` e `/uploads/:path*` são redirecionadas internamente pelo Next.js para `${API_ORIGIN}/api/v1/:path*` e `${API_ORIGIN}/uploads/:path*`.
   - Dessa forma, os componentes client-side fazem chamadas para caminhos relativos (`/api/v1/...`), mantendo mesma origem (`same-origin`) para o cookie `HttpOnly` `refreshToken`.
2. **Proteção de Origem (`Front-Blog/src/proxy.ts`):**
   - Qualquer mutação (`POST`, `PUT`, `PATCH`, `DELETE`) para `/api/v1/*` passa pelo middleware/proxy do Next.js, que exige que o header `Origin` seja idêntico a `SITE_ORIGIN`.
3. **Armazenamento do JWT apenas em memória (`Front-Blog/src/lib/session-client.ts`):**
   - O `access_token` **nunca** é salvo em `localStorage` ou `sessionStorage` (prevenindo exfiltração persistente por XSS).
   - O módulo `session-client.ts` mantém o `access_token` em memória, decodifica os claims (`sub`, `role`, `sid`, `exp`) e coordena a renovação (`POST /api/v1/auth/refresh`) entre múltiplas abas usando **Web Locks API** (`navigator.locks.request("front-blog-auth-refresh", ...)`) e **BroadcastChannel** (`"front-blog-auth-session"`).
   - Se uma requisição autenticada receber `401`, `authenticatedFetch` tenta renovar o token uma única vez via `refreshSession()` e repete a requisição com o novo `Bearer` token.

### 9.2. Funções Principais Já Existentes no Frontend

| Arquivo no Frontend | Função / Hook | Quando utilizar |
|---|---|---|
| `src/lib/session-client.ts` | `authenticatedFetch(path, init)` | Chamadas client-side que exigem JWT (`GET`, `POST`, `PATCH`, `PUT`, `DELETE`). Injeta `Authorization: Bearer <token>` e faz retry automático em `401`. |
| `src/lib/session-client.ts` | `authenticatedFetchForSubject(userId, path, init)` | Mutações sensíveis vinculadas a um usuário específico (aborta se outra aba tiver trocado a conta logada para outro `sub`). |
| `src/lib/use-session.ts` | `useSession()` | Hook React que retorna `{ status, user, login, logout }` sincronizado entre abas. |
| `src/lib/public-post.ts` | `getPublicPosts`, `getPublicPost`, `getPublicCategories`, `getPublicAuthor` | Funções de leitura pública usadas em Server Components com `fetch(`${API_ORIGIN}/api/v1/...`, { cache: "no-store" })`. |
| `src/lib/admin-security.ts` | `validateAdminMutationRequest`, `readBearerToken` | Utilitários para Route Handlers BFF administrativos (como `/gestao-editorial`). |

### 9.3. Exemplos Práticos em TypeScript (Seguindo o Padrão do Frontend)

#### Exemplo 1: Consumir notificações e marcar como lidas em um Client Component

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { authenticatedFetch } from "../../lib/session-client";
import { useSession } from "../../lib/use-session";

export interface NotificationItem {
  id: string;
  type: "POST_COMMENTED" | "COMMENT_REPLIED" | "POST_LIKED" | "AUTHOR_NEW_POST";
  data: Record<string, string> | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  data: NotificationItem[];
  meta: {
    totalItems: number;
    itemCount: number;
    itemsPerPage: number;
    totalPages: number;
    currentPage: number;
  };
  unread: number;
}

export function NotificationsBell() {
  const { status } = useSession();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [busy, setBusy] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (status !== "authenticated") return;
    const response = await authenticatedFetch("/api/v1/notifications?page=1&limit=10");
    if (!response.ok) return;
    const body = (await response.json()) as NotificationsResponse;
    setItems(body.data);
    setUnread(body.unread);
  }, [status]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  async function markAllAsRead() {
    if (busy || unread === 0) return;
    setBusy(true);
    try {
      const response = await authenticatedFetch("/api/v1/notifications/read-all", {
        method: "PATCH",
      });
      if (response.status === 204) {
        const now = new Date().toISOString();
        setUnread(0);
        setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? now })));
      }
    } finally {
      setBusy(false);
    }
  }

  if (status !== "authenticated") return null;

  return (
    <div>
      <span>Não lidas: {unread}</span>
      <button type="button" onClick={markAllAsRead} disabled={busy || unread === 0}>
        Marcar todas como lidas
      </button>
      <ul>
        {items.map((item) => (
          <li key={item.id}>{item.type} — {item.readAt ? "Lida" : "Nova"}</li>
        ))}
      </ul>
    </div>
  );
}
```

#### Exemplo 2: Seguir / Deixar de Seguir um Autor (`GET/PUT/DELETE /api/v1/authors/:id/follow`)

```tsx
"use client";

import { useEffect, useState } from "react";
import { authenticatedFetch } from "../../lib/session-client";
import { useSession } from "../../lib/use-session";

export function FollowAuthorButton({ authorId }: { authorId: string }) {
  const { status, user } = useSession();
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || user?.id === authorId) return;
    let cancelled = false;
    void (async () => {
      const res = await authenticatedFetch(`/api/v1/authors/${authorId}/follow`);
      if (res.ok && !cancelled) {
        const body = (await res.json()) as { following: boolean };
        setFollowing(body.following);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authorId, status, user?.id]);

  if (status !== "authenticated" || user?.id === authorId) return null;

  async function toggleFollow() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const nextState = !following;
    try {
      const res = await authenticatedFetch(`/api/v1/authors/${authorId}/follow`, {
        method: nextState ? "PUT" : "DELETE",
      });
      if (res.status === 204) {
        setFollowing(nextState);
      } else {
        setError("Não foi possível atualizar o acompanhamento deste autor.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={toggleFollow} disabled={busy}>
        {following ? "Seguindo" : "Seguir autor"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
```

#### Exemplo 3: Publicar ou Agendar Artigo para Autor já Aprovado (`PATCH /api/v1/posts/:id`)

```ts
import { authenticatedFetchForSubject } from "../lib/session-client";

export async function publishOrSchedulePost(
  userId: string,
  postId: string,
  options: { publishNow?: boolean; scheduledAtIso?: string | null },
) {
  const payload: { published?: boolean; scheduledAt?: string | null } = {};
  if (options.scheduledAtIso !== undefined) {
    payload.scheduledAt = options.scheduledAtIso;
  } else if (options.publishNow !== undefined) {
    payload.published = options.publishNow;
  }

  const response = await authenticatedFetchForSubject(
    userId,
    `/api/v1/posts/${encodeURIComponent(postId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  if (response.status === 409) {
    const err = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(err?.message || "Este artigo exige aprovação editorial antes da publicação.");
  }

  if (!response.ok) {
    throw new Error("Não foi possível atualizar o status de publicação.");
  }

  return response.json();
}
```

---

## 10. Fluxos completos da aplicação

### Fluxo 1: Cadastro, confirmação de e-mail, login e obtenção do usuário autenticado
1. **`POST /api/v1/users`** com `{ name, email, password }` -> Cria conta `READER` com `emailVerified: false` e envia token por e-mail.
2. **`POST /api/v1/users/confirm-email`** com `{ token }` -> Valida o token de 64 hex chars e ativa `emailVerified = true`. (Se necessário, `POST /api/v1/users/resend-verification` reenvia o link).
3. **`POST /api/v1/auth/login`** com `{ email, password }` -> Retorna `{ access_token, expires_in }` e define o cookie `HttpOnly` `refreshToken`.
4. Decodifique o claim `sub` do `access_token` e chame **`GET /api/v1/users/:id`** com `Authorization: Bearer <access_token>` -> Retorna o perfil completo do próprio usuário, incluindo `role` e `firstPostApproved`.

### Fluxo 2: Solicitação de promoção de `READER` para `AUTHOR`
1. **`GET /api/v1/users/author-rules`** (Pública) -> Obtém `{ version: "1", rules: [...] }` para exibir ao leitor.
2. **`POST /api/v1/users/me/author`** (JWT de `READER` com e-mail verificado) enviando `{ version: "1", accepted: true }` -> Retorna `{ role: "AUTHOR", rulesVersion: "1" }`.
3. Opcionalmente chame **`POST /api/v1/auth/refresh`** para atualizar o claim `role` no JWT client-side (no backend, o `JwtStrategy` já lê `role = 'AUTHOR'` diretamente do banco imediatamente).

### Fluxo 3: Criação de um artigo (1º artigo vs. artigos seguintes)
1. **`GET /api/v1/categories?page=1&limit=100`** -> Carrega categorias disponíveis para seleção.
2. **`POST /api/v1/posts`** (JWT de `AUTHOR` ou `ADMIN`) enviando `{ title, content, categoryIds, tagNames, published: false }` -> Retorna o rascunho criado (`201 Created`).
3. Opcionalmente, envie a capa em **`POST /api/v1/posts/:id/cover-image`** (`multipart/form-data`, campo `file`).
4. **Se `firstPostApproved === false` (1º artigo do autor):**
   - Chame **`POST /api/v1/post-reviews/:id/submit`** -> Muda `reviewStatus` para `'PENDING'`.
5. **Se `firstPostApproved === true` ou `ADMIN`:**
   - Pode criar diretamente com `"published": true` ou `"scheduledAt": "2026-05-01T10:00:00.000-03:00"`.

### Fluxo 4: Edição de um artigo pelo próprio autor e histórico de revisões
1. **`GET /api/v1/posts/me?page=1&limit=20`** -> Lista os artigos do autor (rascunhos, em revisão e publicados).
2. **`GET /api/v1/posts/:id`** (com JWT do autor) -> Carrega os dados completos do rascunho ou artigo publicado.
3. **`PATCH /api/v1/posts/:id`** -> Atualiza `title`, `content`, `categoryIds`, `tagNames`, `commentsEnabled`, etc. (Bloqueado com `409` apenas se `reviewStatus === 'PENDING'`). Cada alteração de título ou conteúdo gera automaticamente um registro em `post_revisions`.
4. Para consultar ou reverter versões anteriores: **`GET /api/v1/posts/:postId/revisions`** -> **`GET /api/v1/posts/:postId/revisions/:revisionId`** -> **`POST /api/v1/posts/:postId/revisions/:revisionId/restore`**.

### Fluxo 5: Publicação, agendamento, séries e gerenciamento de artigos
1. **Revisão pelo Admin (para o 1º artigo):**
   - Admin consulta **`GET /api/v1/post-reviews`** -> Avalia o artigo -> Envia **`POST /api/v1/post-reviews/:id/decision`** com `{ "decision": "APPROVED" }` (publica o post e libera `author.firstPostApproved = true`) ou `{ "decision": "REJECTED" }`.
2. **Publicação direta ou agendamento (autores aprovados / Admin):**
   - Publicar agora: **`PATCH /api/v1/posts/:id`** com `{ "published": true }`.
   - Agendar: **`PATCH /api/v1/posts/:id`** com `{ "scheduledAt": "2026-05-10T09:00:00.000-03:00" }`. O cron `PostSchedulerService` publica automaticamente no minuto agendado.
3. **Organizar em Série:**
   - **`POST /api/v1/series`** (`{ title, description }`) -> **`PUT /api/v1/series/:id/items`** (`{ postIds: [...] }`).
4. **Exclusão (Soft Delete):**
   - **`DELETE /api/v1/posts/:id`** -> Remove o artigo das listagens públicas.

### Fluxo 6: Consulta de artigos públicos com paginação, busca, filtros e leitura
1. **Listagem e busca:** **`GET /api/v1/posts?page=1&limit=10&search=nestjs&categorySlug=backend&tagSlug=typescript`** (ou com `cursor=start` para botão "Mostrar mais").
2. **Leitura do artigo:** **`GET /api/v1/posts/:slug`** -> Retorna artigo completo com `content`, `readingTimeMinutes` e navegação `series`.
3. **Contabilização de visualização:** **`POST /api/v1/posts/:id/views`** -> Incrementa contador diário deduplicado por IP.
4. **Artigos relacionados:** **`GET /api/v1/posts/:id/related`** -> Retorna até 4 sugestões de leitura.

### Fluxo 7: Criação, listagem e gerenciamento de comentários e respostas
1. **`GET /api/v1/posts/:postId/comments?page=1&limit=20`** -> Carrega comentários raiz e até 5 respostas iniciais por comentário.
2. **`GET /api/v1/posts/:postId/comments/:id/replies?page=2&limit=5`** -> Carrega páginas adicionais de respostas de um comentário raiz.
3. **`POST /api/v1/posts/:postId/comments`** (JWT) -> Envia `{ content }` para comentário raiz ou `{ content, replyToId }` para responder.
4. **Curtir comentário:** **`GET /api/v1/comments/:id/like`** -> **`PUT /api/v1/comments/:id/like`** / **`DELETE /api/v1/comments/:id/like`**.
5. **Editar ou excluir comentário:** **`PATCH /api/v1/comments/:id`** (autor do comentário ou Admin) / **`DELETE /api/v1/comments/:id`** (autor do comentário, autor do artigo ou Admin).

### Fluxo 8: Upload e atualização de imagens de perfil e de capa de artigos
1. **Foto de perfil:** **`POST /api/v1/users/:id/profile-photo`** (`multipart/form-data`, campo `file`). Retorna `UserResponseDto` com `profilePhoto: "/uploads/profile-photos/<uuid>.webp"`.
2. **Capa de artigo:** **`POST /api/v1/posts/:id/cover-image`** (`multipart/form-data`, campo `file`). Retorna `{ coverImage: "/uploads/post-covers/<uuid>.webp" }`.
3. **Remoção de capa:** **`DELETE /api/v1/posts/:id/cover-image`** -> Retorna `{ coverImage: null }`.

### Fluxo 9: Configurações e segurança da conta (Perfil, Senha, E-mail, 2FA e Sessões)
1. **Dados públicos do perfil:** **`PATCH /api/v1/users/:id`** com `{ name, bio, websiteUrl, socialUrl }`.
2. **Troca de senha:** **`PATCH /api/v1/users/:id`** com `{ currentPassword, password }` -> Invalida todas as sessões (`authVersion += 1`), exigindo novo login.
3. **Troca de e-mail:** **`PATCH /api/v1/users/:id`** com `{ currentPassword, email }` -> Envia token para o novo e-mail -> **`POST /api/v1/users/confirm-email-change`** com `{ token }`.
4. **Ativar 2FA (TOTP):** **`POST /api/v1/auth/totp/setup`** (`{ password }`) -> Exibe QR Code (`otpauthUri`) -> **`POST /api/v1/auth/totp/enable`** (`{ code }`) -> Faz novo login com `totpCode`.
5. **Auditar e encerrar sessões:** **`GET /api/v1/auth/sessions`** -> **`DELETE /api/v1/auth/sessions/:sessionId`**.

### Fluxo 10: Operações administrativas (Moderação, Categorias, Denúncias, Analytics e Auditoria)
1. **Visão geral:** **`GET /api/v1/admin/analytics/overview`** -> Contadores globais.
2. **Gestão de categorias:** **`POST /api/v1/categories`**, **`PATCH /api/v1/categories/:id`**, **`DELETE /api/v1/categories/:id`**.
3. **Moderação de denúncias:** **`GET /api/v1/reports?status=OPEN`** -> **`PATCH /api/v1/reports/:id`** com `{ status: "RESOLVED", note: "..." }`.
4. **Suspensão e restauração de contas:** **`POST /api/v1/admin/users/:id/suspension`** (`{ reason, endsAt, hidePostIds }`) -> **`POST /api/v1/admin/users/:id/restore`**.
5. **Auditoria:** **`GET /api/v1/admin/audit-logs?page=1&limit=20`**.

---

## 11. Upload de arquivos

O sistema de upload processa imagens localmente com validação rigorosa de assinatura binária (magic bytes) e recodificação via **Sharp** para **WebP**, removendo metadados EXIF e garantindo dimensões padronizadas.

### 11.1. Comparativo dos Endpoints de Upload

| Característica | Foto de Perfil | Capa de Artigo |
|---|---|---|
| **Endpoint de Upload** | `POST /api/v1/users/:id/profile-photo` | `POST /api/v1/posts/:id/cover-image` |
| **Endpoint de Remoção** | Não possui rota `DELETE` dedicada (substituída por novo upload) | `DELETE /api/v1/posts/:id/cover-image` |
| **Autenticação / Permissão** | JWT — Próprio usuário (`:id`) ou `ADMIN` | JWT — Autor dono do artigo (`:id`) ou `ADMIN` |
| **Content-Type** | `multipart/form-data` | `multipart/form-data` |
| **Nome do campo no FormData** | `file` | `file` |
| **Formatos aceitos na entrada** | `image/jpeg`, `image/png`, `image/webp` | `image/jpeg`, `image/png`, `image/webp` |
| **Tamanho máximo** | **5 MB** (`5 * 1024 * 1024` bytes) | **5 MB** (`5 * 1024 * 1024` bytes) |
| **Processamento (`sharp`)** | `.rotate().resize(512, 512, { fit: 'cover', position: 'centre' }).webp({ quality: 82 })` | `.rotate().resize(1920, 1080, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 })` |
| **Diretório físico** | `uploads/profile-photos/<uuid>.webp` | `uploads/post-covers/<uuid>.webp` |
| **Estrutura da URL retornada** | `/uploads/profile-photos/<uuid>.webp` | `/uploads/post-covers/<uuid>.webp` |
| **Controle de concorrência** | Atualização condicional; retorna `409` se houve upload concorrente e remove arquivo órfão | Atualização condicional (e verifica `reviewStatus != 'PENDING'`); retorna `409` em conflito |

### 11.2. Validação Real de Assinatura Binária (Magic Bytes)
Além de checar `file.mimetype`, ambos os serviços (`UsersService.hasValidImageSignature` e `PostsService.hasValidImageSignature`) inspecionam os primeiros 12 bytes do `Buffer`:
- **JPEG:** começa com `FF D8 FF`
- **PNG:** começa com `89 50 4E 47 0D 0A 1A 0A`
- **WebP:** começa com `RIFF` (`52 49 46 46`) nos bytes 0..3 e `WEBP` (`57 45 42 50`) nos bytes 8..11.

Se um arquivo tiver extensão `.jpg` mas conteúdo diferente, a API rejeita com `400 Bad Request` (`"O conteúdo do arquivo não corresponde a uma imagem válida (JPEG, PNG ou WebP)"`).

### 11.3. Como Exibir Imagens no Frontend
- As URLs retornadas pela API são sempre caminhos relativos iniciados por `/uploads/profile-photos/...` ou `/uploads/post-covers/...`.
- Graças ao rewrite configurado em `Front-Blog/next.config.ts` (`{ source: "/uploads/:path*", destination: "${origin}/uploads/:path*" }`), o frontend pode usar o caminho retornado diretamente no atributo `src` de `<img>` (como já fazem `Front-Blog/src/app/_components/avatar.tsx` e `Front-Blog/src/app/posts/[slug]/page.tsx`), validando sempre se a string começa com `/uploads/profile-photos/` ou `/uploads/post-covers/`.
- **Armazenamento local vs. Produção:** Atualmente, o código implementa armazenamento em disco local (`fs.promises` nos diretórios `uploads/profile-photos` e `uploads/post-covers`), mapeado em volume Docker (`uploads_data:/usr/src/app/uploads` no `docker-compose.yml`). Não há SDK de S3/Cloud Storage configurado no código atual.

---

## 12. Paginação e filtros

### 12.1. Paginação Baseada em Página (`page` e `limit`)
Utilizada por padrão em todos os endpoints paginados (`GET /posts`, `/posts/me`, `/posts/saved`, `/posts/trending`, `/posts/:postId/revisions`, `/feed`, `/collections/:id/posts`, `/categories`, `/categories/:idOrSlug/posts`, `/tags`, `/posts/:postId/comments`, `/posts/:postId/comments/:id/replies`, `/notifications`, `/users`, `/reports`, `/admin/audit-logs`).

- **Parâmetros:**
  - `page`: inteiro `>= 1` (padrão `1`).
  - `limit`: inteiro `1..100` (padrão `10` na maioria das rotas; `20` em comentários raiz, denúncias e logs de auditoria; `5` em respostas de comentários).
- **Estrutura de Resposta (`PaginatedResult<T>`):**
  ```json
  {
    "data": [ /* itens da página */ ],
    "meta": {
      "totalItems": 45,
      "itemCount": 10,
      "itemsPerPage": 10,
      "totalPages": 5,
      "currentPage": 1
    }
  }
  ```

### 12.2. Paginação por Cursor / Keyset (`cursor`)
Suportada em **`GET /api/v1/posts`** e **`GET /api/v1/posts/:postId/comments`** para rolagem infinita ou botão **"Mostrar mais"** sem custo de `OFFSET` em grandes volumes.

- **Como usar:**
  1. Na primeira chamada, envie `cursor=start` (ex.: `GET /api/v1/posts?limit=10&cursor=start`).
  2. O backend codifica a posição do último registro (`date` + `id` em Base64URL via `encodeCursor` em `src/common/utils/cursor.ts`) e retorna:
     ```json
     {
       "data": [ /* ... */ ],
       "meta": {
         "itemCount": 10,
         "itemsPerPage": 10,
         "nextCursor": "eyJkYXRlIjoiMjAyNi0wNC0xOVQxNDowMDowMC4wMDBaIiwiaWQiOiI4ZThjMzM4Ni0zZDY0LTQ4MDMtYjgxMS05YzlhMjc5YTc0YzUifQ",
         "hasMore": true
       }
     }
     ```
  3. Enquanto `meta.hasMore === true` e `meta.nextCursor` não for `null`, envie `cursor=<nextCursor>` na requisição seguinte e concatene `body.data` à lista existente no estado do React.

#### Exemplo de Botão "Mostrar mais" com Cursor em React:
```tsx
"use client";

import { useState } from "react";
import type { PublicPostSummary } from "../lib/public-post";

interface CursorMeta {
  itemCount: number;
  itemsPerPage: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export function LoadMorePosts({ initialPosts, initialCursor }: { initialPosts: PublicPostSummary[]; initialCursor: string | null }) {
  const [posts, setPosts] = useState<PublicPostSummary[]>(initialPosts);
  const [nextCursor, setNextCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    if (!nextCursor || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/posts?limit=10&cursor=${encodeURIComponent(nextCursor)}`);
      if (!res.ok) return;
      const body = (await res.json()) as { data: PublicPostSummary[]; meta: CursorMeta };
      setPosts((prev) => [...prev, ...body.data]);
      setNextCursor(body.meta.hasMore ? body.meta.nextCursor : null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Renderizar lista de posts */}
      {nextCursor ? (
        <button type="button" onClick={loadMore} disabled={loading}>
          {loading ? "Carregando..." : "Mostrar mais artigos"}
        </button>
      ) : null}
    </div>
  );
}
```

### 12.3. Busca e Ordenação
- **Ordenação em `GET /api/v1/posts`:**
  - Sem `search`: ordenado por `COALESCE(post.publishedAt, post.createdAt) DESC, post.id DESC`.
  - Com `search` (e sem `cursor`): ordenado por relevância textual `ts_rank(to_tsvector('blog_portuguese', ...), websearch_to_tsquery('blog_portuguese', :search)) DESC` e desempate por data de publicação `DESC`.
- **Ordenação nos demais endpoints:**
  - Categorias e Tags: `name ASC`
  - Comentários e Respostas: `createdAt ASC` (cronológica)
  - Notificações, Sessões, Revisões, Artigos Salvos e Logs de Auditoria: mais recentes primeiro (`DESC`).

---

## 13. Tratamento de erros

Todas as exceções passam pelo filtro global `GlobalExceptionFilter` (`src/common/global-exception.filter.ts`).

### 13.1. Formato Padrão de Erro HTTP
```json
{
  "statusCode": 400,
  "message": [
    "email must be an email",
    "password must be longer than or equal to 8 characters"
  ],
  "error": "Bad Request"
}
```
*(Nota: `message` pode ser uma `string` única ou um `string[]` quando originado pelo `ValidationPipe`).*

### 13.2. Tratamento de Erros de Banco de Dados no `GlobalExceptionFilter`
O filtro intercepta erros nativos do PostgreSQL (`QueryFailedError`) para nunca vazar detalhes internos de SQL ou estrutura de tabelas:

| Código PostgreSQL | Condição / Constraint | Status HTTP Retornado | Mensagem JSON Retornada |
|---|---|---|---|
| `23505` (`unique_violation`) | Violação de chave única não tratada no service | `409 Conflict` | `"Registro duplicado: um dos campos únicos já está em uso."` |
| `23514` (`check_violation`) | `Post awaiting review cannot be edited` | `409 Conflict` | `"O artigo em revisão não pode ser editado."` |
| `23514` (`check_violation`) | `First post requires approval` | `409 Conflict` | `"O primeiro artigo exige aprovação."` |
| Qualquer outro erro não-HTTP | Exceção interna inesperada | `500 Internal Server Error` | `{ "statusCode": 500, "timestamp": "...", "path": "/api/v1/...", "message": "Erro interno no servidor" }` |

### 13.3. Códigos de Status HTTP Utilizados pela API
- `200 OK`: Leitura, login, refresh, logout, confirmação de token ou atualização parcial bem-sucedida.
- `201 Created`: Criação de recurso, upload de imagem, submissão/decisão de revisão, restauração de revisão ou ação de moderação.
- `204 No Content`: Exclusão (`DELETE`) ou operação idempotente de estado (`PUT/DELETE` like, save, follow, coleção, `PATCH` leitura de notificação).
- `400 Bad Request`: Erro de validação de DTO (`ValidationPipe`), UUID inválido (`ParseUUIDPipe`), token expirado/inválido ou regra de negócio violada.
- `401 Unauthorized`: Ausência de JWT, JWT expirado/revogado, credenciais incorretas, conta bloqueada temporariamente ou código TOTP inválido.
- `403 Forbidden`: Papel insuficiente (`RolesGuard`), tentativa de alterar recurso de outro usuário, comentários desabilitados no post ou conta suspensa pela moderação.
- `404 Not Found`: Recurso inexistente, desativado (`isActive: false`) ou rascunho acessado por usuário sem permissão.
- `409 Conflict`: Conflito de estado (e-mail/categoria duplicada, 1º post exigindo aprovação, post em revisão bloqueado para edição, TOTP já ativo, atualização concorrente de upload).
- `413 Payload Too Large`: Upload acima de 5 MB.
- `429 Too Many Requests`: Limite de requisições por minuto excedido (`ThrottlerGuard`).
- `503 Service Unavailable`: Banco de dados indisponível (`/api/v1/health`) ou provedor OAuth social não configurado no `.env`.

---

## 14. Referência ao Swagger/OpenAPI

A configuração do Swagger está em `src/docs/swagger.config.ts` e utiliza decorators customizados em `src/docs/decorators/` (`auth.decorator.ts`, `users.decorator.ts`, `posts.decorator.ts`, `categories.decorator.ts`) além de `@ApiTags` e `@ApiBearerAuth()` nos demais controllers.

- **URL de acesso local:** `http://localhost:3000/api/docs`
- **Comportamento por ambiente:** Em `src/main.ts`, o Swagger só é registrado quando `process.env.NODE_ENV !== 'production'`. Em produção, `/api/docs` retorna `404`.
- **Autenticação no Swagger UI:** Clique no botão **Authorize** no topo da página e informe o `access_token` obtido em `POST /api/v1/auth/login` (esquema `bearer` / `JWT`).
- **Observação:** Os controllers de `Auth`, `Users`, `Posts` e `Categories` possuem documentação detalhada de schemas via decorators customizados (`src/docs/decorators/*`), enquanto os controllers adicionados nas sprints seguintes (`Totp`, `SocialAuth`, `PostInteractions`, `PostViews`, `PostReview`, `PostRevisions`, `PostSeries`, `Authors`, `AuthorFollows`, `SavedCollections`, `Tags`, `Comments`, `Notifications`, `Newsletter`, `Reports`, `Moderation`, `Analytics`, `Audit`) expõem suas rotas e DTOs automaticamente no Swagger sob suas respectivas `@ApiTags`, mas este `README.md` é a referência mais completa por documentar também os contratos internos e regras de negócio de todos os 104 endpoints.

---

## 15. Limitações, funcionalidades não implementadas e Estado atual da integração frontend/backend

### 15.1. Limitações Conhecidas e Características da Implementação Atual
1. **Exposição do status de 2FA (`totpEnabled`) no perfil do usuário:**
   - O método `UsersService.toPublic()` (`src/modules/users/users.service.ts`) omite os campos internos de segredo e também não inclui o booleano `totpEnabled` na resposta de `GET /api/v1/users/:id`. Por isso, o frontend (`Front-Blog/src/app/conta/totp-settings.tsx`) não sabe de antemão se o TOTP já está ativo e exibe simultaneamente os formulários de ativar (que retorna `409` se já ativo) e desativar (que retorna `400` se inativo).
2. **Campo `slug` ausente na listagem `GET /api/v1/posts/saved`:**
   - Em `PostInteractionsService.saved()` (`src/modules/posts/post-interactions.service.ts`), a query `.select([...])` seleciona `post.id`, `post.title`, `post.excerpt`, etc., mas não inclui `post.slug`. No frontend (`Front-Blog/src/app/conta/salvos/saved-posts.tsx`), o link aponta para `/posts/${post.id}`. Como `GET /api/v1/posts/:id` resolve tanto UUID quanto `slug` e a página `Front-Blog/src/app/posts/[slug]/page.tsx` faz `permanentRedirect('/posts/' + post.slug)` quando o parâmetro da URL difere de `post.slug`, a navegação funciona via redirecionamento 308, mas requer uma requisição extra.
3. **Armazenamento de imagens restrito ao disco local:**
   - Uploads de fotos de perfil e capas de artigos são gravados no sistema de arquivos local (`uploads/`). Não há integração implementada com provedores de armazenamento em nuvem (S3, GCS, Cloudflare R2).
4. **Remoção isolada de foto de perfil:**
   - Diferentemente da capa de artigo (que possui `DELETE /api/v1/posts/:id/cover-image`), não existe um endpoint `DELETE /api/v1/users/:id/profile-photo` nem suporte a `profilePhoto: null` no `UpdateUserDto`; a foto de perfil só pode ser substituída por outra imagem.
5. **Funcionalidades da interface do Frontend condicionadas a Feature Flags de ambiente:**
   - No `Front-Blog`, a criação e edição de artigos (`/studio/novo` e `/studio/[id]`) exigem `EDITORIAL_WORKFLOW_ENABLED=true` no servidor Next.js, e a tela de revisão administrativa (`/gestao-editorial`) exige `ENABLE_ADMIN_BFF=true`. Sem essas variáveis no ambiente do frontend, as páginas exibem apenas avisos informando que o fluxo está desabilitado.
6. **Publicação direta e agendamento no Editor do Frontend (`Studio`):**
   - Embora o backend permita que autores com `firstPostApproved = true` e administradores publiquem diretamente (`published: true`) ou agendem (`scheduledAt`) via `POST /api/v1/posts` e `PATCH /api/v1/posts/:id`, o componente `Front-Blog/src/app/studio/editor.tsx` atualmente só envia `{ title, content, categoryIds, tagNames }` (salvando como rascunho) e oferece apenas o botão `"Enviar para revisão"` (`POST /api/v1/post-reviews/:id/submit`), que falha com `400 Autor já possui aprovação para publicar diretamente` quando o autor já teve seu primeiro artigo aprovado.

---

### Estado atual da integração frontend/backend

A auditoria cruzada entre os **104 endpoints do backend** e o código-fonte do **frontend (`Front-Blog/src`)** identificou:
- **45 endpoints integrados** no frontend (**38 totalmente integrados** e **7 parcialmente integrados**).
- **59 endpoints disponíveis no backend que ainda não são consumidos pelo frontend.**
- **Nenhuma requisição do frontend aponta para rota inexistente** — todas as rotas chamadas pelo frontend existem no backend, porém há divergências pontuais de contrato/UX detalhadas na tabela abaixo.

| Funcionalidade | Endpoint | Integração frontend | Observação |
|---|---|---|---|
| Health Check da API e Banco | `GET /api/v1/health` | Ausente | Disponível no backend; não utilizado pelo frontend. |
| Login com e-mail, senha e TOTP | `POST /api/v1/auth/login` | Integrado | Usado em `src/lib/session-client.ts` e `src/app/entrar/login-form.tsx`. **Divergência menor:** quando o backend retorna `403` por suspensão (`{ message, reason, endsAt }`), o frontend ignora o JSON e exibe mensagem genérica. |
| Renovação de sessão (Refresh Token) | `POST /api/v1/auth/refresh` | Integrado | Coordenado entre abas via Web Locks + BroadcastChannel em `src/lib/session-client.ts`. |
| Logout da sessão atual | `POST /api/v1/auth/logout` | Integrado | Usado em `src/lib/session-client.ts` (`logoutSession`). |
| Listagem de sessões ativas | `GET /api/v1/auth/sessions` | Integrado | Usado em `src/app/conta/sessoes/sessions-list.tsx`. |
| Revogação de sessão específica | `DELETE /api/v1/auth/sessions/:id` | Integrado | Usado em `src/app/conta/sessoes/sessions-list.tsx` (se revogar a sessão `current`, dispara logout local). |
| Solicitar recuperação de senha | `POST /api/v1/auth/forgot-password` | Integrado | Usado em `src/app/recuperar-senha/page.tsx` via `src/app/_account-flow/flow.tsx`. |
| Redefinir senha com token | `POST /api/v1/auth/reset-password` | Integrado | Usado em `src/app/reset-password/page.tsx` via `src/app/_account-flow/flow.tsx`. |
| Iniciar login social OAuth2 | `GET /api/v1/auth/social/:provider/start` | Ausente | Não há botões de login com Google/GitHub em `/entrar` ou `/cadastro`. |
| Vincular conta social OAuth2 | `POST /api/v1/auth/social/:provider/link` | Ausente | Sem interface de vinculação social em `/conta`. |
| Callback OAuth2 social | `GET /api/v1/auth/social/:provider/callback` | Ausente | Rota implementada no backend, sem página de retorno integrada no frontend. |
| Desafio TOTP no login social | `POST /api/v1/auth/social/challenge` | Ausente | Não integrado no frontend. |
| Iniciar configuração de 2FA (TOTP) | `POST /api/v1/auth/totp/setup` | Integrado | Usado em `src/app/conta/totp-settings.tsx`. |
| Confirmar e ativar 2FA (TOTP) | `POST /api/v1/auth/totp/enable` | Integrado | Usado em `src/app/conta/totp-settings.tsx` (força novo login após ativar). |
| Desativar 2FA (TOTP) | `POST /api/v1/auth/totp/disable` | Integrado | Usado em `src/app/conta/totp-settings.tsx` (força novo login após desativar). |
| Consultar regras para se tornar autor | `GET /api/v1/users/author-rules` | Integrado | Usado em `src/app/studio/studio.tsx`. |
| Promover leitor para autor (`AUTHOR`) | `POST /api/v1/users/me/author` | Integrado | Usado em `src/app/studio/studio.tsx` e seguido de `refreshSession()` para atualizar o papel em memória. |
| Confirmar e-mail de cadastro | `POST /api/v1/users/confirm-email` | Integrado | Usado em `src/app/confirmar-email/page.tsx`. |
| Reenviar e-mail de verificação | `POST /api/v1/users/resend-verification` | Integrado | Usado em `src/app/reenviar-verificacao/page.tsx`. |
| Confirmar troca de endereço de e-mail | `POST /api/v1/users/confirm-email-change` | Ausente | Backend suporta troca de e-mail e envia link com `&type=email-change`, mas `/confirmar-email` só chama `/users/confirm-email`. |
| Upload de foto de perfil | `POST /api/v1/users/:id/profile-photo` | Integrado | Usado em `src/app/conta/foto/photo-form.tsx` com campo `file`. |
| Cadastro de novo usuário | `POST /api/v1/users` | Integrado | Usado em `src/app/cadastro/page.tsx`. |
| Listagem administrativa de usuários | `GET /api/v1/users` | Ausente | Não há painel de gestão de usuários no frontend. |
| Obter dados do usuário autenticado | `GET /api/v1/users/:id` | Integrado | Usado em `/conta`, `/conta/perfil`, `/studio` e `/studio/editor.tsx`. **Observação:** resposta não inclui `totpEnabled`. |
| Atualizar perfil, senha, e-mail ou role | `PATCH /api/v1/users/:id` | Parcial | Integrado para `name`, `bio`, `websiteUrl`, `socialUrl` (`/conta/perfil`) e `password` (`/conta/senha`). **Ausente no frontend:** alteração de `email` e alteração administrativa de `role`/`isActive`. |
| Desativar (excluir) conta de usuário | `DELETE /api/v1/users/:id` | Ausente | Não há botão de exclusão/desativação da própria conta em `/conta`. |
| Listar artigos públicos e busca | `GET /api/v1/posts` | Parcial | Integrado com `page`, `limit` e `search` em `src/app/page.tsx` e `authorId` em `/autores/[id]`. **Ausente no frontend:** uso de `cursor`, `categorySlug`, `tagSlug`. |
| Listar artigos do próprio autor | `GET /api/v1/posts/me` | Integrado | Usado em `src/app/studio/studio.tsx`. |
| Listar artigos relacionados | `GET /api/v1/posts/:id/related` | Integrado | Usado em `src/app/posts/[slug]/related.ts`. |
| Obter artigo por slug ou UUID | `GET /api/v1/posts/:id` | Parcial | Usado em `/posts/[slug]/page.tsx` (público) e `/studio/editor.tsx` (autenticado). **Observação:** o campo `series` retornado pelo backend é ignorado por `normalizePostDetail` em `public-post.ts`. |
| Criar artigo | `POST /api/v1/posts` | Parcial | Usado em `src/app/studio/editor.tsx` (requer `EDITORIAL_WORKFLOW_ENABLED=true`). Sempre cria rascunho; não expõe campos `published` nem `scheduledAt`. |
| Editar artigo | `PATCH /api/v1/posts/:id` | Parcial | Usado em `src/app/studio/editor.tsx`. Envia apenas `{ title, content, categoryIds, tagNames }`; não permite publicar/despublicar (`published`), agendar (`scheduledAt`) ou alternar `commentsEnabled`. |
| Upload de imagem de capa do artigo | `POST /api/v1/posts/:id/cover-image` | Integrado | Usado em `src/app/studio/editor.tsx`. |
| Remover imagem de capa do artigo | `DELETE /api/v1/posts/:id/cover-image` | Integrado | Usado em `src/app/studio/editor.tsx`. |
| Excluir artigo (soft delete) | `DELETE /api/v1/posts/:id` | Ausente | Não há botão para excluir rascunho ou artigo no `/studio`. |
| Listar artigos salvos pelo usuário | `GET /api/v1/posts/saved` | Parcial | Usado em `src/app/conta/salvos/saved-posts.tsx`. **Inconsistência:** o backend não seleciona `post.slug` em `saved()`, fazendo o frontend gerar links `/posts/${post.id}` que dependem de redirect 308. |
| Consultar estado de curtida/salvo | `GET /api/v1/posts/:id/interaction` | Integrado | Usado em `src/app/posts/[slug]/interactions.tsx`. |
| Curtir artigo | `PUT /api/v1/posts/:id/like` | Integrado | Usado em `src/app/posts/[slug]/interactions.tsx`. |
| Descurtir artigo | `DELETE /api/v1/posts/:id/like` | Integrado | Usado em `src/app/posts/[slug]/interactions.tsx`. |
| Salvar artigo nos favoritos | `PUT /api/v1/posts/:id/save` | Integrado | Usado em `src/app/posts/[slug]/interactions.tsx`. |
| Remover artigo dos salvos | `DELETE /api/v1/posts/:id/save` | Integrado | Usado em `src/app/posts/[slug]/interactions.tsx` e `src/app/conta/salvos/saved-posts.tsx`. |
| Listar artigos em alta (7 dias) | `GET /api/v1/posts/trending` | Ausente | Disponível no backend; nenhuma seção "Em alta" na home do frontend. |
| Registrar visualização de artigo | `POST /api/v1/posts/:id/views` | Integrado | Usado em `src/app/posts/[slug]/post-view-tracker.tsx`. |
| Submeter 1º artigo para revisão | `POST /api/v1/post-reviews/:id/submit` | Parcial | Usado em `src/app/studio/editor.tsx`. **Observação:** o botão continua sendo exibido mesmo para autores que já têm `firstPostApproved: true`, para os quais a rota retorna `400`. |
| Listar fila de revisão editorial (Admin) | `GET /api/v1/post-reviews` | Integrado | Usado via Route Handler BFF em `src/app/gestao-editorial/queue/route.ts` (requer `ENABLE_ADMIN_BFF=true`). |
| Aprovar ou rejeitar artigo em revisão | `POST /api/v1/post-reviews/:id/decision` | Integrado | Usado via Route Handler BFF em `src/app/gestao-editorial/decision/route.ts`. |
| Listar histórico de revisões do artigo | `GET /api/v1/posts/:postId/revisions` | Ausente | Não integrado no editor do `/studio`. |
| Obter conteúdo de uma revisão | `GET /api/v1/posts/:postId/revisions/:revisionId` | Ausente | Não integrado no editor do `/studio`. |
| Restaurar revisão de um artigo | `POST /api/v1/posts/:postId/revisions/:revisionId/restore` | Ausente | Não integrado no editor do `/studio`. |
| Listar séries do próprio autor | `GET /api/v1/series/me` | Ausente | Módulo de séries não possui interface no frontend. |
| Detalhar série para gerenciamento | `GET /api/v1/series/:id/manage` | Ausente | Não integrado no frontend. |
| Obter série pública por ID ou slug | `GET /api/v1/series/:id` | Ausente | Não integrado no frontend. |
| Criar série de artigos | `POST /api/v1/series` | Ausente | Não integrado no frontend. |
| Atualizar série de artigos | `PATCH /api/v1/series/:id` | Ausente | Não integrado no frontend. |
| Ordenar/definir artigos da série | `PUT /api/v1/series/:id/items` | Ausente | Não integrado no frontend. |
| Excluir série de artigos | `DELETE /api/v1/series/:id` | Ausente | Não integrado no frontend. |
| Obter série vinculada a um artigo | `GET /api/v1/posts/:postId/series` | Ausente | Não integrado no frontend. |
| Perfil público do autor | `GET /api/v1/authors/:id` | Integrado | Usado em `src/app/autores/[id]/page.tsx`. |
| Feed pessoal de autores seguidos | `GET /api/v1/feed` | Ausente | Não há página de feed personalizado no frontend. |
| Consultar se segue um autor | `GET /api/v1/authors/:id/follow` | Ausente | Não há botão de seguir autor em `/autores/[id]`. |
| Seguir um autor | `PUT /api/v1/authors/:id/follow` | Ausente | Não integrado no frontend. |
| Deixar de seguir um autor | `DELETE /api/v1/authors/:id/follow` | Ausente | Não integrado no frontend. |
| Feed RSS 2.0 | `GET /api/v1/feed/rss` | Integrado | Exposto em `src/app/feed/rss/route.ts` via `proxyPublicXml`. |
| Feed RSS 2.0 (alias `.xml`) | `GET /api/v1/feed.xml` | Integrado | Exposto em `src/app/feed.xml/route.ts` via `proxyPublicXml`. |
| Feed Atom 1.0 | `GET /api/v1/feed/atom` | Integrado | Exposto em `src/app/feed/atom/route.ts` via `proxyPublicXml`. |
| Sitemap XML | `GET /api/v1/sitemap.xml` | Integrado | Exposto em `src/app/sitemap.xml/route.ts` via `proxyPublicXml`. |
| Criar coleção privada de salvos | `POST /api/v1/collections` | Ausente | `/conta/salvos` usa apenas salvos simples (`/posts/saved`), sem coleções. |
| Listar coleções privadas | `GET /api/v1/collections` | Ausente | Não integrado no frontend. |
| Renomear coleção privada | `PATCH /api/v1/collections/:id` | Ausente | Não integrado no frontend. |
| Excluir coleção privada | `DELETE /api/v1/collections/:id` | Ausente | Não integrado no frontend. |
| Listar artigos de uma coleção | `GET /api/v1/collections/:id/posts` | Ausente | Não integrado no frontend. |
| Adicionar artigo a uma coleção | `PUT /api/v1/collections/:id/posts/:postId` | Ausente | Não integrado no frontend. |
| Remover artigo de uma coleção | `DELETE /api/v1/collections/:id/posts/:postId` | Ausente | Não integrado no frontend. |
| Listar categorias públicas | `GET /api/v1/categories` | Integrado | Usado em `src/app/categorias/page.tsx` e no seletor de categorias de `src/app/studio/editor.tsx`. |
| Obter detalhes de categoria | `GET /api/v1/categories/:idOrSlug` | Integrado | Usado em `src/app/categorias/[slug]/page.tsx`. |
| Listar artigos de uma categoria | `GET /api/v1/categories/:idOrSlug/posts` | Integrado | Usado em `src/app/categorias/[slug]/page.tsx`. |
| Criar categoria (Admin) | `POST /api/v1/categories` | Ausente | Sem interface administrativa de categorias no frontend. |
| Editar categoria (Admin) | `PATCH /api/v1/categories/:id` | Ausente | Sem interface administrativa de categorias no frontend. |
| Excluir categoria (Admin) | `DELETE /api/v1/categories/:id` | Ausente | Sem interface administrativa de categorias no frontend. |
| Listar tags públicas | `GET /api/v1/tags` | Ausente | Tags são exibidas nos artigos e enviadas como texto livre no editor, mas não há listagem/autocompletar via `/api/v1/tags`. |
| Obter detalhes de tag por slug | `GET /api/v1/tags/:slug` | Ausente | Não há página `/tags/[slug]` no frontend. |
| Listar comentários raiz do artigo | `GET /api/v1/posts/:postId/comments` | Integrado | Usado em `src/app/posts/[slug]/page.tsx` e `comments.ts`. |
| Listar respostas de um comentário | `GET /api/v1/posts/:postId/comments/:id/replies` | Integrado | Usado em `src/app/posts/[slug]/replies.tsx`. |
| Criar comentário ou resposta | `POST /api/v1/posts/:postId/comments` | Parcial | Usado em `comment-form.tsx` e `replies.tsx`. **Observação:** em `comment-create.ts`, a validação exige `item.rootId === replyToId && item.replyToId === replyToId`, funcionando apenas para respostas diretas ao comentário raiz. |
| Editar próprio comentário | `PATCH /api/v1/comments/:id` | Ausente | Não há botão de edição nos comentários renderizados. |
| Excluir comentário | `DELETE /api/v1/comments/:id` | Ausente | Não há botão de exclusão para o autor do comentário, autor do post ou Admin. |
| Consultar curtidas de comentário | `GET /api/v1/comments/:id/like` | Ausente | Comentários não exibem estado/contador de curtidas no frontend. |
| Curtir comentário | `PUT /api/v1/comments/:id/like` | Ausente | Não integrado no frontend. |
| Descurtir comentário | `DELETE /api/v1/comments/:id/like` | Ausente | Não integrado no frontend. |
| Listar notificações do usuário | `GET /api/v1/notifications` | Ausente | Não há sino ou página de notificações no frontend. |
| Marcar todas notificações como lidas | `PATCH /api/v1/notifications/read-all` | Ausente | Não integrado no frontend. |
| Marcar notificação como lida | `PATCH /api/v1/notifications/:id/read` | Ausente | Não integrado no frontend. |
| Confirmar newsletter (link GET HTML) | `GET /api/v1/newsletter/confirm` | Ausente | Funciona diretamente no backend via navegador, sem página dedicada no frontend. |
| Cancelar newsletter (link GET HTML) | `GET /api/v1/newsletter/unsubscribe` | Ausente | Funciona diretamente no backend via navegador, sem página dedicada no frontend. |
| Assinar newsletter | `POST /api/v1/newsletter/subscribe` | Ausente | Não há formulário de captura de newsletter no frontend. |
| Confirmar newsletter via JSON | `POST /api/v1/newsletter/confirm` | Ausente | Não integrado no frontend. |
| Cancelar newsletter via JSON | `POST /api/v1/newsletter/unsubscribe` | Ausente | Não integrado no frontend. |
| Denunciar artigo ou comentário | `POST /api/v1/reports` | Ausente | Não há botão de denúncia em artigos ou comentários. |
| Listar denúncias (Admin) | `GET /api/v1/reports` | Ausente | Não há painel de denúncias no frontend. |
| Resolver ou arquivar denúncia (Admin) | `PATCH /api/v1/reports/:id` | Ausente | Não integrado no frontend. |
| Suspender usuário e ocultar artigos | `POST /api/v1/admin/users/:id/suspension` | Ausente | Não integrado no frontend. |
| Restaurar usuário suspenso | `POST /api/v1/admin/users/:id/restore` | Ausente | Não integrado no frontend. |
| Visão geral de Analytics (Admin) | `GET /api/v1/admin/analytics/overview` | Ausente | Não integrado no frontend. |
| Listar logs de auditoria (Admin) | `GET /api/v1/admin/audit-logs` | Ausente | Não integrado no frontend. |
