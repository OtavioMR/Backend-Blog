# Backend Blog - API RESTful

API robusta, moderna e escalável desenvolvida em **NestJS** e **TypeScript**, projetada para alimentar plataformas editoriais completas, blogs corporativos e comunidades de criadores de conteúdo. O sistema conta com persistência em **PostgreSQL**, cache e filas assíncronas com **Redis**, além de documentação interativa via **Swagger/OpenAPI**.

---

## 📖 Sobre o Projeto

O **Backend Blog** foi concebido para resolver os principais desafios de uma plataforma de publicação moderna: performance na entrega de conteúdo, segurança e privacidade dos usuários, engajamento comunitário e ferramentas administrativas eficientes para governança.

### Para que serve?

A aplicação fornece toda a infraestrutura de backend necessária para:
- **Autores e Criadores:** Escrever, organizar em séries, agendar publicações, versionar revisões e acompanhar métricas de seus artigos.
- **Leitores:** Consumir conteúdos com busca inteligente e rápida, interagir através de comentários aninhados, curtir, salvar artigos em coleções personalizadas, seguir autores favoritos e assinar newsletters.
- **Equipes Editoriais e Administradores (Moderação):** Analisar denúncias de conteúdo, aplicar políticas de moderação, suspender contas irregulares e auditar operações sensíveis.
- **Integrações e SEO:** Distribuir conteúdo via feeds RSS/Atom, disponibilizar sitemap XML dinâmico e integrar com frontends modernos de forma segura.

---

## ⚙️ Como Funciona a Plataforma

A arquitetura do sistema é modular e orientada a serviços no NestJS. Os principais módulos e fluxos do sistema incluem:

### 1. Ciclo de Vida do Conteúdo (Artigos e Séries)
- **Rascunhos e Publicação:** Autores criam rascunhos que podem ser submetidos à revisão editorial ou publicados imediatamente.
- **Agendamento Automático:** Suporte para definir data e hora futuras de publicação, com um agendador interno que publica os artigos pontualmente.
- **Histórico de Revisões:** Cada alteração significativa em um artigo gera uma revisão histórica, permitindo auditoria e restauração de versões anteriores.
- **Séries e Coleções:** Artigos interligados podem ser agrupados em séries sequenciais (Ex: "Tutorial NestJS - Parte 1, 2, 3").
- **Busca Otimizada:** Mecanismo de busca textual integrado em PostgreSQL utilizando índices textuais em português e suporte a correspondência de termos por similaridade.

### 2. Gestão de Usuários e Permissões
- **Níveis de Acesso (RBAC):** Suporte nativo a 3 papéis hierárquicos:
  - `Leitor`: Cadastro padrão, leitura, comentários, curtidas, seguidores e coleções.
  - `Autor`: Criação e gerenciamento de artigos próprios e séries.
  - `Admin`: Controle administrativo geral, moderação de comentários/posts, análise de denúncias, auditoria e métricas do sistema (o papel de moderador é acumulado pelo administrador).
- **Perfis Públicos:** Bio, links sociais e upload de foto de perfil com validação e processamento seguro.

### 3. Interação Social e Comunidade
- **Comentários Aninhados:** Discussões estruturadas em tópicos com respostas encadeadas e curtidas em comentários.
- **Feed Personalizado:** Feed customizado combinando autores seguidos e recomendações de artigos em destaque.
- **Coleções Salvas:** Leitores podem organizar artigos favoritos em coleções públicas ou privadas.
- **Central de Notificações:** Notificações automáticas para novas interações (respostas a comentários, novos seguidores e novos posts de autores seguidos).

### 4. Segurança e Privacidade
- **Autenticação Dupla:** Tokens JWT de acesso de curta duração acompanhados de *Refresh Tokens* seguros armazenados em cookies HTTP-Only com proteção contra rotação indevida.
- **Autenticação em Dois Fatores (2FA / TOTP):** Camada adicional de proteção via aplicativos autenticadores (Google Authenticator, Authy, etc.).
- **Login Social (OAuth 2.0):** Opção de autenticação simplificada através de provedores como Google e GitHub.
- **Proteção contra Abusos:** Rate limiting configurável por rota, bloqueio temporário após tentativas consecutivas inválidas e sanitização contra ataques de injeção e XSS.

### 5. Comunicação Assíncrona e Performance
- **Disparo de E-mails Resiliente:** Confirmações de conta, recuperação de senhas e newsletters são processadas por filas em segundo plano utilizando Redis, garantindo que falhas de rede não afetem a experiência do usuário.
- **Cache Inteligente:** Listagens e consultas frequentes utilizam cache com invalidação automática sob alterações.
- **Feeds e SEO:** Rotas abertas para `/feed/rss`, `/feed/atom` e `/sitemap.xml` para indexação em buscadores e agregadores de notícias.

---

## 🚀 Tecnologias Utilizadas

- **Linguagem & Framework:** [Node.js](https://nodejs.org/), [TypeScript](https://www.typescriptlang.org/) e [NestJS](https://nestjs.com/)
- **Banco de Dados Relacional:** [PostgreSQL 16](https://www.postgresql.org/) com [TypeORM](https://typeorm.io/)
- **Filas e Cache:** [Redis 7](https://redis.io/) e [BullMQ](https://docs.bullmq.io/)
- **Documentação de API:** [Swagger / OpenAPI](https://swagger.io/)
- **Segurança:** Helmet, Throttler, Bcrypt, Passport JWT, Cookie-Parser, Sanitize-HTML
- **Conteinerização:** [Docker](https://www.docker.com/) e Docker Compose
- **Testes & Qualidade:** [Vitest](https://vitest.dev/) e [Oxlint](https://oxc.rs/)

---

## 📋 Pré-requisitos do Sistema

Antes de iniciar, verifique se você possui os seguintes softwares instalados na sua máquina:

1. **Node.js**: Versão `20.x` ou `24.x` (LTS recomendada).
2. **npm**: Versão `10.x` ou superior (incluso com o Node.js).
3. **Docker e Docker Compose**: Recomendado para inicializar rapidamente o PostgreSQL e o Redis sem necessidade de instalação manual.
   - *Alternativa:* Se preferir não usar Docker, certifique-se de ter instâncias ativas do PostgreSQL 16+ e do Redis 7+ instaladas e rodando localmente.
4. **Servidor SMTP (Opcional no início, recomendado para fluxos de e-mail):** Uma conta de e-mail ou serviço de teste (como Mailtrap, Gmail com senha de app, ou similar) para envio dos e-mails de confirmação e recuperação de senha.

---

## 🛠️ Passo a Passo para Instalação e Execução

### Passo 1: Clonar o Repositório

```bash
git clone https://github.com/seu-usuario/Backend-Blog.git
cd Backend-Blog
```

### Passo 2: Instalar as Dependências

Instale todos os pacotes necessários utilizando o gerenciador de pacotes `npm`:

```bash
npm install
```

---

### Passo 3: Configurar as Variáveis de Ambiente

O projeto utiliza um arquivo `.env` para carregar as configurações locais de portas, segredos e conexões. Crie o seu arquivo com base no exemplo:

**No Linux/macOS:**
```bash
cp .env.example .env
```

**No Windows (PowerShell):**
```powershell
Copy-Item .env.example .env
```

Abra o arquivo `.env` gerado e defina valores adequados para o seu ambiente local:

- **Banco de Dados:** Ajuste `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` e `DB_NAME`.
- **JWT:** Preencha `JWT_SECRET` e `JWT_REFRESH_SECRET` com cadeias de texto longas e aleatórias (mínimo de 32 caracteres).
- **Redis:** Mantenha `REDIS_URL=redis://127.0.0.1:6379` para desenvolvimento padrão.
- **SMTP:** Insira credenciais válidas para envio de e-mails em `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` e `SMTP_PASS`.

> ⚠️ **Aviso de Segurança:** Nunca versione ou compartilhe o seu arquivo `.env` em repositórios públicos.

---

### Passo 4: Inicializar o Banco de Dados e o Redis via Docker

Com o Docker em execução, suba apenas os serviços de infraestrutura (PostgreSQL e Redis) em segundo plano:

```bash
docker compose up -d postgres redis
```

Para verificar se os contêineres estão operando com sucesso:

```bash
docker compose ps
```

---

### Passo 5: Executar as Migrations do Banco de Dados

As **migrations** são responsáveis por criar e atualizar a estrutura de tabelas, índices e relacionamentos no banco de dados de forma versionada e controlada.

#### Aplicar as migrations:
Para rodar todas as migrations pendentes no banco configurado, execute:

```bash
npm run migration:run
```

#### Outros comandos úteis de migration:
- **Reverter a última migration aplicada:**
  ```bash
  npm run migration:revert
  ```
- **Gerar uma nova migration a partir das entidades:**
  ```bash
  npm run migration:generate -- src/database/migrations/NomeDaSuaMigration
  ```

---

### Passo 6: Iniciar o Servidor da Aplicação

Com o banco preparado e as migrations aplicadas, inicie a API:

#### Modo de Desenvolvimento (com reinicialização automática ao salvar arquivos):
```bash
npm run start:dev
```

#### Modo de Produção (compilado):
```bash
npm run build
npm run start:prod
```

---

### Passo 7: Acessar a Aplicação e a Documentação

Assim que o servidor for inicializado, você verá logs indicando que a porta está pronta para receber requisições (por padrão `http://localhost:3000`).

- **Documentação Interativa (Swagger UI):**
  Acesse no navegador:
  👉 [http://localhost:3000/api/docs](http://localhost:3000/api/docs)
  *(Permite testar todas as rotas, visualizar parâmetros esperados, esquemas de resposta e realizar autenticação).*

- **Verificação de Saúde (Health Check):**
  Acesse no navegador ou cliente HTTP:
  👉 [http://localhost:3000/api/v1/health](http://localhost:3000/api/v1/health)

- **Feeds Públicos e Sitemap:**
  - RSS: `http://localhost:3000/api/v1/feed/rss`
  - Atom: `http://localhost:3000/api/v1/feed/atom`
  - Sitemap: `http://localhost:3000/api/v1/sitemap.xml`

---

## 🐳 Executando a Stack Completa com Docker

Se desejar executar toda a solução (incluindo a API, PostgreSQL e Redis) encapsulada em contêineres Docker:

1. Certifique-se de que o arquivo `.env` foi configurado.
2. Execute o comando com o perfil `app`:

```bash
docker compose --profile app up -d --build --wait
```

Nesse cenário:
- A aplicação será compilada e executada em contêiner próprio.
- As migrations serão aplicadas automaticamente na inicialização.
- Para encerrar os serviços:
  ```bash
  docker compose down
  ```
  *(Evite utilizar a flag `-v` para não excluir os volumes de dados persistentes do banco e das imagens de upload).*

---

## 🔐 Configurações e Variáveis de Ambiente

Principais variáveis contidas no arquivo `.env.example`:

| Grupo | Variável | Descrição / Exemplo |
| :--- | :--- | :--- |
| **Aplicação** | `NODE_ENV` | Ambiente de execução (`development`, `production` ou `test`). |
| | `PORT` | Porta HTTP em que a API escuta (padrão: `3000`). |
| **Banco de Dados** | `DB_HOST`, `DB_PORT` | Endereço do host e porta do PostgreSQL (padrão: `localhost`, `5432` ou `5433`). |
| | `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Credenciais e nome do banco de dados relacional. |
| **Autenticação** | `JWT_SECRET`, `JWT_REFRESH_SECRET` | Chaves secretas exclusivas para assinatura dos tokens JWT. |
| | `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`| Tempo de validade dos tokens em segundos (ex: `900` e `604800`). |
| | `TOTP_ENCRYPTION_KEY` | Chave de criptografia para 2FA/TOTP (opcional, 64 caracteres hexadecimais). |
| **Mensageria** | `REDIS_URL` | URL de conexão com a instância Redis para filas e cache. |
| | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Configurações do servidor de e-mail para mensagens transacionais. |
| **Integração** | `FRONTEND_URL` | Origem da aplicação frontend (para redirecionamentos e CORS). |
| | `PUBLIC_API_URL` | Endereço público da API (usado em links de confirmação e newsletter). |

---

## 🧪 Testes e Qualidade de Código

O projeto conta com uma suíte de testes automatizados e linters para assegurar a consistência do código:

```bash
# Executar a suíte de testes unitários
npm run test

# Executar testes em modo assistido (watch)
npm run test:watch

# Executar testes com relatório de cobertura
npm run test:cov

# Executar testes ponta a ponta (E2E)
npm run test:e2e

# Executar análise estática de código (Linter)
npm run lint

# Formatar o código de acordo com o padrão do projeto
npm run format
```

---

## 📂 Estrutura de Diretórios

A estrutura do projeto segue as convenções e padrões recomendados do NestJS:

```text
Backend-Blog/
├── src/
│   ├── common/         # Filtros globais, interceptors, guards e validações compartilhadas
│   ├── database/       # Configuração da DataSource do TypeORM e migrations versionadas
│   ├── docs/           # Modelos e configurações da documentação OpenAPI/Swagger
│   ├── modules/        # Módulos de domínio da aplicação
│   │   ├── analytics/  # Métricas e visualizações de artigos
│   │   ├── audit/      # Trilha de auditoria para ações administrativas
│   │   ├── auth/       # Autenticação JWT, 2FA/TOTP e login social
│   │   ├── categories/ # Gestão de categorias de artigos
│   │   ├── comments/   # Comentários e respostas em árvore
│   │   ├── mail/       # Processamento e envio resiliente de e-mails
│   │   ├── moderation/ # Moderação de conteúdo e gestão de suspensões
│   │   ├── newsletter/ # Gestão de inscrições e envios de newsletter
│   │   ├── notifications/ # Central de notificações para usuários
│   │   ├── posts/      # Artigos, agendamentos, séries e histórico de versões
│   │   ├── reports/    # Sistema de denúncias de posts e comentários
│   │   ├── tags/       # Gestão de tags de conteúdo
│   │   └── users/      # Usuários, perfis de autores e seguidores
│   ├── app.module.ts   # Módulo raiz da aplicação
│   └── main.ts         # Ponto de entrada (bootstrap) da API NestJS
├── test/               # Suíte de testes de integração e ponta a ponta (E2E)
├── uploads/            # Armazenamento local de uploads de mídia e avatares
├── docker-compose.yml  # Definição dos serviços PostgreSQL, Redis e aplicação
├── Dockerfile          # Imagem de produção da aplicação
└── package.json        # Dependências e scripts do ecossistema Node.js
```

---

## 📄 Licença

Este projeto é desenvolvido para fins educacionais e profissionais. Consulte os termos de uso antes de distribuição pública.
