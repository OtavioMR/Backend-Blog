import { describe, expect, it, vi } from 'vitest';
import { ModerationService } from './moderation.service.js';
import { UserRole } from '../users/enums/user.enum.js';

describe('ModerationService', () => {
  it('oculta e restaura apenas comentários ocultados pela moderação', async () => {
    const repository = { findOne: vi.fn(), update: vi.fn() };
    const manager = { getRepository: vi.fn().mockReturnValue(repository), query: vi.fn() };
    const audit = { record: vi.fn() };
    const service = new ModerationService({ transaction: (fn: any) => fn(manager) } as any, audit as any);
    repository.findOne.mockResolvedValueOnce({ id: 'c', postId: 'p', authorId: 'author', isActive: true, moderationHidden: false });
    await expect(service.moderateComment('c', 'admin', true, 'Conteúdo abusivo')).resolves.toMatchObject({ moderationHidden: true });
    expect(audit.record).toHaveBeenCalledWith(manager, 'admin', 'comment.hide', 'comment', 'c', expect.objectContaining({ reason: 'Conteúdo abusivo' }));
    repository.findOne.mockResolvedValueOnce({ id: 'c', isActive: false, moderationHidden: false });
    await expect(service.moderateComment('c', 'admin', false, 'Revisão concluída')).rejects.toThrow('Transição');
    repository.findOne.mockResolvedValueOnce({ id: 'c', postId: 'p', authorId: 'author', isActive: false, moderationHidden: true });
    await expect(service.moderateComment('c', 'admin', false, 'Revisão concluída')).resolves.toMatchObject({ isActive: true });
  });
  it('exige SUPER_ADMIN e registra a mudança de função com invalidação de sessões', async () => {
    const actor = { id: 'actor', role: UserRole.SUPER_ADMIN, isActive: true, authVersion: 1, totpEnabled: true };
    const target = { id: 'target', role: UserRole.READER, isActive: true, emailVerified: true };
    const repository = { findOne: vi.fn().mockResolvedValueOnce(actor).mockResolvedValueOnce(target), update: vi.fn() };
    const manager = { getRepository: vi.fn().mockReturnValue(repository), query: vi.fn() };
    const audit = { record: vi.fn() };
    const service = new ModerationService({ transaction: (fn: any) => fn(manager) } as any, audit as any);
    await expect(service.changeRole('actor', 'target', UserRole.ADMIN, 'Promoção aprovada', 1)).resolves.toEqual({ id: 'target', role: UserRole.ADMIN });
    expect(repository.update).toHaveBeenCalledWith('target', expect.objectContaining({ role: UserRole.ADMIN, authVersion: expect.any(Function), refreshTokenHash: null }));
    expect(audit.record).toHaveBeenCalledWith(manager, 'actor', 'user.permissions_changed', 'user', 'target', expect.objectContaining({ previousRole: UserRole.READER, role: UserRole.ADMIN }));
    repository.findOne.mockResolvedValueOnce({ ...actor, role: UserRole.ADMIN });
    await expect(service.changeRole('actor', 'target', UserRole.ADMIN, 'Promoção aprovada', 1)).rejects.toThrow('Sessão administrativa');
  });
  it('impede suspender ou restaurar outra conta administrativa', async () => {
    const repository = { findOne: vi.fn().mockImplementation(({ where }: any) => Promise.resolve(where.id === 'actor' ? { id: 'actor', role: UserRole.ADMIN, isActive: true, authVersion: 1 } : { id: 'target', role: UserRole.ADMIN })), update: vi.fn() };
    const manager = { getRepository: vi.fn().mockReturnValue(repository) };
    const dataSource: any = { transaction: (callback: any) => callback(manager) };
    const audit: any = { record: vi.fn() };
    const service = new ModerationService(dataSource, audit);
    await expect(service.suspend('actor', 'target', 'motivo válido', null, [], 1)).rejects.toThrow('administrativa');
    await expect(service.restore('actor', 'target', 1)).rejects.toThrow('administrativa');
    expect(repository.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
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
