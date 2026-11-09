import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SchedulerRegistry } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PublicCacheService } from '../src/common/public-cache.service.js';
import { MailService } from '../src/modules/mail/mail.service.js';
import { NewsletterService } from '../src/modules/newsletter/newsletter.service.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { AnalyticsService } from '../src/modules/analytics/analytics.service.js';

describe('Release acceptance: public content, cache, series and engagement', () => {
  let app: INestApplication, db: DataSource, cache: PublicCacheService, newsletter: NewsletterService | undefined;
  let authorId: string, readerId: string, authorToken: string, readerToken: string;
  let authService: AuthService, analytics: AnalyticsService;
  let cacheHitAverage: number;
  const suffix = randomUUID().replace(/-/g, '');
  const email = `release-${suffix}@example.test`;
  const password = 'Release123!';
  const ids: string[] = [];
  const mail = {
    sendEmailVerification: vi.fn(), sendPasswordResetEmail: vi.fn(), sendEmailChangeConfirmation: vi.fn(),
    sendNewsletterConfirmation: vi.fn(), sendNewsletterPost: vi.fn().mockResolvedValue(undefined),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MailService).useValue(mail).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    for (const job of module.get(SchedulerRegistry).getCronJobs().values()) await job.stop();
    db = module.get(DataSource); cache = module.get(PublicCacheService);
    try { newsletter = module.get(NewsletterService); } catch { /* disabled in V1 */ }
    authService = module.get(AuthService); analytics = module.get(AnalyticsService);
    for (const [name, address, author] of [['Release Author', `author-${email}`, true], ['Release Reader', `reader-${email}`, false]] as const) {
      const result = await request(app.getHttpServer()).post('/api/v1/users').send({ name, email: address, password, birthDate: '1990-01-01', acceptedTerms: true, termsVersion: '1.0.0' }).expect(201);
      await db.query("UPDATE users SET email_verified = true, role = $2, first_post_approved = true WHERE id = $1", [result.body.id, author ? 'AUTHOR' : 'READER']);
      const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: address, password }).expect(200);
      if (author) { authorId = result.body.id; authorToken = login.body.access_token; }
      else { readerId = result.body.id; readerToken = login.body.access_token; }
    }
    for (let i = 0; i < 3; i++) {
      const post = await request(app.getHttpServer()).post('/api/v1/posts').set('Authorization', `Bearer ${authorToken}`)
        .send({ title: `Release ${suffix} part ${i}`, content: `Public chapter ${i}`, published: true }).expect(201);
      ids.push(post.body.id);
    }
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    if (db?.isInitialized) {
      await db.query('DELETE FROM newsletter_subscribers WHERE email = $1', [email]);
      await db.query('DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[]) OR target_id = ANY($2::uuid[])', [[authorId, readerId].filter(Boolean), ids]);
      await db.query('DELETE FROM comments WHERE author_id = ANY($1::uuid[])', [[authorId, readerId].filter(Boolean)]);
      await db.query('DELETE FROM posts WHERE author_id = $1', [authorId]);
      await db.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[authorId, readerId].filter(Boolean)]);
      await cache.invalidate();
    }
    await app?.close();
  });

  it('returns previous and next parts in article details and restores revisions', async () => {
    const server = app.getHttpServer();
    await request(server).post('/api/v1/series').set('Authorization', `Bearer ${readerToken}`).send({ title: 'Forbidden' }).expect(403);
    const series = await request(server).post('/api/v1/series').set('Authorization', `Bearer ${authorToken}`).send({ title: 'Release series' }).expect(201);
    await request(server).put(`/api/v1/series/${series.body.id}/items`).set('Authorization', `Bearer ${authorToken}`).send({ postIds: ids }).expect(200);
    for (let index = 0; index < ids.length; index++) {
      const detail = await request(server).get(`/api/v1/posts/${ids[index]}`).expect(200);
      expect(detail.body.series).toMatchObject({ id: series.body.id, title: 'Release series', totalParts: 3 });
      expect(detail.body.series.previous?.id ?? null).toBe(ids[index - 1] ?? null);
      expect(detail.body.series.next?.id ?? null).toBe(ids[index + 1] ?? null);
    }
    const auth = `Bearer ${authorToken}`;
    const original = await request(server).get(`/api/v1/posts/${ids[0]}/revisions`).set('Authorization', auth).expect(200);
    await request(server).patch(`/api/v1/posts/${ids[0]}`).set('Authorization', auth).send({ content: 'Changed chapter' }).expect(200);
    const revised = await request(server).get(`/api/v1/posts/${ids[0]}/revisions`).set('Authorization', auth).expect(200);
    expect(revised.body.meta.total).toBe(original.body.meta.total + 1);
    await request(server).post(`/api/v1/posts/${ids[0]}/revisions/${original.body.data[0].id}/restore`).set('Authorization', auth).expect(201);
    expect((await request(server).get(`/api/v1/posts/${ids[0]}`).expect(200)).body.content).toBe('Public chapter 0');
  });

  it('serves cache hits without SQL and invalidates before a write response completes', async () => {
    const path = `/api/v1/posts?author=Release%20Author&limit=100`;
    await vi.waitFor(async () => expect(await cache.key(path)).toBeTruthy());
    await request(app.getHttpServer()).get(path).expect(200);
    const log = vi.spyOn(db.logger, 'logQuery');
    const hit = await request(app.getHttpServer()).get(path).expect(200);
    expect(log).not.toHaveBeenCalled();
    const started = performance.now();
    for (let index = 0; index < 20; index++) await request(app.getHttpServer()).get(path).expect(200);
    cacheHitAverage = (performance.now() - started) / 20;
    expect(log).not.toHaveBeenCalled();
    expect(hit.body.data.map((item: { id: string }) => item.id)).toEqual(expect.arrayContaining(ids));
    log.mockRestore();
    await request(app.getHttpServer()).patch(`/api/v1/posts/${ids[0]}`).set('Authorization', `Bearer ${authorToken}`).send({ title: `Updated ${suffix}` }).expect(200);
    const fresh = await request(app.getHttpServer()).get(path).expect(200);
    expect(fresh.body.data.find((item: { id: string }) => item.id === ids[0]).title).toBe(`Updated ${suffix}`);
  });

  it('lists comments in two SQL queries and creates private notifications and personalized feeds', async () => {
    const server = app.getHttpServer(), auth = `Bearer ${readerToken}`;
    await request(server).put(`/api/v1/authors/${authorId}/follow`).set('Authorization', auth).expect(204);
    await request(server).put(`/api/v1/authors/${authorId}/follow`).set('Authorization', auth).expect(204);
    const feed = await request(server).get('/api/v1/feed').set('Authorization', auth).expect(200);
    expect(feed.body.data.map((item: { id: string }) => item.id)).toEqual(expect.arrayContaining(ids));
    const comment = await request(server).post(`/api/v1/posts/${ids[0]}/comments`).set('Authorization', auth).send({ content: 'Release comment' }).expect(201);
    const log = vi.spyOn(db.logger, 'logQuery');
    const list = await request(server).get(`/api/v1/posts/${ids[0]}/comments`).expect(200);
    expect(list.body.data[0].id).toBe(comment.body.id);
    expect(log).toHaveBeenCalledTimes(2);
    log.mockRestore();
    const notifications = await request(server).get('/api/v1/notifications').set('Authorization', `Bearer ${authorToken}`).expect(200);
    expect(notifications.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'comment', commentId: comment.body.id })]));
    const own = await request(server).get('/api/v1/notifications').set('Authorization', auth).expect(200);
    expect(own.body.data).toEqual([]);
    await request(server).patch('/api/v1/notifications/read-all').set('Authorization', `Bearer ${authorToken}`).expect(204);
  });

  it.skip('confirms and cancels newsletter subscriptions using browser links (disabled in V1)', async () => {
    const server = app.getHttpServer();
    await request(server).post('/api/v1/newsletter/subscribe').send({ email }).expect(200);
    const [subscriber] = await db.query('SELECT id, confirmed FROM newsletter_subscribers WHERE email = $1', [email]);
    expect(subscriber.confirmed).toBe(false);
    const token = mail.sendNewsletterConfirmation.mock.calls.at(-1)![1];
    await request(server).get('/api/v1/newsletter/confirm').query({ token }).expect(200).expect('Content-Type', /text\/html/);
    await request(server).get('/api/v1/newsletter/confirm').query({ token }).expect(400);
    // Publication after confirmation creates a durable delivery for the subscriber.
    await request(server).patch(`/api/v1/posts/${ids[2]}`).set('Authorization', `Bearer ${authorToken}`).send({ published: false }).expect(200);
    await request(server).patch(`/api/v1/posts/${ids[2]}`).set('Authorization', `Bearer ${authorToken}`).send({ published: true }).expect(200);
    await newsletter.processDelivery({ postId: ids[2], subscriberId: subscriber.id });
    const unsubscribe = mail.sendNewsletterPost.mock.calls.at(-1)![3];
    await request(server).get('/api/v1/newsletter/unsubscribe').query({ token: unsubscribe }).expect(200);
    expect((await db.query('SELECT confirmed FROM newsletter_subscribers WHERE id = $1', [subscriber.id]))[0].confirmed).toBe(false);
  });

  it('measures authentication timing and admin aggregation with twenty alternating samples', async () => {
    const samples: Record<string, number[]> = { knownLogin: [], unknownLogin: [], knownRecovery: [], unknownRecovery: [], analytics: [] };
    const measure = async (name: string, action: () => Promise<unknown>) => {
      const start = performance.now();
      await action();
      samples[name].push(performance.now() - start);
    };
    for (let sample = 0; sample < 20; sample++) {
      await measure('knownLogin', () => expect(authService.login({ email: `author-${email}`, password: 'wrong-password' })).rejects.toThrow());
      await measure('unknownLogin', () => expect(authService.login({ email: `missing-${email}`, password: 'wrong-password' })).rejects.toThrow());
      await measure('knownRecovery', () => authService.forgotPassword({ email: `author-${email}` }));
      await measure('unknownRecovery', () => authService.forgotPassword({ email: `missing-${email}` }));
      await measure('analytics', () => analytics.overview());
    }
    const averages = Object.fromEntries(Object.entries(samples).map(([key, values]) => [key, Math.round(values.reduce((a, b) => a + b) / values.length * 100) / 100]));
    averages.cacheHitHttp = Math.round(cacheHitAverage * 100) / 100;
    const recoveryStart = performance.now();
    for (let index = 0; index < 4; index++) await request(app.getHttpServer()).post('/api/v1/auth/forgot-password')
      .send({ email: `${index % 2 ? 'missing' : 'author'}-${email}` }).expect(200);
    averages.recoveryHttp = Math.round((performance.now() - recoveryStart) / 4 * 100) / 100;
    console.info('Release performance averages (ms, local PostgreSQL/Redis):', JSON.stringify(averages));
    if (process.env.RELEASE_METRICS_PATH) await writeFile(process.env.RELEASE_METRICS_PATH, JSON.stringify(averages, null, 2));
    expect(averages.knownLogin / averages.unknownLogin).toBeGreaterThan(0.7);
    expect(averages.knownLogin / averages.unknownLogin).toBeLessThan(1.4);
  }, 30_000);
});
