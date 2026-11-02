import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';

export function setupSwagger(app: INestApplication, nodeEnv = process.env.NODE_ENV): void {
  if (nodeEnv === 'production') return;

  const config = new DocumentBuilder()
    .setTitle('Backend Blog API')
    .setDescription(
      'Documentação oficial e detalhada da API do Backend Blog.\n\n' +
        '### Autenticação & Segurança\n' +
        '- A API implementa autenticação via JWT Bearer Token nos recursos protegidos.\n' +
        '- O `refreshToken` é trafegado exclusivamente via Cookie HTTP-Only (`Path=/api/v1/auth`, `SameSite=Strict`).\n' +
        '- **Para autorizar no Swagger UI**: Clique no botão **Authorize** abaixo e informe apenas o seu `access_token` JWT (sem o prefixo "Bearer ").\n' +
        '- Endpoints públicos estão explicitamente marcados e não exigem token de autorização.\n\n' +
        '### Como usar\n' +
        '1. Crie uma conta em `POST /api/v1/users`, confirme o token enviado por e-mail em `POST /api/v1/users/confirm-email` e faça login em `POST /api/v1/auth/login`. Solicite outro token em `POST /api/v1/users/resend-verification` se necessário.\n' +
        '2. Use o `access_token` retornado para chamar rotas protegidas. Por padrão, ele expira em 15 minutos; a duração pode ser configurada no servidor.\n' +
        '3. Para renovar a sessão, envie o cookie `refreshToken` em `POST /api/v1/auth/refresh`. O token de renovação é rotacionado a cada uso.\n' +
        '4. Encerre a sessão em `POST /api/v1/auth/logout`.\n\n' +
        '### Conteúdo e SEO\n' +
        '- Feeds públicos: `GET /api/v1/feed/rss` e `/api/v1/feed/atom` fornecem os 50 artigos publicados mais recentes em XML para leitores de feed. `GET /api/v1/sitemap.xml` lista todos os artigos publicados para mecanismos de busca.\n' +
        '- Para recomendações, use `GET /api/v1/posts/{id}/related` com UUID ou slug; para o perfil público, use `GET /api/v1/authors/{id}` com o UUID em `author.id`.\n' +
        '- Para agendar uma publicação, autentique-se como autor ou administrador e envie um rascunho com `scheduledAt` futuro e fuso em `POST /api/v1/posts` ou `PATCH /api/v1/posts/{id}`. Consulte os exemplos dessas operações para remarcar, cancelar ou publicar imediatamente. A verificação ocorre a cada minuto enquanto a aplicação está em execução.\n\n' +
        '### Recursos e respostas\n' +
        '- Visitantes acessam posts publicados e ativos; autores e administradores também podem consultar rascunhos autorizados. Categorias desativadas não aparecem nas listagens públicas.\n' +
        '- Listagens de posts retornam `excerpt` e `publishedAt`; consulte o detalhe do post para obter `content`.\n' +
        '- Listagens paginadas aceitam `page` e `limit` (padrão 1 e 10; limite máximo 100) e retornam `data` e `meta`.\n' +
        '- Respostas `400` indicam parâmetros inválidos; `401`, autenticação ausente ou inválida; `403`, permissão insuficiente; `404`, recurso indisponível; `409`, conflito de unicidade; `500`, erro interno.\n' +
        '- Consulte a resposta de cada operação: exclusões podem ter comportamentos e status diferentes.\n- Para paginação por cursor em artigos e comentários, envie `cursor=start` e continue com `nextCursor`, mantendo filtros e limite. Uma alteração concorrente pode retornar 409; repita a consulta.\n- O TOTP exige configuração prévia e invalida sessões ao ser ativado ou desativado. O login social usa cookie temporário e pode exigir desafio TOTP.\n- Limites por IP e rota podem retornar 429 com `Retry-After`. Campos desconhecidos e dados inválidos são rejeitados com 400.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description:
          'Insira apenas o token JWT de acesso (sem "Bearer "). O Swagger adicionará o prefixo automaticamente.',
        in: 'header',
      },
      'JWT-auth',
    )
    .addSecurityRequirements('JWT-auth')
    .addTag(
      'Autenticação',
      'Operações de autenticação, renovação de tokens e encerramento de sessão',
    )
    .addTag('Usuários', 'Operações de gerenciamento de usuários')
    .addTag('Artigos', 'Operações de gerenciamento e consulta de artigos')
    .addTag('Feeds', 'Feeds RSS e Atom e sitemap público em XML')
    .addTag('Autores', 'Perfis públicos de autores e administradores')
    .addTag('Tags', 'Consulta das tags associadas aos artigos')
    .addTag(
      'Categorias',
      'Consulta de categorias e administração por usuários ADMIN',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      deepLinking: false,
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });
}
