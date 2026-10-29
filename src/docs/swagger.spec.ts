import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { UsersController } from '../modules/users/users.controller.js';
import { UsersService } from '../modules/users/users.service.js';
import { PostsController } from '../modules/posts/posts.controller.js';
import { PostsService } from '../modules/posts/posts.service.js';
import { AuthController } from '../modules/auth/auth.controller.js';
import { AuthService } from '../modules/auth/auth.service.js';
import { setupSwagger } from './swagger.config.js';
import {
  CommentsController,
  PostCommentsController,
} from '../modules/comments/comments.controller.js';
import { CommentsService } from '../modules/comments/comments.service.js';

describe('Swagger Documentation Configuration', () => {
  it('should generate OpenAPI document containing Auth, Users, and Posts endpoints', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        UsersController,
        PostsController,
        AuthController,
        CommentsController,
        PostCommentsController,
      ],
      providers: [
        { provide: UsersService, useValue: {} },
        { provide: PostsService, useValue: {} },
        { provide: AuthService, useValue: {} },
        { provide: CommentsService, useValue: {} },
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');

    const config = new DocumentBuilder()
      .setTitle('Backend Blog API')
      .setDescription('Documentação oficial da API do Backend Blog')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Insira o token JWT no formato: Bearer <token>',
          in: 'header',
        },
        'JWT-auth',
      )
      .addTag('Auth', 'Operações de autenticação e gerenciamento de tokens')
      .addTag('Users', 'Operações de gerenciamento de usuários')
      .addTag('Posts', 'Operações de gerenciamento e consulta de artigos')
      .build();

    const document = SwaggerModule.createDocument(app, config);

    expect(document.info.title).toBe('Backend Blog API');
    expect(document.info.version).toBe('1.0');
    expect(document.tags).toBeDefined();

    const tagNames = document.tags?.map((t) => t.name);
    expect(tagNames).toContain('Auth');
    expect(tagNames).toContain('Users');
    expect(tagNames).toContain('Posts');

    // Security definition check
    expect(document.components?.securitySchemes).toBeDefined();
    const securityScheme = document.components?.securitySchemes?.[
      'JWT-auth'
    ] as any;
    expect(securityScheme).toBeDefined();
    expect(securityScheme.type).toBe('http');
    expect(securityScheme.scheme).toBe('bearer');
    expect(securityScheme.bearerFormat).toBe('JWT');

    // Paths verification
    const paths = Object.keys(document.paths);
    expect(paths).toContain('/api/v1/auth/login');
    expect(paths).toContain('/api/v1/auth/refresh');
    expect(paths).toContain('/api/v1/auth/logout');
    expect(paths).toContain('/api/v1/users');
    expect(paths).toContain('/api/v1/users/{id}');
    expect(paths).toContain('/api/v1/posts');
    expect(paths).toContain('/api/v1/posts/{id}');
    expect(
      document.paths['/api/v1/posts/{postId}/comments'].post?.security,
    ).toEqual([{ 'JWT-auth': [] }]);
    expect(document.paths['/api/v1/comments/{id}'].patch?.security).toEqual([
      { 'JWT-auth': [] },
    ]);
    expect(
      document.paths['/api/v1/posts/{postId}/comments'].get?.security,
    ).toEqual([{}]);
    const createComment =
      document.paths['/api/v1/posts/{postId}/comments'].post;
    const requestBody = createComment?.requestBody;
    expect(
      requestBody &&
        'content' in requestBody &&
        requestBody.content['application/json'].examples,
    ).toMatchObject({
      comentario: { value: { content: 'Gostei do post!' } },
      resposta: {
        value: { content: 'Também gostei!', replyToId: expect.any(String) },
      },
    });

    // Verify DTO schemas generated in components
    const schemas = document.components?.schemas;
    expect(schemas).toBeDefined();
    expect(schemas).toHaveProperty('LoginDto');
    expect(schemas).toHaveProperty('CreateUserDto');
    expect(schemas).toHaveProperty('CreatePostDto');

    // Verify setupSwagger executes without error
    expect(() => setupSwagger(app)).not.toThrow();

    await app.close();
  });
});
