import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { INestApplication, ValidationPipe, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import { TotpRecoveryController } from './totp-recovery.controller.js';
import { TotpRecoveryService } from './totp-recovery.service.js';
import { JwtAuthGuard } from './guard/jwt-auth.guard.js';
import { RolesGuard } from './guard/roles.guard.js';
import { RecoveryEmailController } from './recovery-email.controller.js';
import { RecoveryEmailService } from './recovery-email.service.js';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

describe('TOTP recovery HTTP contracts', () => {
  let app: INestApplication;
  const token = 'a'.repeat(43), id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const service = { authorize: vi.fn().mockResolvedValue({ authorized: true }), recover: vi.fn().mockResolvedValue({ recovered: true }), cancel: vi.fn().mockResolvedValue({ cancelled: true }), request: vi.fn().mockResolvedValue({ message: 'Resposta genérica' }) };
  const emailService = { status: vi.fn().mockResolvedValue({ email: null, verified: false }), request: vi.fn().mockResolvedValue({ sent: true }), confirm: vi.fn().mockResolvedValue({ verified: true }), cancelPending: vi.fn().mockResolvedValue({ cancelled: true }) };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [TotpRecoveryController, RecoveryEmailController], providers: [RolesGuard, { provide: TotpRecoveryService, useValue: service }, { provide: RecoveryEmailService, useValue: emailService }] })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => { const req = context.switchToHttp().getRequest(); if (!req.headers['x-test-role']) throw new UnauthorizedException(); req.user = { userId: id, role: req.headers['x-test-role'], authVersion: 0, totpEnabled: true, emailVerified: true, recoveryEmailVerified: true }; return true; } }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app?.close(); });
  it('documents destination identifiers and removal restrictions in Swagger', () => {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth(undefined, 'JWT-auth').build());
    const schema = document.components?.schemas?.AuthorizeRecoveryDto;
    expect(schema && 'properties' in schema && schema.properties?.destination).toMatchObject({ enum: ['primary', 'secondary'], default: 'primary' });
    expect(document.paths['/auth/recovery-email/remove-request'].post?.responses).toHaveProperty('403');
    expect(document.paths['/auth/recovery-email/remove-confirm'].post?.responses).toHaveProperty('403');
  });
  it('accepts a body token and password without a login session, returns no-store', async () => {
    const response = await supertest(app.getHttpServer()).post('/auth/totp-recovery/setup').send({ token, password: 'SyntheticPassword1!' }).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(service.recover).toHaveBeenCalledWith(token, 'SyntheticPassword1!');
  });
  it('requires a session for cancelling pending email changes and documents the contract', async () => {
    await supertest(app.getHttpServer()).post('/auth/recovery-email/cancel-pending').send({}).expect(401);
    const result = await supertest(app.getHttpServer()).post('/auth/recovery-email/cancel-pending').set('x-test-role', 'READER').send({}).expect(200);
    expect(result.body).toEqual({ cancelled: true });
    expect(result.headers['cache-control']).toBe('no-store');
    expect(emailService.cancelPending).toHaveBeenCalledWith(id, 0);
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth(undefined, 'JWT-auth').build());
    expect(document.paths['/auth/recovery-email/cancel-pending'].post?.security).toEqual([{ 'JWT-auth': [] }]);
  });
  it('rejects malformed tokens, extra fields and invalid confirmation codes', async () => {
    await supertest(app.getHttpServer()).post('/auth/totp-recovery/setup').send({ token: 'short', password: 'SyntheticPassword1!' }).expect(400);
    await supertest(app.getHttpServer()).post('/auth/totp-recovery/setup').send({ token, password: 'SyntheticPassword1!', role: 'SUPER_ADMIN' }).expect(400);
    await supertest(app.getHttpServer()).post('/auth/totp-recovery/complete').send({ token, password: 'SyntheticPassword1!', code: 'invalid' }).expect(400);
  });
  it('denies ordinary admins and readers authorization, permits superadmin', async () => {
    for (const role of ['READER', 'AUTHOR', 'ADMIN']) await supertest(app.getHttpServer()).post(`/admin/users/${id}/totp-recovery`).set('x-test-role', role).send({ reason: 'Synthetic verified identity' }).expect(403);
    await supertest(app.getHttpServer()).post(`/admin/users/${id}/totp-recovery`).set('x-test-role', 'SUPER_ADMIN').set('X-TOTP-Code', '123456').send({ reason: 'Synthetic verified identity' }).expect(200);
  });
  it('protects recovery email settings and derives the owner exclusively from the session', async () => {
    await supertest(app.getHttpServer()).get('/auth/recovery-email').expect(401);
    await supertest(app.getHttpServer()).get('/auth/recovery-email').set('x-test-role', 'READER').expect(200);
    expect(emailService.status).toHaveBeenCalledWith(id);
    await supertest(app.getHttpServer()).post('/auth/recovery-email/request').set('x-test-role', 'READER').send({ email: 'recovery@example.invalid', password: 'SyntheticPassword1!', userId: id }).expect(400);
    await supertest(app.getHttpServer()).post('/auth/recovery-email/request').set('x-test-role', 'READER').send({ email: 'recovery@example.invalid', password: 'SyntheticPassword1!' }).expect(200);
    expect(emailService.request).toHaveBeenCalledWith(id, 0, 'recovery@example.invalid', 'SyntheticPassword1!', undefined);
    await supertest(app.getHttpServer()).post('/auth/recovery-email/confirm').send({ token }).expect(200);
  });
  it('never accepts an arbitrary recovery destination in public requests', async () => {
    await supertest(app.getHttpServer()).post('/auth/totp-recovery/request').send({ email: 'user@example.invalid', password: 'SyntheticPassword1!', recoveryEmail: 'other@example.invalid' }).expect(400);
    await supertest(app.getHttpServer()).post('/auth/totp-recovery/request').send({ email: 'user@example.invalid', password: 'SyntheticPassword1!' }).expect(200);
  });
  it('accepts only registered destination identifiers for assisted recovery', async () => {
    for (const destination of ['primary', 'secondary']) {
      await supertest(app.getHttpServer()).post(`/admin/users/${id}/totp-recovery`).set('x-test-role', 'SUPER_ADMIN').set('X-TOTP-Code', '123456').send({ reason: 'Synthetic independently verified identity', destination }).expect(200);
      expect(service.authorize).toHaveBeenLastCalledWith(id, 0, id, '123456', 'Synthetic independently verified identity', destination);
    }
    for (const destination of ['arbitrary@example.invalid', 'unknown', null]) await supertest(app.getHttpServer()).post(`/admin/users/${id}/totp-recovery`).set('x-test-role', 'SUPER_ADMIN').send({ reason: 'Synthetic verified identity', destination }).expect(400);
    await supertest(app.getHttpServer()).post(`/admin/users/${id}/totp-recovery`).set('x-test-role', 'SUPER_ADMIN').send({ reason: 'Synthetic verified identity', email: 'arbitrary@example.invalid' }).expect(400);
  });
});
