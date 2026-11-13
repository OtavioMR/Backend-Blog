import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ConflictException,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import { ModerationController } from './moderation.controller.js';
import { ModerationService } from './moderation.service.js';
import { TotpService } from '../auth/totp.service.js';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guard/roles.guard.js';
import { RateLimitModule } from '../../common/rate-limit.module.js';
import { UserRole } from '../users/enums/user.enum.js';

describe('Adversarial Moderation Restore: 2FA Validation & Replay Prevention', () => {
  let app: INestApplication;
  const targetId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  let usedCodes: Set<string>;
  const moderationServiceMock = {
    restore: vi.fn().mockImplementation(async (_actorId, id) => {
      if (id === '00000000-0000-0000-0000-000000000000') {
        throw new NotFoundException('Usuário não encontrado.');
      }
      if (id === 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22') {
        throw new ConflictException('Usuário não está suspenso.');
      }
      return { suspended: false };
    }),
  };

  const totpServiceMock = {
    verifyLogin: vi.fn().mockImplementation(async (_userId: string, code?: string) => {
      if (!code || !/^\d{6}$/.test(code)) return false;
      if (code === '000000') return false; // Simulated invalid code
      if (code === '123456') {
        if (usedCodes.has(code)) {
          return false; // Simulated replay rejection (counter already recorded)
        }
        usedCodes.add(code);
        return true;
      }
      if (code.startsWith('999')) {
        return true;
      }
      return false;
    }),
  };

  beforeAll(async () => {
    usedCodes = new Set();
    // In this suite we test authorization, 2FA validation, and replay attack logic
    const module = await Test.createTestingModule({
      controllers: [ModerationController],
      providers: [
        RolesGuard,
        { provide: ModerationService, useValue: moderationServiceMock },
        { provide: TotpService, useValue: totpServiceMock },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          const role = req.headers['x-test-role'] ?? UserRole.ADMIN;
          const totpActive = req.headers['x-test-totp-active'] !== 'false';
          req.user = {
            userId: 'actor-admin-uuid',
            role,
            authVersion: 1,
            totpEnabled: totpActive,
          };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          const role = req.user?.role;
          if (role !== UserRole.ADMIN && role !== UserRole.SUPER_ADMIN) {
            return false;
          }
          if (!req.user?.totpEnabled) {
            return false;
          }
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects restore request if target ID is not a valid UUID with 400 Bad Request', async () => {
    await supertest(app.getHttpServer())
      .post('/admin/users/invalid-uuid/restore')
      .set('X-TOTP-Code', '123456')
      .expect(400);
  });

  it('rejects restore request from non-admin role with 403 Forbidden', async () => {
    await supertest(app.getHttpServer())
      .post(`/admin/users/${targetId}/restore`)
      .set('x-test-role', UserRole.READER)
      .set('X-TOTP-Code', '123456')
      .expect(403);
  });

  it('rejects restore request if admin lacks 2FA configured on their account with 403 Forbidden', async () => {
    await supertest(app.getHttpServer())
      .post(`/admin/users/${targetId}/restore`)
      .set('x-test-totp-active', 'false')
      .set('X-TOTP-Code', '123456')
      .expect(403);
  });

  it('rejects restore request with missing X-TOTP-Code header with 401 Unauthorized', async () => {
    const res = await supertest(app.getHttpServer())
      .post(`/admin/users/${targetId}/restore`)
      .expect(401);

    expect(res.body.message).toBe('Código TOTP inválido ou não configurado.');
    expect(moderationServiceMock.restore).not.toHaveBeenCalled();
  });

  it('rejects restore request with invalid X-TOTP-Code with 401 Unauthorized', async () => {
    const res = await supertest(app.getHttpServer())
      .post(`/admin/users/${targetId}/restore`)
      .set('X-TOTP-Code', '000000')
      .expect(401);

    expect(res.body.message).toBe('Código TOTP inválido ou não configurado.');
    expect(moderationServiceMock.restore).not.toHaveBeenCalled();
  });

  it('rejects restore request with non-numeric or malformed X-TOTP-Code with 401 Unauthorized', async () => {
    for (const malformed of ['abc', '12345', '1234567', '      ']) {
      const res = await supertest(app.getHttpServer())
        .post(`/admin/users/${targetId}/restore`)
        .set('X-TOTP-Code', malformed)
        .expect(401);

      expect(res.body.message).toBe('Código TOTP inválido ou não configurado.');
    }
  });

  it('accepts valid X-TOTP-Code on first attempt and restores user (201 Created)', async () => {
    const res = await supertest(app.getHttpServer())
      .post(`/admin/users/${targetId}/restore`)
      .set('X-TOTP-Code', '123456')
      .expect(201);

    expect(res.body).toEqual({ suspended: false });
    expect(moderationServiceMock.restore).toHaveBeenCalledWith('actor-admin-uuid', targetId, 1);
  });

  it('REPLAY ATTACK TEST: rejects reuse of the exact same TOTP code immediately with 401 Unauthorized', async () => {
    const res = await supertest(app.getHttpServer())
      .post(`/admin/users/${targetId}/restore`)
      .set('X-TOTP-Code', '123456')
      .expect(401);

    expect(res.body.message).toBe('Código TOTP inválido ou não configurado.');
    // Ensure restore was NOT invoked a second time
    expect(moderationServiceMock.restore).toHaveBeenCalledOnce();
  });

  it('returns 409 Conflict if user is not suspended', async () => {
    const notSuspendedId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
    const res = await supertest(app.getHttpServer())
      .post(`/admin/users/${notSuspendedId}/restore`)
      .set('X-TOTP-Code', '999001')
      .expect(409);

    expect(res.body.message).toBe('Usuário não está suspenso.');
  });
});

describe('Adversarial Moderation Restore: Rate Limiting Quota Exhaustion (5 requests limit)', () => {
  let app: INestApplication;
  const targetId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [RateLimitModule],
      controllers: [ModerationController],
      providers: [
        RolesGuard,
        {
          provide: ModerationService,
          useValue: { restore: vi.fn().mockResolvedValue({ suspended: false }) },
        },
        {
          provide: TotpService,
          useValue: { verifyLogin: vi.fn().mockResolvedValue(true) },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          context.switchToHttp().getRequest().user = {
            userId: 'rate-limit-actor',
            role: UserRole.ADMIN,
            authVersion: 1,
            totpEnabled: true,
          };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('allows exactly 5 requests and blocks the 6th with HTTP 429 Too Many Requests and Retry-After header', async () => {
    // Send 5 valid requests
    for (let i = 1; i <= 5; i++) {
      const res = await supertest(app.getHttpServer())
        .post(`/admin/users/${targetId}/restore`)
        .set('X-TOTP-Code', `99900${i}`)
        .expect(201);
      expect(res.body).toEqual({ suspended: false });
    }

    // 6th request within the 60s TTL MUST be blocked by ThrottlerGuard
    const blockedRes = await supertest(app.getHttpServer())
      .post(`/admin/users/${targetId}/restore`)
      .set('X-TOTP-Code', '999006')
      .expect(429);

    expect(blockedRes.headers['retry-after']).toBeDefined();
    expect(Number(blockedRes.headers['retry-after'])).toBeGreaterThan(0);
    expect(blockedRes.body.message).toContain('ThrottlerException: Too Many Requests');
  });
});

describe('Adversarial Cryptographic TOTP Replay Prevention Verification', () => {
  it('empirically verifies that TotpService rejects replays and stale counters across time windows', async () => {
    const { TotpService } = await import('../auth/totp.service.js');
    const { generateSync } = await import('otplib');

    const validKey = 'ac11ef7cb2b1340920e937ec56d4782f8ed9e13becba2ddfac79a958b90b2180';
    const configService = {
      get: vi.fn((key: string) => (key === 'TOTP_ENCRYPTION_KEY' ? validKey : null)),
    } as any;
    const auditService = { record: vi.fn() } as any;

    let storedCounter: string | null = null;

    // Build mock dataSource with in-memory user
    const mockUser = {
      id: 'admin-uuid',
      totpEnabled: true,
      totpSecret: '', // set below after encryption
      totpLastCounter: null as string | null,
      isActive: true,
    };

    const dataSource = {
      transaction: async (cb: any) => {
        const manager = {
          getRepository: () => ({
            createQueryBuilder: () => ({
              addSelect: () => ({
                where: () => ({
                  setLock: () => ({
                    getOne: async () => ({
                      ...mockUser,
                      totpLastCounter: storedCounter,
                    }),
                  }),
                }),
              }),
            }),
            update: async (_id: string, updates: any) => {
              if (updates.totpLastCounter !== undefined) {
                storedCounter = updates.totpLastCounter;
              }
            },
          }),
        };
        return cb(manager);
      },
    } as any;

    const service = new TotpService(dataSource, configService, auditService);

    // Encrypt secret using service's private helper via prepareRecovery
    const recovery = await service.prepareRecovery('admin@example.com');
    // We can use the prepareRecovery encryptedSecret and secret
    const rawSecret = recovery.secret;
    mockUser.totpSecret = recovery.encryptedSecret;

    const baseEpoch = Math.floor(Date.now() / 1000);

    // Step 1: Generate valid token for current epoch
    const currentToken = generateSync({ secret: rawSecret, epoch: baseEpoch });

    // 1st verification MUST succeed
    const firstAttempt = await service.verifyLogin(mockUser.id, currentToken);
    expect(firstAttempt).toBe(true);
    expect(storedCounter).not.toBeNull();
    const firstCounter = storedCounter;

    // 2nd verification with the EXACT SAME TOKEN MUST fail (anti-replay)
    const replayAttempt = await service.verifyLogin(mockUser.id, currentToken);
    expect(replayAttempt).toBe(false);

    // 3rd verification with an older token (epoch - 30) MUST fail
    const pastToken = generateSync({ secret: rawSecret, epoch: baseEpoch - 30 });
    const pastAttempt = await service.verifyLogin(mockUser.id, pastToken);
    expect(pastAttempt).toBe(false);

    // 4th verification with a new token from next time step (epoch + 30) MUST succeed
    const nextToken = generateSync({ secret: rawSecret, epoch: baseEpoch + 30 });
    const nextAttempt = await service.verifyLogin(mockUser.id, nextToken);
    expect(nextAttempt).toBe(true);
    expect(Number(storedCounter)).toBeGreaterThan(Number(firstCounter));

    // 5th verification: replay of nextToken MUST fail
    const nextReplay = await service.verifyLogin(mockUser.id, nextToken);
    expect(nextReplay).toBe(false);
  });
});
