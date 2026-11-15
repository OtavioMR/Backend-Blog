# Grifório: arquitetura PostgreSQL

Atualizado em 14/11/2026. Documento operacional atual; substitui instruções antigas de cache, fila e sessões administrativas. Não houve commit, push ou deploy.

## Componentes

- Next.js 16 com BFF administrativo no runtime Node. O navegador administrativo recebe somente um ID opaco HttpOnly, SameSite Strict, Secure em produção e sem Domain.
- NestJS + TypeORM para autenticação, autorização, conteúdo e processamento persistente.
- PostgreSQL como autoridade para sessões administrativas, refresh V2, limites distribuídos e fila de e-mails.
- SMTP para entrega; newsletter permanece desativada na V1. Consultas públicas vão diretamente ao PostgreSQL.
- Não há serviço de cache ou broker externo. Redis e BullMQ foram retirados das dependências e do runtime.

## Sessões administrativas

`admin_bff_sessions` contém chave derivada do site e hash do ID, payload AES-256-GCM com AAD, prazo efetivo, versão e concessão com proprietário aleatório. O segredo de cifragem permanece fora do banco.

A criação confirma a persistência antes de emitir o cookie. Leituras verificam o prazo no banco e os limites absoluto/inatividade no payload. Toda atualização exige proprietário, concessão não vencida, versão esperada e sessão existente. Logout exclui a linha; uma atualização atrasada não pode recriá-la. A exclusão de uma sessão já removida é idempotente.

A concessão dura 60 s e a aquisição espera no máximo 25 s. Cada comando é uma transação curta/autocommit. Não se mantém conexão ou transação aberta durante HTTP. A operação de refresh é confirmada no armazenamento ANTES da chamada ao Nest; cookies recebidos são confirmados antes de depender do corpo completo da resposta. O protocolo V2 e sua recuperação de resultados continuam no PostgreSQL, sem alterações de política de reuso.

`ADMIN_SESSION_MAX_SECONDS` e `ADMIN_SESSION_IDLE_SECONDS` preservam os padrões de 12 h e 2 h. Não há fallback de armazenamento. As sessões antigas do armazenamento removido são invalidadas nesta refatoração local.

Na Vercel, configurar `ADMIN_SESSION_DATABASE_URL`, `ADMIN_SESSION_ENCRYPTION_KEY` e `SITE_ORIGIN` estáveis. Usar o endpoint com pooling do PostgreSQL primário. Cada processo Next tem no máximo duas conexões; esse pool é somente otimização. Hosts externos exigem TLS com validação de certificado; `ADMIN_SESSION_DB_CA` aceita CA própria. Nunca usar `NEXT_PUBLIC_` para essas variáveis.

Criar uma role exclusiva do BFF no provedor, com acesso apenas à tabela de sessões. Após criar a role e sua senha por canal seguro, aplicar com uma conta de migrations, adaptando schema/nome:

```sql
GRANT USAGE ON SCHEMA public TO griforio_bff;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_bff_sessions TO griforio_bff;
```

Não conceder acesso a usuários, hashes de senha, outbox ou refresh operations. No Supabase, não expor essa tabela por APIs públicas; revisar grants e RLS. Não executar migrations com a role do BFF.

## Fila de e-mails

`mail_outbox` preserva os payloads cifrados e possui estados `pending`, `processing`, `delivered`, `expired` e `failed`. Possui tentativas, prazo, próxima execução, versão, proprietário, concessão, conclusão e erro classificado sem conteúdo sensível.

O processador verifica a cada segundo. Uma transação curta usa bloqueio transacional para coordenar a capacidade e reserva linhas com `FOR UPDATE SKIP LOCKED`. Há no máximo cinco reservas válidas por fila, inclusive com vários processos. A concessão dura 120 s. SMTP ocorre depois do commit, com timeouts de conexão, saudação e socket. Sucesso/falha só são confirmados pelo proprietário e versão ainda válidos.

Se o processo morrer, outro recupera a reserva vencida. Um processador antigo não consegue confirmar nem reagendar a nova reserva. A falha de banco mantém o job durável. O backoff começa em 5 s e termina em 5 min; mensagens transacionais têm até 300 tentativas, sempre limitadas pelo vencimento original. Jobs expirados e falhas definitivas são preservados para observação. Após sete dias da conclusão, o payload é apagado, mantendo os metadados de diagnóstico.

Não existe garantia de entrega exatamente uma vez: SMTP pode aceitar a mensagem antes de uma queda que impeça confirmar o sucesso no banco. Retentativas podem duplicar mensagens nessa janela, inclusive se um envio sobreviver ao vencimento da concessão. `Message-ID` estável ajuda rastreamento, mas não obriga deduplicação pelo provedor. Para garantia adicional, usar um provedor com idempotência explícita.

`transactionalMail` continua inserindo mensagens na mesma transação das operações de recuperação/segurança. Cadastro, recuperação de senha e alteração de endereço continuam usando a fila. Nunca usar SMTP real nos testes; as provas novas capturam o transporte em loopback.

`MAIL_QUEUE_NAME` é `default` no uso normal e isola fixtures sintéticas. Não configurar um namespace aleatório em cada réplica de produção. A newsletter preserva seus handlers, deduplicação e entregas PostgreSQL, sem ser registrada na V1.

A cifragem de mensagens preserva a derivação da chave a partir de `JWT_SECRET`. Rotacionar esse segredo exige drenar ou recifrar mensagens pendentes; não há recifragem automática. Isso também vale para backups que contenham jobs cifrados.

Observabilidade:

- `GET /api/v1/admin/mail-queue`: somente administrador autorizado; contagens, idade máxima e reservas vencidas, sem payloads ou destinatários.
- Logs `mail_job_delivered`, `mail_job_attempt`, `mail_job_lease_lost` e `mail_queue_unavailable`, com ID/tentativa/estado, sem tokens ou endereços.
- Alertar para idade de pendências, `failed`, `stalled` e falhas repetidas. O health público verifica banco e não comprova entrega SMTP.
- A API Node e seus agendadores precisam permanecer ativos no Render; funções Next não executam a fila.

## Rate limiting e proxies

`security_attempts` limita atomicamente a confirmação de cadastro a cinco tentativas por e-mail normalizado/HMAC durante 24 h desde a primeira tentativa. Reenvio não reinicia o contador. Falha de banco retorna 503; excesso retorna 429.

`http_rate_limits` substitui o armazenamento padrão do throttler. Mantém janela móvel limitada em tamanho, bloqueio com prazo e chaves por finalidade/rota/IP normalizado. As réplicas compartilham o mesmo estado. Bloqueios não são estendidos por cada requisição rejeitada. Decorators, limites e respostas do throttler foram mantidos. Falha de banco fecha o acesso com 503.

`RATE_LIMIT_NAMESPACE` é um isolamento para testes. Em produção, omitir essa variável ou usar exatamente o mesmo valor em todas as réplicas.

Por padrão, `trust proxy` é falso: um cliente direto não escolhe seu IP com `X-Forwarded-For`. `TRUST_PROXY_CIDRS` aceita somente IPs/CIDRs explícitos. Não usar contagem de saltos ou confiança irrestrita. O proxy autorizado precisa substituir headers recebidos, e o acesso direto à API deve ser restringido.

Chamadas próprias do BFF usam o IP do servidor se não houver identidade de cliente estabelecida por uma cadeia confiável. Isso é conservador, mas pode agregar limites de vários administradores. Não resolver esse caso copiando headers arbitrários. A cadeia Vercel/Render e o IP efetivo precisam ser homologados antes de liberar o primeiro deploy.

A limpeza periódica remove registros de coordenação vencidos em lotes. Expiração e bloqueio são verificados nas operações e não dependem dessa limpeza.

## Conteúdo público e desempenho

O cache público foi removido, incluindo interceptor, provider e invalidações sem consumidor. Toda leitura consulta os dados atuais; filtros de publicação, atividade, exclusão e autorização continuam nos serviços. O frontend mantém `no-store` nas áreas pertinentes. A versão global de cache e seus triggers foram removidos por migration nova, sem modificar migrations históricas.

Os índices existentes de busca textual/GIN/trigramas e os limites de paginação foram preservados. A fila recebeu índices por namespace, vencimento/reserva e próxima execução. Não foi criado cache substituto. O desempenho local medido não equivale a SLA: homologar p95/p99, conexões, locks, WAL e carga representativa no provedor escolhido.

## Banco e migrations

As migrations novas são [PostgresCoordination](../src/database/migrations/1798300000000-PostgresCoordination.ts) e [CoordinationIndexes](../src/database/migrations/1798400000000-CoordinationIndexes.ts). Foram aplicadas ao banco local configurado após backup; dados de negócio foram preservados. A primeira tentativa da nova migration reverteu ao encontrar um trigger antigo ausente; sua remoção passou a aceitar essa variação.

Neon/Supabase: usar PostgreSQL primário, TLS verificável, pooling compatível e permissões para as extensões já existentes (`uuid-ossp`, `unaccent`, `pg_trgm`). A API utiliza campos `DB_*`; a URL do BFF é independente. A aplicação não usa locks de sessão que atravessem requisições. Migrations devem rodar uma única vez por release com conexão apropriada, nunca por função Next.

## Iniciar localmente

Backend, após preencher o arquivo de ambiente conforme [.env.example](../.env.example):

```powershell
docker compose up -d postgres
npm ci
npm run build
npm run migration:run:prod
$env:NODE_ENV='development'
npm run start:prod
```

Frontend, após configurar seu arquivo de ambiente conforme [o exemplo](../../Front-Blog/.env.example):

```powershell
npm ci
npm run dev
```

O frontend local usa a porta 5173; ajustar `SITE_ORIGIN`, `FRONTEND_URL` e `API_ORIGIN` de forma coerente. Não usar SMTP externo para dados sintéticos sem intenção explícita. O compose de teste do frontend oferece Mailpit opcional; a suíte de fila também inicia seu próprio SMTP de captura.

## Validação

Ver o [relatório de execução](POSTGRES_VALIDATION.md) para resultados finais, limitações e arquivos alterados. Comandos principais:

```powershell
# Backend: construir antes da prova que encerra um processador em outro processo.
npm run build
$env:RUN_DB_TESTS='1'
npm test -- --no-file-parallelism
npm run test:e2e -- --no-file-parallelism
npm run typecheck
npm run lint
# Frontend
npm run typecheck
npm run lint
npm run build
npm run test:public
npm run test:session
npm run test:studio
npm run test:admin
node scripts/verify-postgres-local.mjs
```

As provas do frontend usam o banco local autorizado ou `TEST_DATABASE_URL`. A CI standalone prepara somente uma tabela sintética de sessão; o esquema de aplicação pertence às migrations do backend. A prova em Chromium precisa de Edge/Chromium e OpenSSL, faz cópias temporárias e usa contas/chaves sintéticas, sem alterar segredos configurados.

## Checklist antes do primeiro deploy

- [ ] PostgreSQL provisionado, migrations aplicadas uma vez e restauração de backup testada.
- [ ] Roles separadas de aplicação, migrations e BFF; tabela administrativa sem exposição pública.
- [ ] TLS e pools Vercel/Render/Neon ou Supabase homologados, com orçamento de conexões.
- [ ] Segredos existentes preservados e chaves estáveis/iguais entre réplicas da mesma implantação.
- [ ] Domínio HTTPS, cookies, CSRF, origens e passagem de `Set-Cookie` verificados.
- [ ] Cadeia de proxies e IP efetivo testados; acesso direto à API controlado.
- [ ] API/processador persistentes; entrega, retentativas e recuperação após restart verificadas.
- [ ] Alertas de fila, banco, falhas definitivas e atraso configurados.
- [ ] SMTP autorizado e armazenamento de uploads persistente/objeto homologados.
- [ ] Carga pública sem cache validada; newsletter continua desativada.
- [ ] Flags administrativas/editoriais habilitadas somente após os testes do ambiente final.
