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
      '- Endpoints públicos estão explicitamente marcados e não exigem token de autorização.',
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
