import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHmac, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import cookieParser from 'cookie-parser';
import supertest from 'supertest';
import { AppModule } from '../src/app.module.js';
import { User } from '../src/modules/users/entities/user.entity.js';
import { AuditLog } from '../src/modules/audit/audit.entity.js';
import { UserRole } from '../src/modules/users/enums/user.enum.js';
import { MailService } from '../src/modules/mail/mail.service.js';

function totp(secret: string, counter: number) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let value = 0, bits = 0; const bytes: number[] = [];
  for (const char of secret) { value = (value << 5) | alphabet.indexOf(char); bits += 5; if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  const data = Buffer.alloc(8); data.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac('sha1', Buffer.from(bytes)).update(data).digest(); const offset = hash[19] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

describe('Administração e privilégios', () => {
  let app: any, users: any, audits: any;
  const ids: string[] = [], suffix = randomUUID(), password = 'Password123!';
  const accounts = ['owner', 'admin', 'reader'].map(name => ({ name: `Test ${name}`, email: `${name}-${suffix}@example.invalid`, password }));
  const oldKey = process.env.TOTP_ENCRYPTION_KEY;
  beforeAll(async () => {
    process.env.TOTP_ENCRYPTION_KEY = 'b'.repeat(64);
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MailService).useValue({ sendEmailVerification: vi.fn(), sendPasswordResetEmail: vi.fn(), sendEmailChangeConfirmation: vi.fn() }).compile();
    app = module.createNestApplication(); app.use(cookieParser()); app.setGlobalPrefix('api/v1'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
    users = module.get(getRepositoryToken(User)); audits = module.get(getRepositoryToken(AuditLog));
    for (const account of accounts) {
      const response = await supertest(app.getHttpServer()).post('/api/v1/users').send(account).expect(201);
      ids.push(response.body.id);
      await users.update(response.body.id, { emailVerified: true, recoveryEmail: `recovery-${response.body.id}@example.invalid`, recoveryEmailVerifiedAt: new Date() });
    }
    await users.update(ids[0], { role: UserRole.SUPER_ADMIN });
    await users.update(ids[1], { role: UserRole.ADMIN });
  });
  afterAll(async () => {
    if (audits) for (const id of ids) { await audits.delete({ actorId: id }); await audits.delete({ targetId: id }); }
    if (users) for (const id of ids) await users.delete(id);
    if (app) await app.close();
    if (oldKey === undefined) delete process.env.TOTP_ENCRYPTION_KEY; else process.env.TOTP_ENCRYPTION_KEY = oldKey;
  });
  it('protege rotas, exige TOTP e invalida sessão do administrador rebaixado', async () => {
    const server = app.getHttpServer();
    const login = async (index: number, extra: object = {}) => (await supertest(server).post('/api/v1/auth/login').send({ email: accounts[index].email, password, ...extra }).expect(200)).body.access_token;
    const readerToken = await login(2), adminToken = await login(1), initialOwnerToken = await login(0);
    await supertest(server).get('/api/v1/admin/users').set('Authorization', `Bearer ${readerToken}`).expect(403);
    await supertest(server).get('/api/v1/admin/users').set('Authorization', `Bearer ${adminToken}`).expect(403);
    await supertest(server).patch(`/api/v1/admin/users/${ids[2]}/role`).set('Authorization', `Bearer ${adminToken}`).send({ role: 'ADMIN', reason: 'Promoção de teste' }).expect(403);
    await supertest(server).patch(`/api/v1/users/${ids[2]}`).set('Authorization', `Bearer ${readerToken}`).send({ role: 'ADMIN' }).expect(403);
    const setup = await supertest(server).post('/api/v1/auth/totp/setup').set('Authorization', `Bearer ${initialOwnerToken}`).send({ password }).expect(200);
    const now = Math.floor(Date.now() / 30_000);
    await supertest(server).post('/api/v1/auth/totp/enable').set('Authorization', `Bearer ${initialOwnerToken}`).send({ code: totp(setup.body.secret, now - 1) }).expect(200);
    const ownerToken = await login(0, { totpCode: totp(setup.body.secret, now) });
    await supertest(server).patch(`/api/v1/admin/users/${ids[1]}/role`).set('Authorization', `Bearer ${ownerToken}`).set('X-TOTP-Code', totp(setup.body.secret, now + 1)).send({ role: 'READER', reason: 'Rebaixamento de teste' }).expect(200);
    await supertest(server).get('/api/v1/admin/users').set('Authorization', `Bearer ${adminToken}`).expect(401);
    const events = await audits.find({ where: { targetId: ids[1], action: 'user.permissions_changed' } });
    expect(events).toHaveLength(1);
  });
});
