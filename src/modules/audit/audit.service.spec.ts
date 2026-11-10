import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuditService } from './audit.service.js';
import { AuditQuery } from './audit.controller.js';
import { AuditLog } from './audit.entity.js';

describe('AuditQuery DTO', () => {
  it('converts truthy string values to boolean true', async () => {
    for (const val of ['true', true, '1']) {
      const dto = plainToInstance(AuditQuery, { includeSessions: val });
      const errors = await validate(dto);
      expect(dto.includeSessions).toBe(true);
      expect(errors.filter(e => e.property === 'includeSessions')).toHaveLength(0);
    }
  });

  it('converts falsy string values to boolean false', async () => {
    for (const val of ['false', false, '0']) {
      const dto = plainToInstance(AuditQuery, { includeSessions: val });
      const errors = await validate(dto);
      expect(dto.includeSessions).toBe(false);
      expect(errors.filter(e => e.property === 'includeSessions')).toHaveLength(0);
    }
  });

  it('leaves includeSessions undefined when not provided', async () => {
    const dto = plainToInstance(AuditQuery, {});
    const errors = await validate(dto);
    expect(dto.includeSessions).toBeUndefined();
    expect(errors.filter(e => e.property === 'includeSessions')).toHaveLength(0);
  });

  it('rejects invalid non-boolean string values', async () => {
    const dto = plainToInstance(AuditQuery, { includeSessions: 'banana' });
    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'includeSessions')).toBe(true);
  });
});

describe('AuditService', () => {
  let service: AuditService;
  let dataSource: any;
  let queryBuilder: any;
  let repository: any;

  beforeEach(() => {
    queryBuilder = {
      andWhere: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      addOrderBy: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      take: vi.fn().mockReturnThis(),
      getManyAndCount: vi.fn().mockResolvedValue([[], 0]),
    };

    repository = {
      createQueryBuilder: vi.fn().mockReturnValue(queryBuilder),
      create: vi.fn(x => x),
      save: vi.fn(x => Promise.resolve(x)),
    };

    dataSource = {
      getRepository: vi.fn().mockReturnValue(repository),
      query: vi.fn().mockResolvedValue([]),
    };

    service = new AuditService(dataSource);
  });

  it('excludes session events by default when includeSessions is omitted', async () => {
    await service.list(1, 20);

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      "log.targetType != 'session' AND log.action NOT IN (:...sessionActions)",
      { sessionActions: ['auth.session_created', 'auth.session_revoked'] }
    );
  });

  it('excludes session events when includeSessions is explicitly false', async () => {
    await service.list(1, 20, { includeSessions: false });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      "log.targetType != 'session' AND log.action NOT IN (:...sessionActions)",
      { sessionActions: ['auth.session_created', 'auth.session_revoked'] }
    );
  });

  it('includes session events when includeSessions is true', async () => {
    await service.list(1, 20, { includeSessions: true });

    const exclusionCalls = queryBuilder.andWhere.mock.calls.filter((call: any[]) =>
      typeof call[0] === 'string' && call[0].includes("log.targetType != 'session'")
    );
    expect(exclusionCalls).toHaveLength(0);
  });

  it('does not exclude sessions when targetType is explicitly session', async () => {
    await service.list(1, 20, { targetType: 'session' });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('log.targetType = :targetType', { targetType: 'session' });
    const exclusionCalls = queryBuilder.andWhere.mock.calls.filter((call: any[]) =>
      typeof call[0] === 'string' && call[0].includes("log.targetType != 'session'")
    );
    expect(exclusionCalls).toHaveLength(0);
  });

  it('does not exclude sessions when action is explicitly auth.session_created', async () => {
    await service.list(1, 20, { action: 'auth.session_created' });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('log.action = :action', { action: 'auth.session_created' });
    const exclusionCalls = queryBuilder.andWhere.mock.calls.filter((call: any[]) =>
      typeof call[0] === 'string' && call[0].includes("log.targetType != 'session'")
    );
    expect(exclusionCalls).toHaveLength(0);
  });

  it('does not exclude sessions when action is explicitly auth.session_revoked', async () => {
    await service.list(1, 20, { action: 'auth.session_revoked' });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('log.action = :action', { action: 'auth.session_revoked' });
    const exclusionCalls = queryBuilder.andWhere.mock.calls.filter((call: any[]) =>
      typeof call[0] === 'string' && call[0].includes("log.targetType != 'session'")
    );
    expect(exclusionCalls).toHaveLength(0);
  });

  it('throws BadRequestException for invalid date range', async () => {
    await expect(service.list(1, 20, { from: '2026-05-10', to: '2026-05-01' })).rejects.toThrow(
      BadRequestException
    );
  });

  it('records audit log entries through entity manager', async () => {
    const managerRepo = {
      create: vi.fn(x => x),
      save: vi.fn(x => Promise.resolve(x)),
    };
    const manager = {
      getRepository: vi.fn().mockReturnValue(managerRepo),
    } as any;

    await service.record(manager, 'actor-123', 'post.delete', 'post', 'post-456', { reason: 'spam' });

    expect(manager.getRepository).toHaveBeenCalledWith(AuditLog);
    expect(managerRepo.create).toHaveBeenCalledWith({
      actorId: 'actor-123',
      action: 'post.delete',
      targetType: 'post',
      targetId: 'post-456',
      details: { reason: 'spam' },
    });
    expect(managerRepo.save).toHaveBeenCalled();
  });
});
