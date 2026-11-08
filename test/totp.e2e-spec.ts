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
  const data = Buffer.alloc(8); data.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac('sha1', Buffer.from(bytes)).update(data).digest(); const offset = hash[19] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
describe('TOTP authentication', () => {
  let app: any, users: any, audits: any, id: string, token: string;
  const originalKey = process.env.TOTP_ENCRYPTION_KEY;
  const account = { name: 'TOTP test', email: `totp-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, password: 'Password123!' };
  beforeAll(async () => {
    process.env.TOTP_ENCRYPTION_KEY = 'a'.repeat(64);
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
    if (users && id) await users.delete(id);
    if (app) await app.close();
    if (originalKey === undefined) delete process.env.TOTP_ENCRYPTION_KEY; else process.env.TOTP_ENCRYPTION_KEY = originalKey;
  });
  it('requires a fresh code and rejects reused codes', async () => {
    const setup = await request(app.getHttpServer()).post('/api/v1/auth/totp/setup').set('Authorization', `Bearer ${token}`).send({ password: account.password }).expect(200);
    expect(setup.headers['cache-control']).toBe('no-store');
    const now = Math.floor(Date.now() / 30000);
    await request(app.getHttpServer()).post('/api/v1/auth/totp/enable').set('Authorization', `Bearer ${token}`).send({ code: code(setup.body.secret, now) }).expect(200);
    await request(app.getHttpServer()).get('/api/v1/auth/sessions').set('Authorization', `Bearer ${token}`).expect(401);
    const pre = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: account.email, password: account.password }).expect(200);
    expect(pre.body.requires2fa).toBe(true);
    expect(pre.body.access_token).toBeUndefined();
    const nextCode = code(setup.body.secret, now + 1);
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: account.email, password: account.password, totpCode: nextCode }).expect(200);
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: account.email, password: account.password, totpCode: nextCode }).expect(401);
  });
});
