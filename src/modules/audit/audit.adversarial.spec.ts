import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BadRequestException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuditController, AuditQuery } from './audit.controller.js';
import { AuditService } from './audit.service.js';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guard/roles.guard.js';
import { UserRole } from '../users/enums/user.enum.js';

describe('Adversarial Audit: DTO Validation & Edge Cases', () => {
  it('accepts valid truthy and falsy transforms', async () => {
    for (const val of ['true', '1', true]) {
      const dto = plainToInstance(AuditQuery, { includeSessions: val });
      const errors = await validate(dto);
      expect(dto.includeSessions).toBe(true);
      expect(errors.filter(e => e.property === 'includeSessions')).toHaveLength(0);
    }

    for (const val of ['false', '0', false]) {
      const dto = plainToInstance(AuditQuery, { includeSessions: val });
      const errors = await validate(dto);
      expect(dto.includeSessions).toBe(false);
      expect(errors.filter(e => e.property === 'includeSessions')).toHaveLength(0);
    }
  });

  it('leaves includeSessions undefined when parameter is omitted', async () => {
    const dto = plainToInstance(AuditQuery, {});
    const errors = await validate(dto);
    expect(dto.includeSessions).toBeUndefined();
    expect(errors.filter(e => e.property === 'includeSessions')).toHaveLength(0);
  });

  it('rejects malicious/malformed inputs to includeSessions', async () => {
    const maliciousInputs = [
      'banana',
      'yes',
      'no',
      'TRUE',
      'FALSE',
      'null',
      'undefined',
      '',
      123,
      ['true', 'false'],
      { malicious: true },
    ];

    for (const input of maliciousInputs) {
      const dto = plainToInstance(AuditQuery, { includeSessions: input });
      const errors = await validate(dto);
      const sessionError = errors.find(e => e.property === 'includeSessions');
      expect(sessionError, `Expected validation failure for input: ${JSON.stringify(input)}`).toBeDefined();
    }
  });

  it('validates UUID constraints on actorId and targetId', async () => {
    const invalidDto = plainToInstance(AuditQuery, {
      actorId: 'not-a-uuid',
      targetId: '12345',
    });
    const errors = await validate(invalidDto);
    expect(errors.some(e => e.property === 'actorId')).toBe(true);
    expect(errors.some(e => e.property === 'targetId')).toBe(true);
  });
});

describe('Adversarial Audit: HTTP ValidationPipe Integration', () => {
  let app: INestApplication;
  const auditServiceMock = {
    list: vi.fn().mockResolvedValue({ data: [], meta: {} }),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [
        RolesGuard,
        { provide: AuditService, useValue: auditServiceMock },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          context.switchToHttp().getRequest().user = {
            userId: 'admin-id',
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
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('HTTP GET /admin/audit-logs succeeds with includeSessions=true', async () => {
    await supertest(app.getHttpServer())
      .get('/admin/audit-logs?includeSessions=true')
      .expect(200);
    expect(auditServiceMock.list).toHaveBeenCalledWith(undefined, undefined, expect.objectContaining({ includeSessions: true }));
  });

  it('HTTP GET /admin/audit-logs succeeds with includeSessions=false', async () => {
    await supertest(app.getHttpServer())
      .get('/admin/audit-logs?includeSessions=false')
      .expect(200);
    expect(auditServiceMock.list).toHaveBeenCalledWith(undefined, undefined, expect.objectContaining({ includeSessions: false }));
  });

  it('HTTP GET /admin/audit-logs succeeds with includeSessions=1 (parsed as true)', async () => {
    await supertest(app.getHttpServer())
      .get('/admin/audit-logs?includeSessions=1')
      .expect(200);
    expect(auditServiceMock.list).toHaveBeenCalledWith(undefined, undefined, expect.objectContaining({ includeSessions: true }));
  });

  it('HTTP GET /admin/audit-logs succeeds with includeSessions=0 (parsed as false)', async () => {
    await supertest(app.getHttpServer())
      .get('/admin/audit-logs?includeSessions=0')
      .expect(200);
    expect(auditServiceMock.list).toHaveBeenCalledWith(undefined, undefined, expect.objectContaining({ includeSessions: false }));
  });

  it('HTTP GET /admin/audit-logs rejects non-boolean includeSessions with 400 Bad Request', async () => {
    const res = await supertest(app.getHttpServer())
      .get('/admin/audit-logs?includeSessions=invalid_string')
      .expect(400);

    expect(JSON.stringify(res.body)).toContain('includeSessions');
  });

  it('HTTP GET /admin/audit-logs rejects parameter pollution array with 400 Bad Request', async () => {
    const res = await supertest(app.getHttpServer())
      .get('/admin/audit-logs?includeSessions=true&includeSessions=false')
      .expect(400);

    expect(JSON.stringify(res.body)).toContain('includeSessions');
  });
});

describe('Adversarial Audit: SQL Query Generation Matrix', () => {
  let service: AuditService;
  let queryBuilder: any;
  let dataSource: any;

  beforeAll(() => {
    queryBuilder = {
      andWhere: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      addOrderBy: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      take: vi.fn().mockReturnThis(),
      getManyAndCount: vi.fn().mockResolvedValue([[], 0]),
    };

    const repository = {
      createQueryBuilder: vi.fn().mockReturnValue(queryBuilder),
    };

    dataSource = {
      getRepository: vi.fn().mockReturnValue(repository),
      query: vi.fn().mockResolvedValue([]),
    };

    service = new AuditService(dataSource);
  });

  const getExclusionCalls = () =>
    queryBuilder.andWhere.mock.calls.filter((call: any[]) =>
      typeof call[0] === 'string' && call[0].includes("log.targetType != 'session'"),
    );

  it('Scenario 1: Default query (no filters) MUST exclude sessions', async () => {
    queryBuilder.andWhere.mockClear();
    await service.list(1, 20, {});

    expect(getExclusionCalls()).toHaveLength(1);
    expect(getExclusionCalls()[0][0]).toBe(
      "log.targetType != 'session' AND log.action NOT IN (:...sessionActions)",
    );
    expect(getExclusionCalls()[0][1]).toEqual({
      sessionActions: ['auth.session_created', 'auth.session_revoked'],
    });
  });

  it('Scenario 2: includeSessions=false MUST exclude sessions', async () => {
    queryBuilder.andWhere.mockClear();
    await service.list(1, 20, { includeSessions: false });

    expect(getExclusionCalls()).toHaveLength(1);
  });

  it('Scenario 3: includeSessions=true MUST NOT exclude sessions', async () => {
    queryBuilder.andWhere.mockClear();
    await service.list(1, 20, { includeSessions: true });

    expect(getExclusionCalls()).toHaveLength(0);
  });

  it('Scenario 4: explicit targetType="session" with includeSessions=false MUST NOT exclude sessions', async () => {
    queryBuilder.andWhere.mockClear();
    await service.list(1, 20, { targetType: 'session', includeSessions: false });

    expect(getExclusionCalls()).toHaveLength(0);
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('log.targetType = :targetType', {
      targetType: 'session',
    });
  });

  it('Scenario 5: explicit action="auth.session_created" with includeSessions=false MUST NOT exclude sessions', async () => {
    queryBuilder.andWhere.mockClear();
    await service.list(1, 20, { action: 'auth.session_created', includeSessions: false });

    expect(getExclusionCalls()).toHaveLength(0);
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('log.action = :action', {
      action: 'auth.session_created',
    });
  });

  it('Scenario 6: explicit action="auth.session_revoked" with includeSessions=false MUST NOT exclude sessions', async () => {
    queryBuilder.andWhere.mockClear();
    await service.list(1, 20, { action: 'auth.session_revoked', includeSessions: false });

    expect(getExclusionCalls()).toHaveLength(0);
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('log.action = :action', {
      action: 'auth.session_revoked',
    });
  });

  it('Scenario 7: non-session action="user.suspend" with includeSessions=false MUST apply BOTH action filter AND session exclusion', async () => {
    queryBuilder.andWhere.mockClear();
    await service.list(1, 20, { action: 'user.suspend', includeSessions: false });

    expect(getExclusionCalls()).toHaveLength(1);
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('log.action = :action', {
      action: 'user.suspend',
    });
  });

  it('Scenario 8: non-session targetType="user" with includeSessions=false MUST apply BOTH targetType filter AND session exclusion', async () => {
    queryBuilder.andWhere.mockClear();
    await service.list(1, 20, { targetType: 'user', includeSessions: false });

    expect(getExclusionCalls()).toHaveLength(1);
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('log.targetType = :targetType', {
      targetType: 'user',
    });
  });

  it('Scenario 9: invalid date interval (from > to) throws BadRequestException', async () => {
    await expect(
      service.list(1, 20, { from: '2026-12-31T23:59:59Z', to: '2026-01-01T00:00:00Z' }),
    ).rejects.toThrow(BadRequestException);
  });
});
