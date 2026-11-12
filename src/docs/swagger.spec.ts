import { PostSeriesController, PostSeriesNavigationController } from '../modules/posts/post-series.controller.js';
import { PostSeriesService } from '../modules/posts/post-series.service.js';
import { PostRevisionsController } from '../modules/posts/post-revisions.controller.js';
import { PostRevisionsService } from '../modules/posts/post-revisions.service.js';
import { TotpController } from '../modules/auth/totp.controller.js';
import { TotpService } from '../modules/auth/totp.service.js';
import { TotpRecoveryController } from '../modules/auth/totp-recovery.controller.js';
import { TotpRecoveryService } from '../modules/auth/totp-recovery.service.js';
import { RecoveryEmailController } from '../modules/auth/recovery-email.controller.js';
import { RecoveryEmailService } from '../modules/auth/recovery-email.service.js';
import { SocialAuthController } from '../modules/auth/social-auth.controller.js';
import { SocialAuthService } from '../modules/auth/social-auth.service.js';
import { ModerationController } from '../modules/moderation/moderation.controller.js';
import { ModerationService } from '../modules/moderation/moderation.service.js';
import { AdminCommentsController } from '../modules/moderation/admin-comments.controller.js';
import { AdminPostsController } from '../modules/moderation/admin-posts.controller.js';
import { AdminTagsController } from '../modules/moderation/admin-tags.controller.js';
import { AdminCategoriesController } from '../modules/moderation/admin-categories.controller.js';
import { AuditController } from '../modules/audit/audit.controller.js';
import { AuditService } from '../modules/audit/audit.service.js';
import { AnalyticsController } from '../modules/analytics/analytics.controller.js';
import { AnalyticsService } from '../modules/analytics/analytics.service.js';
import { PostReviewController } from '../modules/posts/post-review.controller.js';
import { PostReviewService } from '../modules/posts/post-review.service.js';
import { ReportsController } from '../modules/reports/reports.controller.js';
import { ReportsService } from '../modules/reports/reports.service.js';
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
        PostSeriesController, PostSeriesNavigationController, PostRevisionsController, TotpController, SocialAuthController, AuditController, ModerationController, AdminCommentsController, AdminPostsController, AdminTagsController, AdminCategoriesController, AnalyticsController, PostReviewController, ReportsController,
        TotpRecoveryController, RecoveryEmailController, AuthorsController,
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
        { provide: TotpRecoveryService, useValue: {} },
        { provide: RecoveryEmailService, useValue: {} },
        { provide: PostSeriesService, useValue: {} }, { provide: PostRevisionsService, useValue: {} }, { provide: TotpService, useValue: {} }, { provide: SocialAuthService, useValue: {} },
        { provide: AuditService, useValue: {} }, { provide: ModerationService, useValue: {} },
        { provide: AnalyticsService, useValue: {} },
        { provide: PostReviewService, useValue: {} },
        { provide: ReportsService, useValue: {} },
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
      ['/api/v1/series/{id}', 'get'], ['/api/v1/posts/{postId}/series', 'get'],
      ['/api/v1/posts/trending', 'get'], ['/api/v1/posts/{id}/views', 'post'],
      ['/api/v1/newsletter/subscribe', 'post'], ['/api/v1/newsletter/confirm', 'post'], ['/api/v1/newsletter/unsubscribe', 'post'],
      ['/api/v1/newsletter/confirm', 'get'], ['/api/v1/newsletter/unsubscribe', 'get'],
    ] as const) {
      expect(document.paths[path]?.[method]?.security).toEqual([{}]);
      expect(document.paths[path]?.[method]?.responses).toHaveProperty('200');
    }
    expect(document.paths['/api/v1/newsletter/confirm'].get?.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'token', in: 'query', required: true }),
    ]));
    for (const [path, method] of [
      ['/api/v1/series/me', 'get'], ['/api/v1/series', 'post'], ['/api/v1/series/{id}/manage', 'get'], ['/api/v1/series/{id}/items', 'put'], ['/api/v1/series/{id}', 'patch'], ['/api/v1/series/{id}', 'delete'],
      ['/api/v1/posts/{postId}/revisions', 'get'], ['/api/v1/posts/{postId}/revisions/{revisionId}', 'get'], ['/api/v1/posts/{postId}/revisions/{revisionId}/restore', 'post'],
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

    for (const path of ['/api/v1/feed/rss', '/api/v1/feed.xml', '/api/v1/feed/atom', '/api/v1/sitemap.xml']) {
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
    expect(document.paths['/api/v1/auth/totp/setup'].post?.security).toEqual([{ 'JWT-auth': [] }]);
    expect(document.paths['/api/v1/admin/users/{id}/totp-recovery'].post?.security).toEqual([{ 'JWT-auth': [] }]);
    expect(document.paths['/api/v1/auth/recovery-email'].get?.security).toEqual([{ 'JWT-auth': [] }]);
    expect(document.paths['/api/v1/auth/recovery-email/request'].post?.security).toEqual([{ 'JWT-auth': [] }]);
    for (const path of ['/api/v1/auth/recovery-email/confirm', '/api/v1/auth/recovery-email/cancel', '/api/v1/auth/totp-recovery/request']) {
      expect(document.paths[path].post?.security).toEqual([{}]);
      expect(document.paths[path].post?.requestBody).toBeDefined();
    }
    for (const action of ['setup', 'complete', 'cancel']) {
      const operation = document.paths[`/api/v1/auth/totp-recovery/${action}`].post;
      expect(operation?.security).toEqual([{}]);
      expect(operation?.responses['401']).toBeDefined();
      expect(operation?.requestBody).toBeDefined();
    }
    expect(document.paths['/api/v1/auth/social/{provider}/link'].post?.security).toEqual([{ 'JWT-auth': [] }]);
    expect(document.paths['/api/v1/auth/social/{provider}/callback'].get?.security).toEqual([{}]);
    expect(document.paths['/api/v1/auth/social/challenge'].post?.security).toEqual([{}]);
    expect(document.paths['/api/v1/admin/users/{id}/suspension'].post?.security).toEqual([{ 'JWT-auth': [] }]);
    expect(document.paths['/api/v1/admin/users/{id}/restore'].post?.security).toEqual([{ 'JWT-auth': [] }]);
    expect(document.paths['/api/v1/admin/audit-logs'].get?.security).toEqual([{ 'JWT-auth': [] }]);
    expect(document.paths['/api/v1/admin/analytics/overview'].get?.security).toEqual([{ 'JWT-auth': [] }]);
    expect(document.paths['/api/v1/post-reviews/{id}/submit'].post?.security).toEqual([{ 'JWT-auth': [] }]);
    expect(document.paths['/api/v1/post-reviews/{id}/decision'].post?.security).toEqual([{ 'JWT-auth': [] }]);
    expect(document.paths['/api/v1/users/author-rules'].get?.security).toEqual([{}]);
    expect(document.paths['/api/v1/users/me/author'].post?.security).toEqual([{ 'JWT-auth': [] }]);
    expect(document.paths['/api/v1/reports'].post?.security).toEqual([{ 'JWT-auth': [] }]);
    expect(document.paths['/api/v1/reports/{id}'].patch?.security).toEqual([{ 'JWT-auth': [] }]);
    expect(document.paths['/api/v1/auth/sessions'].get?.security).toEqual([{ 'JWT-auth': [] }]);
    expect(document.paths['/api/v1/auth/sessions/{id}'].delete?.security).toEqual([{ 'JWT-auth': [] }]);
    expect(paths).toContain('/api/v1/auth/refresh');
    expect(document.paths['/api/v1/auth/refresh'].post?.responses).toHaveProperty('409');
    expect(document.paths['/api/v1/auth/refresh'].post?.responses).toHaveProperty('401');
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
    for (const path of ['/api/v1/posts', '/api/v1/posts/{postId}/comments']) {
      const operation = document.paths[path].get!;
      expect(operation.parameters).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'cursor', in: 'query' })]));
      expect(operation.responses).toHaveProperty('409');
      expect(operation.responses['200']).toMatchObject({ content: { 'application/json': { schema: { oneOf: expect.any(Array) } } } });
    }
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
    for (const path of ['/api/v1/admin/users', '/api/v1/admin/users/{id}/role', '/api/v1/admin/users/{id}/sessions/revoke', '/api/v1/admin/comments', '/api/v1/admin/posts', '/api/v1/admin/tags', '/api/v1/admin/categories', '/api/v1/reports/{id}/resolve', '/api/v1/admin/analytics/newsletter']) expect(document.paths).toHaveProperty(path);
    const roleOperation = document.paths['/api/v1/admin/users/{id}/role'].patch;
    expect(roleOperation?.security).toEqual(expect.arrayContaining([expect.objectContaining({ 'JWT-auth': [] })]));
    expect(roleOperation?.parameters).toEqual(expect.arrayContaining([expect.objectContaining({ in: 'header', name: 'X-TOTP-Code', required: true })]));
    expect(schemas).toHaveProperty('ResolveReportDto');
    const userSchema = schemas?.UserResponseDto;
    expect(userSchema && 'properties' in userSchema && userSchema.properties?.firstPostApproved).toMatchObject({ type: 'boolean' });
    expect(userSchema && 'required' in userSchema && userSchema.required).not.toContain('firstPostApproved');
    expect(document.paths['/api/v1/users/{id}'].get?.description).toContain('firstPostApproved');

    // Verify setupSwagger executes without error
    const createDocument = vi.spyOn(SwaggerModule, 'createDocument');
    const setup = vi.spyOn(SwaggerModule, 'setup');
    expect(() => setupSwagger(app, 'development')).not.toThrow();
    expect(setup).toHaveBeenCalledWith('api/docs', app, expect.anything(), expect.objectContaining({
      swaggerOptions: expect.objectContaining({ deepLinking: false }),
    }));
    const setupConfig = createDocument.mock.calls[0][1];
    expect(setupConfig.info.description).toContain('/api/v1/users/confirm-email');
    expect(setupConfig.info.description).toContain('excerpt');
    const generatedDocument = setup.mock.calls[0][2];
    expect(generatedDocument.tags?.map((tag) => tag.name)).toEqual(
      expect.arrayContaining(['Autenticação', 'Usuários', 'Artigos']),
    );
    expect(generatedDocument.paths['/api/v1/auth/totp/setup'].post?.summary).toBe('Iniciar configuração do TOTP');
    setup.mockRestore();
    createDocument.mockRestore();

    await app.close();
  });
});
