import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import { ModerationController } from './moderation.controller.js';
import { ModerationService } from './moderation.service.js';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guard/roles.guard.js';
import { TotpService } from '../auth/totp.service.js';
import { UserRole } from '../users/enums/user.enum.js';

describe('permissões administrativas HTTP', () => {
  let app: INestApplication;
  const target = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const moderation = { listUsers: vi.fn().mockResolvedValue({ data: [], meta: {} }), changeRole: vi.fn().mockResolvedValue({ id: target, role: UserRole.ADMIN }) };
  const totp = { verifyLogin: vi.fn(async (_id: string, code: string) => code === '123456') };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [ModerationController], providers: [RolesGuard, { provide: ModerationService, useValue: moderation }, { provide: TotpService, useValue: totp }] })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => { const req = context.switchToHttp().getRequest(); req.user = { userId: 'actor', role: req.headers['x-test-role'], authVersion: 1 }; return true; } }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app?.close(); });
  it.each([UserRole.READER, UserRole.AUTHOR])('rejeita %s na administração', async role => {
    await supertest(app.getHttpServer()).get('/admin/users').set('x-test-role', role).expect(403);
  });
  it('permite a consulta para ADMIN e SUPER_ADMIN', async () => {
    for (const role of [UserRole.ADMIN, UserRole.SUPER_ADMIN]) await supertest(app.getHttpServer()).get('/admin/users').set('x-test-role', role).expect(200);
  });
  it('reserva mudança de função ao SUPER_ADMIN com TOTP válido', async () => {
    const body = { role: UserRole.ADMIN, reason: 'Promoção aprovada' };
    await supertest(app.getHttpServer()).patch(`/admin/users/${target}/role`).set('x-test-role', UserRole.ADMIN).set('X-TOTP-Code', '123456').send(body).expect(403);
    await supertest(app.getHttpServer()).patch(`/admin/users/${target}/role`).set('x-test-role', UserRole.SUPER_ADMIN).set('X-TOTP-Code', '000000').send(body).expect(401);
    await supertest(app.getHttpServer()).patch(`/admin/users/${target}/role`).set('x-test-role', UserRole.SUPER_ADMIN).set('X-TOTP-Code', '123456').send(body).expect(200);
    expect(moderation.changeRole).toHaveBeenCalledOnce();
  });
});
