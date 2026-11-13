import { PostSchedulerService } from '../src/modules/posts/post-scheduler.service.js';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { MailService } from '../src/modules/mail/mail.service.js';

describe('Sprint 2 with PostgreSQL', () => {
  let app: INestApplication;
  let db: DataSource;
  let userId: string;
  const email = `sprint2-${randomUUID()}@example.com`;
  const password = 'Password123!';
  const tagName = `sprint2-${randomUUID()}`;
  const mail = { sendEmailVerification: vi.fn(), sendEmailChangeConfirmation: vi.fn(), sendPasswordResetEmail: vi.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MailService).useValue(mail).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    db = module.get(DataSource);
  });
  afterAll(async () => {
    if (userId) {
      await db.query('DELETE FROM audit_logs WHERE actor_id = $1', [userId]);
      await db.query('DELETE FROM comments WHERE author_id = $1', [userId]);
      await db.query('DELETE FROM posts WHERE author_id = $1', [userId]);
      await db.query('DELETE FROM users WHERE id = $1', [userId]);
      await db.query('DELETE FROM tags WHERE name = $1', [tagName]);
    }
    await app?.close();
  });
  it('verifies registration, locks failed logins, and publishes sanitized summaries', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/v1/health').expect(200);
    const signup = await request(server).post('/api/v1/users').send({ name: 'Sprint Two', email, password, birthDate: '1990-01-01', acceptedTerms: true, termsVersion: '1.0.0' }).expect(201);
    userId = signup.body.id;
    await request(server).post('/api/v1/auth/login').send({ email, password }).expect(401);
    const firstToken = mail.sendEmailVerification.mock.calls[0][1] as string;
    await request(server).post('/api/v1/users/resend-verification').send({ email }).expect(200);
    const nextToken = mail.sendEmailVerification.mock.calls[1][1] as string;
    await request(server).post('/api/v1/users/confirm-email').send({ token: firstToken }).expect(400);
    await request(server).post('/api/v1/users/confirm-email').send({ token: nextToken }).expect(200);
    for (let i = 0; i < 5; i++) await request(server).post('/api/v1/auth/login').send({ email, password: 'wrong-password' }).expect(401);
    await request(server).post('/api/v1/auth/login').send({ email, password }).expect(401);
    const [locked] = await db.query('SELECT failed_login_attempts, login_locked_until FROM users WHERE id = $1', [userId]);
    expect(locked.failed_login_attempts).toBe(5);
    expect(new Date(locked.login_locked_until).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(locked.login_locked_until).getTime() - Date.now()).toBeGreaterThan(899_000);
    await db.query("UPDATE users SET login_locked_until = CURRENT_TIMESTAMP - interval '1 second', role = 'AUTHOR', first_post_approved = true WHERE id = $1", [userId]);
    const login = await request(server).post('/api/v1/auth/login').send({ email, password }).expect(200);
    const auth = `Bearer ${login.body.access_token}`;
    const post = await request(server).post('/api/v1/posts').set('Authorization', auth)
      .send({ title: 'A valid title', content: '<p>Safe content</p><script>alert(1)</script>', published: true, tagNames: [tagName] }).expect(201);
    expect(post.body.content).toBe('<p>Safe content</p>');
    expect(post.body.publishedAt).toBeTruthy();
    const profile = await request(server).get(`/api/v1/authors/${userId}`).expect(200);
    expect(profile.body.publicationCount).toBe(1);
    expect(profile.body).not.toHaveProperty('email');
    const feed = await request(server).get('/api/v1/feed/rss').expect(200);
    expect(feed.headers['content-type']).toContain('application/rss+xml');
    expect(feed.text).toContain(post.body.slug);
    const sitemap = await request(server).get('/api/v1/sitemap.xml').expect(200);
    expect(sitemap.text).toContain(post.body.slug);
    await request(server).patch(`/api/v1/users/${userId}`).set('Authorization', auth).send({ bio: 'Autora', websiteUrl: 'https://example.com' }).expect(200);
    const updatedProfile = await request(server).get(`/api/v1/authors/${userId}`).expect(200);
    expect(updatedProfile.body).toMatchObject({ bio: 'Autora', websiteUrl: 'https://example.com' });
    const relatedPost = await request(server).post('/api/v1/posts').set('Authorization', auth)
      .send({ title: 'Related article', content: 'Some related content', published: true, tagNames: [tagName] }).expect(201);
    const related = await request(server).get(`/api/v1/posts/${post.body.slug}/related`).expect(200);
    expect(related.body.map((item: { id: string }) => item.id)).toContain(relatedPost.body.id);


    const listing = await request(server).get('/api/v1/posts').expect(200);
    const summary = listing.body.data.find((item: { id: string }) => item.id === post.body.id);
    expect(summary.excerpt).toBe('Safe content');
    expect(summary).not.toHaveProperty('content');
    const longContent = Array.from({ length: 1600 }, (_, i) => `palavra${i}`).join(' ');
    const longPost = await request(server).post('/api/v1/posts').set('Authorization', auth)
      .send({ title: 'Long article test', content: longContent, published: true }).expect(201);
    expect(longPost.body.content).toBe(longContent);
    expect(longPost.body.readingTimeMinutes).toBe(8);
    const [storedLongPost] = await db.query('SELECT content FROM posts WHERE id = $1', [longPost.body.id]);
    expect(storedLongPost.content).toBe(longContent);
    const longDetail = await request(server).get(`/api/v1/posts/${longPost.body.id}`).expect(200);
    expect(longDetail.body.content).toBe(longContent);
    expect(longDetail.body.readingTimeMinutes).toBe(8);
    await request(server).post('/api/v1/posts').set('Authorization', auth)
      .send({ title: 'Maximum length article', content: 'a'.repeat(55000) }).expect(201);
    await request(server).post('/api/v1/posts').set('Authorization', auth)
      .send({ title: 'Too long article', content: 'a'.repeat(55001) }).expect(400);
    await request(server).patch(`/api/v1/posts/${post.body.id}`).set('Authorization', auth).send({ published: false }).expect(200);
    const [draft] = await db.query('SELECT published_at FROM posts WHERE id = $1', [post.body.id]);
    expect(draft.published_at).toBeNull();
    const scheduledAt = new Date(Date.now() + 3600000).toISOString();
    const scheduled = await request(server).patch(`/api/v1/posts/${post.body.id}`).set('Authorization', auth).send({ scheduledAt }).expect(200);
    expect(new Date(scheduled.body.scheduledAt).toISOString()).toBe(scheduledAt);
    await request(server).patch(`/api/v1/posts/${post.body.id}`).set('Authorization', auth).send({ scheduledAt: null }).expect(200);
    await db.query("UPDATE posts SET scheduled_at = CURRENT_TIMESTAMP - interval '1 second' WHERE id = $1", [post.body.id]);
    await app.get(PostSchedulerService).publishDue();
    const [automaticallyPublished] = await db.query('SELECT published, scheduled_at FROM posts WHERE id = $1', [post.body.id]);
    expect(automaticallyPublished).toMatchObject({ published: true, scheduled_at: null });
    await request(server).patch(`/api/v1/posts/${post.body.id}`).set('Authorization', auth).send({ published: false }).expect(200);


    const republished = await request(server).patch(`/api/v1/posts/${post.body.id}`).set('Authorization', auth).send({ published: true }).expect(200);
    expect(republished.body.publishedAt).toBeTruthy();
    const root = await request(server).post(`/api/v1/posts/${post.body.id}/comments`).set('Authorization', auth).send({ content: 'First comment' }).expect(201);
    for (let i = 0; i < 7; i++) await db.query('INSERT INTO comments (post_id, author_id, root_id, content) VALUES ($1, $2, $3, $4)', [post.body.id, userId, root.body.id, `Reply ${i}`]);
    const comments = await request(server).get(`/api/v1/posts/${post.body.id}/comments`).expect(200);
    expect(comments.body.data[0].replies.data).toHaveLength(5);
    expect(comments.body.data[0].replies.meta.total).toBe(7);
  }, 30000);
});
