import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RateLimitModule } from './rate-limit.module.js';
import { PostCommentsController } from '../modules/comments/comments.controller.js';
import { CommentsService } from '../modules/comments/comments.service.js';
import { JwtAuthGuard } from '../modules/auth/guard/jwt-auth.guard.js';
import { RolesGuard } from '../modules/auth/guard/roles.guard.js';
import { PostsController } from '../modules/posts/posts.controller.js';
import { PostsService } from '../modules/posts/posts.service.js';
import { PostInteractionsController } from '../modules/posts/post-interactions.controller.js';
import { PostInteractionsService } from '../modules/posts/post-interactions.service.js';

@Controller('rate-limit-test')
class TestController {
  @Get()
  get() {
    return 'ok';
  }
}

describe('rate limiting', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [RateLimitModule],
      controllers: [TestController],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows 100 requests and rejects the next with a retry time', async () => {
    for (let i = 0; i < 100; i++) {
      await supertest(app.getHttpServer()).get('/rate-limit-test').expect(200);
    }
    const response = await supertest(app.getHttpServer())
      .get('/rate-limit-test')
      .expect(429);
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('post and reaction rate limits', () => {
  let app: INestApplication;
  const id = 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22';
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [RateLimitModule], controllers: [PostsController, PostInteractionsController],
      providers: [
        { provide: PostsService, useValue: { create: () => ({}), update: () => ({}) } },
        { provide: PostInteractionsService, useValue: { set: () => undefined } },
      ],
    }).overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: { switchToHttp: () => { getRequest: () => { user: object } } }) => {
      context.switchToHttp().getRequest().user = { userId: 'user' }; return true;
    } }).overrideGuard(RolesGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication(); await app.init();
  });
  afterAll(async () => { await app.close(); });
  it('limits article creation and updates independently', async () => {
    for (let i = 0; i < 10; i++) await supertest(app.getHttpServer()).post('/posts').send({ tagNames: ['new'] }).expect(201);
    await supertest(app.getHttpServer()).post('/posts').send({}).expect(429);
    for (let i = 0; i < 20; i++) await supertest(app.getHttpServer()).patch(`/posts/${id}`).send({ tagNames: ['new'] }).expect(200);
    await supertest(app.getHttpServer()).patch(`/posts/${id}`).send({}).expect(429);
  });
  it('limits likes and unlikes independently', async () => {
    for (let i = 0; i < 30; i++) await supertest(app.getHttpServer()).put(`/posts/${id}/like`).expect(204);
    await supertest(app.getHttpServer()).put(`/posts/${id}/like`).expect(429);
    for (let i = 0; i < 30; i++) await supertest(app.getHttpServer()).delete(`/posts/${id}/like`).expect(204);
    await supertest(app.getHttpServer()).delete(`/posts/${id}/like`).expect(429);
  });
});

describe('comment creation rate limit', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [RateLimitModule],
      controllers: [PostCommentsController],
      providers: [{ provide: CommentsService, useValue: { create: () => ({}) } }],
    }).overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: { switchToHttp: () => { getRequest: () => { user: object } } }) => {
      context.switchToHttp().getRequest().user = { userId: 'user' };
      return true;
    } }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => { await app.close(); });
  it('rejects the sixth comment creation in a minute', async () => {
    const path = '/posts/b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22/comments';
    for (let i = 0; i < 5; i++) await supertest(app.getHttpServer()).post(path).send({ content: 'test' }).expect(201);
    const response = await supertest(app.getHttpServer()).post(path).send({ content: 'test' }).expect(429);
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
  });
});
