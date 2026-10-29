import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';

export function setupSwagger(app: INestApplication): void {
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
      '1. Crie uma conta em `POST /api/v1/users` e faça login em `POST /api/v1/auth/login`.\n' +
      '2. Use o `access_token` retornado para chamar rotas protegidas. Por padrão, ele expira em 15 minutos; a duração pode ser configurada no servidor.\n' +
      '3. Para renovar a sessão, envie o cookie `refreshToken` em `POST /api/v1/auth/refresh`. O token de renovação é rotacionado a cada uso.\n' +
      '4. Encerre a sessão em `POST /api/v1/auth/logout`.\n\n' +
      '### Recursos e respostas\n' +
      '- Rotas públicas de posts retornam apenas artigos publicados e ativos. Categorias desativadas não aparecem nas listagens públicas.\n' +
      '- Listagens paginadas aceitam `page` e `limit` (padrão 1 e 10; limite máximo 100) e retornam `data` e `meta`.\n' +
      '- Respostas `400` indicam parâmetros inválidos; `401`, autenticação ausente ou inválida; `403`, permissão insuficiente; `404`, recurso indisponível; `409`, conflito de unicidade; `500`, erro interno.\n' +
      '- Exclusões retornam `204 No Content` e desativam o registro logicamente.',
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
    .addTag('Auth', 'Operações de autenticação, renovação de tokens e encerramento de sessão')
    .addTag('Users', 'Operações de gerenciamento de usuários')
    .addTag('Posts', 'Operações de gerenciamento e consulta de artigos')
    .addTag('Tags', 'Consulta das tags associadas aos artigos')
    .addTag('Categorias', 'Consulta de categorias e administração por usuários ADMIN')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });
}
