import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import supertest from 'supertest';
import { AppModule } from '../src/app.module.js';
import { MailService } from '../src/modules/mail/mail.service.js';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../src/modules/users/entities/user.entity.js';
import { Post } from '../src/modules/posts/entities/post.entity.js';
import { AuditLog } from '../src/modules/audit/audit.entity.js';
import { Report } from '../src/modules/reports/reports.entity.js';
import { UserRole } from '../src/modules/users/enums/user.enum.js';

const request = typeof supertest === 'function' ? supertest : (supertest as any).default;
describe('First post review', () => {
  let app: any, users: any, posts: any, reports: any, audits: any, authorId: string, authorToken: string, adminToken: string, postId: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const author = { name: 'Review Author', email: `review-a-${suffix}@example.com`, password: 'Password123!', birthDate: '1990-01-01', acceptedTerms: true, termsVersion: '1.0.0' };
  const admin = { name: 'Review Admin', email: `review-b-${suffix}@example.com`, password: 'Password123!', birthDate: '1990-01-01', acceptedTerms: true, termsVersion: '1.0.0' };
  const mail = { sendEmailVerification: vi.fn(), sendPasswordResetEmail: vi.fn(), sendEmailChangeConfirmation: vi.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MailService).useValue(mail).compile();
    app = module.createNestApplication(); app.use(cookieParser()); app.setGlobalPrefix('api/v1'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
    users = module.get(getRepositoryToken(User)); posts = module.get(getRepositoryToken(Post)); reports = module.get(getRepositoryToken(Report)); audits = module.get(getRepositoryToken(AuditLog));
    for (const user of [author, admin]) {
      await request(app.getHttpServer()).post('/api/v1/users').send(user).expect(201);
      await users.update({ email: user.email }, { emailVerified: true });
    }
    authorId = (await users.findOneBy({ email: author.email })).id;
    const adminUser = await users.findOneBy({ email: admin.email });
    authorToken = (await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: author.email, password: author.password }).expect(200)).body.access_token;
    adminToken = (await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: admin.email, password: admin.password }).expect(200)).body.access_token;
    await users.update(adminUser.id, { role: UserRole.ADMIN, firstPostApproved: true, totpEnabled: true });
  });
  afterAll(async () => {
    if (reports && postId) await reports.delete({ postId });
    if (audits && postId) await audits.delete({ targetId: postId });
    if (audits && authorId) await audits.delete({ targetId: authorId });
    if (users && audits) { const adminUser = await users.findOneBy({ email: admin.email }); if (adminUser) await audits.delete({ actorId: adminUser.id }); }
    if (audits && authorId) await audits.delete({ actorId: authorId });
    if (posts && postId) await posts.delete(postId);
    if (users) await users.delete({ email: author.email });
    if (users) await users.delete({ email: admin.email });
    if (app) await app.close();
  });
  it('requires acceptance and review before publication and prevents edits while pending', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/analytics/overview').set('Authorization', `Bearer ${authorToken}`).expect(403);
    await request(app.getHttpServer()).get('/api/v1/admin/analytics/overview').set('Authorization', `Bearer ${adminToken}`).expect(200);
    await request(app.getHttpServer()).post('/api/v1/users/me/author').set('Authorization', `Bearer ${authorToken}`).send({ version: '1', accepted: true }).expect(200);
    const draft = await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization', `Bearer ${authorToken}`).send({ title: 'Review test post', content: 'Content for review test' }).expect(201); postId = draft.body.id;
    await request(app.getHttpServer()).patch(`/api/v1/posts/${postId}`).set('Authorization', `Bearer ${authorToken}`).send({ published: true }).expect(409);
    await request(app.getHttpServer()).post(`/api/v1/post-reviews/${postId}/submit`).set('Authorization', `Bearer ${authorToken}`).expect(201);
    await request(app.getHttpServer()).patch(`/api/v1/posts/${postId}`).set('Authorization', `Bearer ${authorToken}`).send({ title: 'Altered title' }).expect(409);
    await request(app.getHttpServer()).post(`/api/v1/post-reviews/${postId}/decision`).set('Authorization', `Bearer ${authorToken}`).send({ decision: 'APPROVED' }).expect(403);
    await request(app.getHttpServer()).post(`/api/v1/post-reviews/${postId}/decision`).set('Authorization', `Bearer ${adminToken}`).send({ decision: 'APPROVED' }).expect(201);
    const result = await request(app.getHttpServer()).get(`/api/v1/posts/${postId}`).expect(200);
    expect(result.body.title).toBe('Review test post');
    const report = await request(app.getHttpServer()).post('/api/v1/reports').set('Authorization', `Bearer ${authorToken}`).send({ target: 'POST', targetId: postId, reason: 'Conteúdo ofensivo' }).expect(201);
    await request(app.getHttpServer()).post('/api/v1/reports').set('Authorization', `Bearer ${authorToken}`).send({ target: 'POST', targetId: postId, reason: 'Conteúdo ofensivo' }).expect(409);
    await request(app.getHttpServer()).get('/api/v1/reports').set('Authorization', `Bearer ${authorToken}`).expect(403);
    await request(app.getHttpServer()).patch(`/api/v1/reports/${report.body.id}`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'RESOLVED', note: 'Conteúdo analisado' }).expect(200);
    const audit = await request(app.getHttpServer()).get('/api/v1/admin/audit-logs').set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(audit.body.data.some((item: any) => item.targetId === report.body.id && item.action === 'report.review')).toBe(true);
    await audits.delete({ targetId: report.body.id });
    await request(app.getHttpServer()).patch(`/api/v1/posts/${postId}`).set('Authorization', `Bearer ${authorToken}`).send({ title: 'Altered title' }).expect(200);
    await request(app.getHttpServer()).post(`/api/v1/admin/users/${authorId}/suspension`).set('Authorization', `Bearer ${adminToken}`).send({ reason: 'Repeated abuse', hidePostIds: [postId] }).expect(201);
    const suspended = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: author.email, password: author.password }).expect(403);
    expect(suspended.body).toMatchObject({ reason: 'Repeated abuse', endsAt: null });
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: author.email, password: 'wrong-password' }).expect(401);
    await request(app.getHttpServer()).get('/api/v1/auth/sessions').set('Authorization', `Bearer ${authorToken}`).expect(401);
    await request(app.getHttpServer()).get(`/api/v1/posts/${postId}`).expect(404);
    await request(app.getHttpServer()).post(`/api/v1/admin/users/${authorId}/restore`).set('Authorization', `Bearer ${adminToken}`).expect(201);
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: author.email, password: author.password }).expect(200);
    await request(app.getHttpServer()).get('/api/v1/auth/sessions').set('Authorization', `Bearer ${authorToken}`).expect(401);
    await request(app.getHttpServer()).get(`/api/v1/posts/${postId}`).expect(404);

  });
  it('serializes concurrent decisions for the same author', async () => {
    const extra = await users.save(users.create({ name: 'Concurrent Author', email: `review-concurrent-${suffix}@example.com`, passwordHash: 'invalid-test-hash', role: UserRole.AUTHOR, emailVerified: true }));
    const ids: string[] = [];
    try {
      for (const index of [1, 2]) {
        const post = await posts.save(posts.create({ title: `Concurrent review ${index}`, slug: `review-concurrent-${suffix}-${index}`, content: 'Review content', authorId: extra.id }));
        ids.push(post.id);
        await posts.update(post.id, { reviewStatus: 'PENDING' });
      }
      const decisions = await Promise.all(ids.map(id => request(app.getHttpServer()).post(`/api/v1/post-reviews/${id}/decision`).set('Authorization', `Bearer ${adminToken}`).send({ decision: 'APPROVED' })));
      expect(decisions.map(response => response.status).sort((a, b) => a - b)).toEqual([201, 409]);
      const saved = await Promise.all(ids.map(id => posts.findOneBy({ id })));
      expect(saved.filter(post => post.reviewStatus === 'APPROVED' && post.published)).toHaveLength(1);
      expect(saved.filter(post => post.reviewStatus === 'REJECTED' && !post.published)).toHaveLength(1);
    } finally {
      for (const id of ids) { await audits.delete({ targetId: id }); await posts.delete(id); }
      await audits.delete({ actorId: extra.id });
      await audits.delete({ targetId: extra.id });
      await users.delete(extra.id);
    }
  });
});
