import { AuthorsController } from '../modules/posts/authors.controller.js';
import { FeedController } from '../modules/posts/feed.controller.js';
import { FeedService } from '../modules/posts/feed.service.js';
import { PostViewsController } from '../modules/posts/post-views.controller.js';
import { PostViewsService } from '../modules/posts/post-views.service.js';
import { AuthorFollowsController } from '../modules/posts/author-follows.controller.js';
import { AuthorFollowsService } from '../modules/posts/author-follows.service.js';
import { SavedCollectionsController } from '../modules/posts/saved-collections.controller.js';
import { SavedCollectionsService } from '../modules/posts/saved-collections.service.js';
import { CommentLikesController } from '../modules/comments/comment-likes.controller.js';
import { CommentLikesService } from '../modules/comments/comment-likes.service.js';
import { NotificationsController } from '../modules/notifications/notifications.controller.js';
import { NotificationsService } from '../modules/notifications/notifications.service.js';
import { NewsletterController } from '../modules/newsletter/newsletter.controller.js';
import { NewsletterService } from '../modules/newsletter/newsletter.service.js';
import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { UsersController } from '../modules/users/users.controller.js';
import { UsersService } from '../modules/users/users.service.js';
import { PostsController } from '../modules/posts/posts.controller.js';
import { PostsService } from '../modules/posts/posts.service.js';
import { PostInteractionsController } from '../modules/posts/post-interactions.controller.js';
import { PostInteractionsService } from '../modules/posts/post-interactions.service.js';
import { AuthController } from '../modules/auth/auth.controller.js';
import { AuthService } from '../modules/auth/auth.service.js';
import { setupSwagger } from './swagger.config.js';
import {
  CommentsController,
  PostCommentsController,
} from '../modules/comments/comments.controller.js';
import { CommentsService } from '../modules/comments/comments.service.js';
import { HealthController } from '../common/health.controller.js';
import { HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';

describe('Swagger Documentation Configuration', () => {
  it('does not register Swagger routes in production', () => {
    const createDocument = vi.spyOn(SwaggerModule, 'createDocument');
    const setup = vi.spyOn(SwaggerModule, 'setup');
    setupSwagger({} as any, 'production');
    expect(createDocument).not.toHaveBeenCalled();
    expect(setup).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('should generate OpenAPI document containing Auth, Users, and Posts endpoints', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        AuthorsController,
        FeedController,
        PostViewsController, AuthorFollowsController, SavedCollectionsController,
        CommentLikesController, NotificationsController, NewsletterController,
        UsersController,
        PostsController,
        PostInteractionsController,
        AuthController,
        CommentsController,
        PostCommentsController,
        HealthController,
      ],
      providers: [
        { provide: FeedService, useValue: {} },
        { provide: PostViewsService, useValue: {} }, { provide: AuthorFollowsService, useValue: {} },
        { provide: SavedCollectionsService, useValue: {} }, { provide: CommentLikesService, useValue: {} },
        { provide: NotificationsService, useValue: {} }, { provide: NewsletterService, useValue: {} },
        { provide: UsersService, useValue: {} },
        { provide: PostsService, useValue: {} },
        { provide: PostInteractionsService, useValue: {} },
        { provide: AuthService, useValue: {} },
        { provide: CommentsService, useValue: {} },
        { provide: HealthCheckService, useValue: {} },
        { provide: TypeOrmHealthIndicator, useValue: {} },
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

    for (const [path, method] of [
      ['/api/v1/posts/trending', 'get'], ['/api/v1/posts/{id}/views', 'post'],
      ['/api/v1/newsletter/subscribe', 'post'], ['/api/v1/newsletter/confirm', 'post'], ['/api/v1/newsletter/unsubscribe', 'post'],
    ] as const) {
      expect(document.paths[path]?.[method]?.security).toEqual([{}]);
      expect(document.paths[path]?.[method]?.responses).toHaveProperty('200');
    }
    for (const [path, method] of [
      ['/api/v1/feed', 'get'], ['/api/v1/authors/{id}/follow', 'put'],
      ['/api/v1/collections', 'post'], ['/api/v1/collections/{id}/posts/{postId}', 'put'],
      ['/api/v1/comments/{id}/like', 'get'], ['/api/v1/notifications', 'get'], ['/api/v1/notifications/{id}/read', 'patch'],
    ] as const) {
      expect(document.paths[path]?.[method]?.security).toEqual([{ 'JWT-auth': [] }]);
      expect(document.paths[path]?.[method]?.responses).toHaveProperty('401');
    }

    expect((document.components?.schemas?.PostResponseDto as any)?.properties.readingTimeMinutes).toMatchObject({ type: 'number', minimum: 1, example: 3 });
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

    for (const path of ['/api/v1/feed/rss', '/api/v1/feed/atom', '/api/v1/sitemap.xml']) {
      expect(document.paths[path].get?.security).toEqual([{}]);
      expect(document.paths[path].get?.responses).toHaveProperty('200');
    }

    for (const path of ['/api/v1/authors/{id}', '/api/v1/posts/{id}/related']) {
      expect(document.paths[path].get?.security).toEqual([{}]);
      expect(document.paths[path].get?.responses).toHaveProperty('200');
      expect(document.paths[path].get?.responses).toHaveProperty('404');
    }
    expect(document.paths['/api/v1/posts/{id}/related'].get?.responses['200']).toMatchObject({ content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/PostResponseDto' } } } } });
    for (const [path, method] of [['/api/v1/posts', 'post'], ['/api/v1/posts/{id}', 'patch']] as const) {
      const operation = document.paths[path][method];
      expect(operation?.security).toEqual([{ 'JWT-auth': [] }]);
      const body = operation?.requestBody;
      expect(body && 'content' in body && body.content['application/json'].examples).toBeDefined();
    }
    expect((document.components?.schemas?.CreatePostDto as any)?.properties.scheduledAt).toMatchObject({ type: 'string', format: 'date-time', nullable: true });

    // Paths verification
    const paths = Object.keys(document.paths);
    expect(paths).toContain('/api/v1/auth/login');
    expect(paths).toContain('/api/v1/auth/refresh');
    expect(paths).toContain('/api/v1/auth/logout');
    expect(paths).toContain('/api/v1/auth/forgot-password');
    expect(paths).toContain('/api/v1/auth/reset-password');
    expect(paths).toContain('/api/v1/users');
    expect(paths).toContain('/api/v1/users/{id}');
    expect(paths).toContain('/api/v1/users/confirm-email-change');
    for (const path of ['/api/v1/users/confirm-email', '/api/v1/users/resend-verification']) {
      const operation = document.paths[path].post;
      expect(operation?.security).toEqual([{}]);
      expect(operation?.summary).toBeTruthy();
      expect(operation?.requestBody).toBeDefined();
      expect(operation?.responses).toHaveProperty('200');
      expect(operation?.responses).toHaveProperty('400');
    }
    expect(document.paths['/api/v1/users/{id}/profile-photo'].post?.security).toEqual([{ 'JWT-auth': [] }]);
    expect(document.paths['/api/v1/users/{id}/profile-photo'].post?.responses).toHaveProperty('201');
    expect(document.paths['/api/v1/health'].get?.security).toEqual([{}]);
    expect(document.paths['/api/v1/health'].get?.responses).toHaveProperty('503');
    expect(document.paths['/api/v1/posts/{postId}/comments'].get?.responses).toHaveProperty('200');
    expect(document.components?.schemas).toHaveProperty('PaginatedCommentsResponseDto');
    expect(document.components?.schemas).toHaveProperty('PaginatedRepliesResponseDto');
    expect(document.components?.schemas?.PostSummaryResponseDto).toHaveProperty('properties.excerpt');
    expect(document.components?.schemas?.PostSummaryResponseDto).not.toHaveProperty('properties.content');
    expect(document.components?.schemas?.UpdateUserDto).toHaveProperty('properties.currentPassword');
    expect(paths).toContain('/api/v1/posts');
    expect(paths).toContain('/api/v1/posts/{id}');
    expect(paths).toContain('/api/v1/posts/me');
    expect(document.paths['/api/v1/posts/me'].get?.security).toEqual([{ 'JWT-auth': [] }]);
    for (const [path, method] of [
      ['/api/v1/posts/saved', 'get'],
      ['/api/v1/posts/{id}/interaction', 'get'],
      ['/api/v1/posts/{id}/like', 'put'],
      ['/api/v1/posts/{id}/like', 'delete'],
      ['/api/v1/posts/{id}/save', 'put'],
      ['/api/v1/posts/{id}/save', 'delete'],
    ] as const) {
      const operation = document.paths[path]?.[method];
      expect(operation?.security).toEqual([{ 'JWT-auth': [] }]);
      expect(operation?.responses).toHaveProperty(
        method === 'get' ? '200' : '204',
      );
      expect(operation?.responses).toHaveProperty('401');
    }
    expect(document.components?.schemas).toHaveProperty(
      'PostInteractionResponseDto',
    );
    expect(document.components?.schemas).toHaveProperty(
      'PaginatedSavedPostsResponseDto',
    );
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
    expect(schemas).toHaveProperty('ForgotPasswordDto');
    expect(schemas).toHaveProperty('ResetPasswordDto');
    expect(schemas).toHaveProperty('CreateUserDto');
    expect(schemas).toHaveProperty('CreatePostDto');

    // Verify setupSwagger executes without error
    const createDocument = vi.spyOn(SwaggerModule, 'createDocument');
    const setup = vi.spyOn(SwaggerModule, 'setup');
    expect(() => setupSwagger(app, 'development')).not.toThrow();
    expect(setup).toHaveBeenCalledWith('api/docs', app, expect.anything(), expect.objectContaining({
      swaggerOptions: expect.objectContaining({ deepLinking: false }),
    }));
    setup.mockRestore();
    const setupConfig = createDocument.mock.calls[0][1];
    expect(setupConfig.info.description).toContain('/api/v1/users/confirm-email');
    expect(setupConfig.info.description).toContain('excerpt');
    createDocument.mockRestore();

    await app.close();
  });
});
