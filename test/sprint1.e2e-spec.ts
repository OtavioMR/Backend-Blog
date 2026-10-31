import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import supertest from 'supertest';
import { AppModule } from '../src/app.module.js';
import { MailService } from '../src/modules/mail/mail.service.js';
import { Post } from '../src/modules/posts/entities/post.entity.js';
import { User } from '../src/modules/users/entities/user.entity.js';
import { UserRole } from '../src/modules/users/enums/user.enum.js';

describe('Sprint 1 com PostgreSQL', () => {
  let app: INestApplication;
  let posts: Repository<Post>;
  let users: Repository<User>;
  let userId: string;
  let token: string;
  let draftId: string;
  const email = `sprint1-${Date.now()}@example.com`;
  const nextEmail = `novo-${email}`;
  const mail = { sendEmailChangeConfirmation: vi.fn(), sendPasswordResetEmail: vi.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService).useValue(mail).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    posts = module.get(getRepositoryToken(Post));
    users = module.get(getRepositoryToken(User));
    const created = await supertest(app.getHttpServer()).post('/api/v1/users')
      .send({ name: 'Maria Sprint', email, password: 'Password123!' }).expect(201);
    userId = created.body.id;
    await users.update(userId, { role: UserRole.AUTHOR });
    const login = await supertest(app.getHttpServer()).post('/api/v1/auth/login')
      .send({ email, password: 'Password123!' }).expect(200);
    token = login.body.access_token;
    const draft = await posts.save(posts.create({ title: 'Rascunho particular', content: 'Conteúdo privado para teste.', authorId: userId, published: false, isActive: true }));
    draftId = draft.id;
    await posts.save(posts.create({ title: 'NestJS artigo', content: 'Conteúdo publicado', authorId: userId, published: true, isActive: true }));
  });

  afterAll(async () => {
    if (users && userId) await users.delete(userId);
    await app?.close();
  });

  it('combina busca e autor sem retornar correspondências parciais', async () => {
    const ok = await supertest(app.getHttpServer()).get('/api/v1/posts').query({ search: 'nestjs', author: 'Maria Sprint' }).expect(200);
    expect(ok.body.data).toHaveLength(1);
    const empty = await supertest(app.getHttpServer()).get('/api/v1/posts').query({ search: 'nestjs', author: 'autor inexistente' }).expect(200);
    expect(empty.body.data).toHaveLength(0);
  });

  it('oculta rascunho de visitantes e permite acesso ao autor', async () => {
    await supertest(app.getHttpServer()).get(`/api/v1/posts/${draftId}`).expect(404);
    await supertest(app.getHttpServer()).get(`/api/v1/posts/${draftId}`).set('Authorization', `Bearer ${token}`).expect(200);
    const mine = await supertest(app.getHttpServer()).get('/api/v1/posts/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(mine.body.data.some((post: { id: string }) => post.id === draftId)).toBe(true);
  });

  it('troca o e-mail apenas após confirmação e impede reutilização do token', async () => {
    const response = await supertest(app.getHttpServer()).patch(`/api/v1/users/${userId}`)
      .set('Authorization', `Bearer ${token}`).send({ email: nextEmail, currentPassword: 'Password123!' }).expect(200);
    expect(response.body.email).toBe(email);
    const link = mail.sendEmailChangeConfirmation.mock.calls[0][1] as string;
    const confirmationToken = new URL(link).searchParams.get('token');
    await supertest(app.getHttpServer()).post('/api/v1/users/confirm-email-change').send({ token: confirmationToken }).expect(200);
    expect((await users.findOneByOrFail({ id: userId })).email).toBe(nextEmail);
    await supertest(app.getHttpServer()).get('/api/v1/posts/me').set('Authorization', `Bearer ${token}`).expect(401);
    await supertest(app.getHttpServer()).post('/api/v1/users/confirm-email-change').send({ token: confirmationToken }).expect(400);
  });
});
