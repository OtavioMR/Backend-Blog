import { describe, expect, it, vi } from 'vitest';
import { ModerationService } from './moderation.service.js';

describe('ModerationService', () => {
  it('restores expired suspensions and records each restoration in the same transaction', async () => {
    const query: any = { where: vi.fn().mockReturnThis(), setLock: vi.fn().mockReturnThis(), setOnLocked: vi.fn().mockReturnThis(), take: vi.fn().mockReturnThis(), getMany: vi.fn().mockResolvedValue([{ id: 'user-1' }]) };
    const repository = { createQueryBuilder: vi.fn().mockReturnValue(query), update: vi.fn() };
    const manager: any = { getRepository: vi.fn().mockReturnValue(repository) };
    const dataSource: any = { transaction: (callback: any) => callback(manager) };
    const audit: any = { record: vi.fn() };
    await new ModerationService(dataSource, audit).restoreExpired();
    expect(repository.update).toHaveBeenCalledWith('user-1', { isActive: true, moderationSuspended: false, suspensionEndsAt: null });
    expect(audit.record).toHaveBeenCalledWith(manager, null, 'user.suspension_expired', 'user', 'user-1');
  });
});
