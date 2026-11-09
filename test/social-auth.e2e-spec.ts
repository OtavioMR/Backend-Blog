import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import supertest from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppModule } from '../src/app.module.js';
import { User } from '../src/modules/users/entities/user.entity.js';
import { AuditLog } from '../src/modules/audit/audit.entity.js';
import { MailService } from '../src/modules/mail/mail.service.js';

const request = typeof supertest === 'function' ? supertest : (supertest as any).default;
function code(secret: string, counter: number) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let value = 0, bits = 0; const bytes: number[] = [];
  for (const char of secret) { value = (value << 5) | alphabet.indexOf(char); bits += 5; if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  const input = Buffer.alloc(8); input.writeBigUInt64BE(BigInt(counter)); const mac = createHmac('sha1', Buffer.from(bytes)).update(input).digest(); const offset = mac[19] & 15;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
describe('Social authentication', () => {
  let app: any, users: any, audits: any, id: string, newUserId: string, token: string;
  const previous = { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET, callback: process.env.GOOGLE_CALLBACK_URL, totp: process.env.TOTP_ENCRYPTION_KEY, githubId: process.env.GITHUB_CLIENT_ID, githubSecret: process.env.GITHUB_CLIENT_SECRET, githubCallback: process.env.GITHUB_CALLBACK_URL };
  const account = { name: 'Social test', email: `social-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, password: 'Password123!', birthDate: '1990-01-01', acceptedTerms: true, termsVersion: '1.0.0' };
  beforeAll(async () => {
    process.env.TOTP_ENCRYPTION_KEY = 'b'.repeat(64);
    process.env.GITHUB_CLIENT_ID = 'client'; process.env.GITHUB_CLIENT_SECRET = 'secret'; process.env.GITHUB_CALLBACK_URL = 'http://localhost:3000/api/v1/auth/social/github/callback';
    process.env.GOOGLE_CLIENT_ID = 'client'; process.env.GOOGLE_CLIENT_SECRET = 'secret'; process.env.GOOGLE_CALLBACK_URL = 'http://localhost:3000/api/v1/auth/social/google/callback';
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes('access_token') || url.includes('/token') ? { access_token: 'provider-token' } : url.endsWith('/user/emails') ? [{ email: account.email, verified: true, primary: true }] : url.endsWith('/user') ? { id: '123456789', login: 'test-user', name: account.name } : { sub: `subject-${account.email}`, email: account.email, email_verified: true, name: account.name } })));
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MailService).useValue({ sendEmailVerification: vi.fn(), sendPasswordResetEmail: vi.fn(), sendEmailChangeConfirmation: vi.fn() }).compile();
    app = module.createNestApplication(); app.use(cookieParser()); app.setGlobalPrefix('api/v1'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
    users = module.get(getRepositoryToken(User)); audits = module.get(getRepositoryToken(AuditLog));
    const created = await request(app.getHttpServer()).post('/api/v1/users').send(account).expect(201); id = created.body.id;
    await users.update(id, { emailVerified: true });
    token = (await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: account.email, password: account.password }).expect(200)).body.access_token;
  });
  afterAll(async () => {
    if (audits && id) await audits.delete({ actorId: id });
    if (audits && id) await audits.delete({ targetId: id });
    if (audits && newUserId) await audits.delete({ actorId: newUserId });
    if (audits && newUserId) await audits.delete({ targetId: newUserId });
    if (users && newUserId) await users.delete(newUserId);
    if (users && id) await users.delete(id);
    if (app) await app.close(); vi.unstubAllGlobals();
    for (const [name, value] of Object.entries({ GOOGLE_CLIENT_ID: previous.id, GOOGLE_CLIENT_SECRET: previous.secret, GOOGLE_CALLBACK_URL: previous.callback, TOTP_ENCRYPTION_KEY: previous.totp, GITHUB_CLIENT_ID: previous.githubId, GITHUB_CLIENT_SECRET: previous.githubSecret, GITHUB_CALLBACK_URL: previous.githubCallback })) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  });
  it('requires explicit linking, binds state to the browser and consumes it once', async () => {
    const start = await request(app.getHttpServer()).get('/api/v1/auth/social/google/start').expect(200);
    const state = new URL(start.body.url).searchParams.get('state'); const cookie = start.headers['set-cookie'][0].split(';')[0];
    await request(app.getHttpServer()).get('/api/v1/auth/social/google/callback').query({ code: 'code', state }).expect(401);
    await request(app.getHttpServer()).get('/api/v1/auth/social/google/callback').set('Cookie', cookie).query({ code: 'code', state }).expect(409);
    await request(app.getHttpServer()).get('/api/v1/auth/social/google/callback').set('Cookie', cookie).query({ code: 'code', state }).expect(401);
    const revokedLink = await request(app.getHttpServer()).post('/api/v1/auth/social/google/link').set('Authorization', `Bearer ${token}`).expect(200);
    const revokedState = new URL(revokedLink.body.url).searchParams.get('state'); const revokedCookie = revokedLink.headers['set-cookie'][0].split(';')[0];
    await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Authorization', `Bearer ${token}`).expect(200);
    await request(app.getHttpServer()).get('/api/v1/auth/social/google/callback').set('Cookie', revokedCookie).query({ code: 'code', state: revokedState }).expect(401);
    token = (await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: account.email, password: account.password }).expect(200)).body.access_token;
    const link = await request(app.getHttpServer()).post('/api/v1/auth/social/google/link').set('Authorization', `Bearer ${token}`).expect(200);
    const linkState = new URL(link.body.url).searchParams.get('state'); const linkCookie = link.headers['set-cookie'][0].split(';')[0];
    const result = await request(app.getHttpServer()).get('/api/v1/auth/social/google/callback').set('Cookie', linkCookie).query({ code: 'code', state: linkState }).expect(200);
    expect(result.body.linked).toBe(true);
    const next = await request(app.getHttpServer()).get('/api/v1/auth/social/google/start').expect(200);
    const nextState = new URL(next.body.url).searchParams.get('state'); const nextCookie = next.headers['set-cookie'][0].split(';')[0];
    const login = await request(app.getHttpServer()).get('/api/v1/auth/social/google/callback').set('Cookie', nextCookie).query({ code: 'code', state: nextState }).expect(200);
    expect(login.body.access_token).toBeTruthy();
    expect(login.headers['set-cookie'].some((value: string) => value.startsWith('refreshToken='))).toBe(true);
    await users.update(id, { recoveryEmail: `recovery-${id}@example.invalid`, recoveryEmailVerifiedAt: new Date() });
    const setup = await request(app.getHttpServer()).post('/api/v1/auth/totp/setup').set('Authorization', `Bearer ${login.body.access_token}`).send({ password: account.password }).expect(200);
    const now = Math.floor(Date.now() / 30000);
    await request(app.getHttpServer()).post('/api/v1/auth/totp/enable').set('Authorization', `Bearer ${login.body.access_token}`).send({ code: code(setup.body.secret, now) }).expect(200);
    const nextMfa = await request(app.getHttpServer()).get('/api/v1/auth/social/google/start').expect(200);
    const mfaState = new URL(nextMfa.body.url).searchParams.get('state'); const mfaCookie = nextMfa.headers['set-cookie'][0].split(';')[0];
    const mfa = await request(app.getHttpServer()).get('/api/v1/auth/social/google/callback').set('Cookie', mfaCookie).query({ code: 'code', state: mfaState }).expect(200);
    expect(mfa.body.requires_totp).toBe(true); expect(mfa.body.access_token).toBeUndefined();
    const finished = await request(app.getHttpServer()).post('/api/v1/auth/social/challenge').send({ challenge: mfa.body.challenge, code: code(setup.body.secret, now + 1) }).expect(200);
    expect(finished.body.access_token).toBeTruthy();
    const githubLink = await request(app.getHttpServer()).post('/api/v1/auth/social/github/link').set('Authorization', `Bearer ${finished.body.access_token}`).expect(200);
    const githubState = new URL(githubLink.body.url).searchParams.get('state'); const githubCookie = githubLink.headers['set-cookie'][0].split(';')[0];
    await request(app.getHttpServer()).get('/api/v1/auth/social/github/callback').set('Cookie', githubCookie).query({ code: 'code', state: githubState }).expect(200);
    const githubStart = await request(app.getHttpServer()).get('/api/v1/auth/social/github/start').expect(200);
    const stateGithub = new URL(githubStart.body.url).searchParams.get('state'); const cookieGithub = githubStart.headers['set-cookie'][0].split(';')[0];
    const githubLogin = await request(app.getHttpServer()).get('/api/v1/auth/social/github/callback').set('Cookie', cookieGithub).query({ code: 'code', state: stateGithub }).expect(200);
    expect(githubLogin.body.requires_totp).toBe(true);
    await request(app.getHttpServer()).post('/api/v1/auth/social/challenge').send({ challenge: mfa.body.challenge, code: code(setup.body.secret, now + 1) }).expect(401);
  });
  it('creates a reader only after the provider verifies the email', async () => {
    const email = `new-${account.email}`; let verified = false;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes('/token') ? { access_token: 'provider-token' } : { sub: `new-${account.email}`, email, email_verified: verified, name: 'New reader' } })));
    const start = await request(app.getHttpServer()).get('/api/v1/auth/social/google/start').expect(200);
    const state = new URL(start.body.url).searchParams.get('state'); const cookie = start.headers['set-cookie'][0].split(';')[0];
    await request(app.getHttpServer()).get('/api/v1/auth/social/google/callback').set('Cookie', cookie).query({ code: 'code', state }).expect(401);
    expect(await users.findOneBy({ email })).toBeNull();
    verified = true;
    const next = await request(app.getHttpServer()).get('/api/v1/auth/social/google/start').expect(200);
    const nextState = new URL(next.body.url).searchParams.get('state'); const nextCookie = next.headers['set-cookie'][0].split(';')[0];
    const login = await request(app.getHttpServer()).get('/api/v1/auth/social/google/callback').set('Cookie', nextCookie).query({ code: 'code', state: nextState }).expect(200);
    expect(login.body.access_token).toBeTruthy();
    const created = await users.findOneBy({ email }); newUserId = created.id;
    expect(created.role).toBe('READER'); expect(created.emailVerified).toBe(true);
  });

});
