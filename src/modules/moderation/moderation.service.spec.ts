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
    const target = { id: 'target', role: UserRole.READER, isActive: true, emailVerified: true, totpEnabled: true, recoveryEmail: 'synthetic@example.invalid', recoveryEmailVerifiedAt: new Date() };
    const repository = { findOne: vi.fn().mockResolvedValueOnce(actor).mockResolvedValueOnce(target), update: vi.fn() };
    const manager = { getRepository: vi.fn().mockReturnValue(repository), query: vi.fn() };
    const audit = { record: vi.fn() };
    const service = new ModerationService({ transaction: (fn: any) => fn(manager) } as any, audit as any);
    await expect(service.changeRole('actor', 'target', UserRole.ADMIN, 'Promoção aprovada', 1)).resolves.toEqual({ id: 'target', role: UserRole.ADMIN });
    expect(repository.update).toHaveBeenCalledWith('target', expect.objectContaining({ role: UserRole.ADMIN, authVersion: expect.any(Function), refreshTokenHash: null }));
    expect(manager.query).toHaveBeenCalledWith('DELETE FROM auth_sessions WHERE user_id = $1', ['target']);
    expect(audit.record).toHaveBeenCalledWith(manager, 'actor', 'user.permissions_changed', 'user', 'target', expect.objectContaining({ previousRole: UserRole.READER, role: UserRole.ADMIN }));
    repository.findOne.mockResolvedValueOnce({ ...actor, role: UserRole.ADMIN }).mockResolvedValueOnce(target);
    await expect(service.changeRole('actor', 'target', UserRole.ADMIN, 'Promoção aprovada', 1)).rejects.toThrow('Administradores só podem rebaixar contas para leitor');
  });
  it('permite que ADMIN rebaixe AUTHOR para READER com registro na auditoria', async () => {
    const actor = { id: 'admin-actor', role: UserRole.ADMIN, isActive: true, authVersion: 1, totpEnabled: true };
    const target = { id: 'author-target', role: UserRole.AUTHOR, isActive: true, emailVerified: true };
    const repository = { findOne: vi.fn().mockResolvedValueOnce(actor).mockResolvedValueOnce(target), update: vi.fn() };
    const manager = { getRepository: vi.fn().mockReturnValue(repository), query: vi.fn().mockResolvedValue([]) };
    const audit = { record: vi.fn() };
    const service = new ModerationService({ transaction: (fn: any) => fn(manager) } as any, audit as any);
    await expect(service.changeRole('admin-actor', 'author-target', UserRole.READER, 'Rebaixamento por violação de regras', 1)).resolves.toEqual({ id: 'author-target', role: UserRole.READER });
    expect(repository.update).toHaveBeenCalledWith('author-target', expect.objectContaining({ role: UserRole.READER, authorPromotionBlocked: true }));
    expect(audit.record).toHaveBeenCalledWith(manager, 'admin-actor', 'user.permissions_changed', 'user', 'author-target', expect.objectContaining({ previousRole: UserRole.AUTHOR, role: UserRole.READER }));
  });
  it('impede que ADMIN altere cargo de outro ADMIN ou SUPER_ADMIN', async () => {
    const actor = { id: 'admin-actor', role: UserRole.ADMIN, isActive: true, authVersion: 1, totpEnabled: true };
    const targetAdmin = { id: 'other-admin', role: UserRole.ADMIN, isActive: true };
    const repository = { findOne: vi.fn().mockResolvedValueOnce(actor).mockResolvedValueOnce(targetAdmin) };
    const manager = { getRepository: vi.fn().mockReturnValue(repository), query: vi.fn() };
    const service = new ModerationService({ transaction: (fn: any) => fn(manager) } as any, {} as any);
    await expect(service.changeRole('admin-actor', 'other-admin', UserRole.READER, 'Tentativa indevida', 1)).rejects.toThrow('Administradores não podem alterar o cargo de outros administradores');
  });
  it('permite que ADMIN libere solicitação de autoria bloqueada de READER', async () => {
    const actor = { id: 'admin-actor', role: UserRole.ADMIN, isActive: true, authVersion: 1, totpEnabled: true };
    const target = { id: 'reader-target', role: UserRole.READER, isActive: true, authorPromotionBlocked: true };
    const repository = { findOne: vi.fn().mockResolvedValueOnce(actor).mockResolvedValueOnce(target), update: vi.fn() };
    const manager = { getRepository: vi.fn().mockReturnValue(repository), query: vi.fn() };
    const audit = { record: vi.fn() };
    const service = new ModerationService({ transaction: (fn: any) => fn(manager) } as any, audit as any);
    await expect(service.allowAuthorRequest('admin-actor', 'reader-target', 'Solicitação aceita após recurso', 1)).resolves.toEqual({ allowed: true });
    expect(repository.update).toHaveBeenCalledWith('reader-target', { authorPromotionBlocked: false, authorAccessRequestedAt: null });
    expect(audit.record).toHaveBeenCalledWith(manager, 'admin-actor', 'user.author_request_unblocked', 'user', 'reader-target', { reason: 'Solicitação aceita após recurso' });
  });
  it('impede atribuir a função SUPER_ADMIN pela rota administrativa', async () => {
    const service = new ModerationService({} as any, {} as any);
    await expect(service.changeRole('actor', 'target', UserRole.SUPER_ADMIN, 'Justificativa válida', 1)).rejects.toThrow('Não é permitido atribuir a função SUPER_ADMIN');
  });
  it('impede que o superadmin altere a própria função', async () => {
    const service = new ModerationService({} as any, {} as any);
    await expect(service.changeRole('actor', 'actor', UserRole.ADMIN, 'Justificativa válida', 1)).rejects.toThrow('Não é permitido alterar a própria função');
  });
  it('impede promover a ADMIN usuário com e-mail não verificado', async () => {
    const actor = { id: 'actor', role: UserRole.SUPER_ADMIN, isActive: true, authVersion: 1, totpEnabled: true };
    const target = { id: 'target', role: UserRole.READER, isActive: true, emailVerified: false };
    const repository = { findOne: vi.fn().mockResolvedValueOnce(actor).mockResolvedValueOnce(target) };
    const manager = { getRepository: vi.fn().mockReturnValue(repository), query: vi.fn() };
    const service = new ModerationService({ transaction: (fn: any) => fn(manager) } as any, {} as any);
    await expect(service.changeRole('actor', 'target', UserRole.ADMIN, 'Promoção aprovada', 1)).rejects.toThrow('A conta precisa ter e-mail verificado');
  });
  it.each([null, new Date()])('requires an address and its verification before administrative promotion (%s)', async verifiedAt => {
    const actor = { id: 'actor', role: UserRole.SUPER_ADMIN, isActive: true, authVersion: 1, totpEnabled: true };
    const target = { id: 'target', role: UserRole.READER, isActive: true, emailVerified: true, totpEnabled: true, recoveryEmail: verifiedAt ? null : 'synthetic@example.invalid', recoveryEmailVerifiedAt: verifiedAt };
    const repository = { findOne: vi.fn().mockResolvedValueOnce(actor).mockResolvedValueOnce(target), update: vi.fn() };
    const manager = { getRepository: vi.fn().mockReturnValue(repository), query: vi.fn() };
    const service = new ModerationService({ transaction: (fn: any) => fn(manager) } as any, {} as any);
    await expect(service.changeRole('actor', 'target', UserRole.ADMIN, 'Synthetic verified promotion', 1)).rejects.toThrow('secundário');
    expect(repository.update).not.toHaveBeenCalled();
  });
  it('impede remover o último superadministrador', async () => {
    const actor = { id: 'actor', role: UserRole.SUPER_ADMIN, isActive: true, authVersion: 1, totpEnabled: true };
    const target = { id: 'target', role: UserRole.SUPER_ADMIN, isActive: true, emailVerified: true, totpEnabled: true, recoveryEmail: 'synthetic@example.invalid', recoveryEmailVerifiedAt: new Date() };
    const repository = { findOne: vi.fn().mockResolvedValueOnce(actor).mockResolvedValueOnce(target), count: vi.fn().mockResolvedValueOnce(1) };
    const manager = { getRepository: vi.fn().mockReturnValue(repository), query: vi.fn() };
    const service = new ModerationService({ transaction: (fn: any) => fn(manager) } as any, {} as any);
    await expect(service.changeRole('actor', 'target', UserRole.ADMIN, 'Rebaixamento', 1)).rejects.toThrow('último SUPER_ADMIN');
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
  it('retorna os dados de moderação do usuário incluindo profilePhoto', async () => {
    const user = { id: 'user-1', name: 'Admin Teste', email: 'admin@test.com', profilePhoto: '/uploads/profile-photos/admin.webp', role: UserRole.ADMIN, isActive: true, moderationSuspended: false, suspensionEndsAt: null, emailVerified: true, totpEnabled: true, authorPromotionBlocked: false, createdAt: new Date() };
    const repository = { findOne: vi.fn().mockResolvedValue(user) };
    const dataSource: any = {
      getRepository: vi.fn().mockReturnValue(repository),
      query: vi.fn().mockResolvedValue([{ posts: 3, comments: 5 }]),
    };
    const service = new ModerationService(dataSource, {} as any);
    const detail = await service.userDetail('user-1');
    expect(detail).toMatchObject({
      id: 'user-1',
      name: 'Admin Teste',
      profilePhoto: '/uploads/profile-photos/admin.webp',
      counts: { posts: 3, comments: 5 },
    });
  });
  it('returns only verified destinations and reveals the secondary address only to SUPER_ADMIN', async () => {
    const user = { id: 'target', email: 'primary@example.invalid', emailVerified: true, recoveryEmail: 'secondary@example.invalid', recoveryEmailVerifiedAt: new Date() };
    const repository = { findOne: vi.fn().mockResolvedValue(user) };
    const service = new ModerationService({ getRepository: () => repository, query: async () => [{}] } as any, {} as any);
    const detail = await service.userDetail('target', UserRole.SUPER_ADMIN);
    expect(detail.recoveryDestinations).toEqual([{ destination: 'primary', email: user.email }, { destination: 'secondary', email: user.recoveryEmail }]);
    expect(detail).not.toHaveProperty('recoveryEmail');
    expect(await service.userDetail('target', UserRole.ADMIN)).not.toHaveProperty('recoveryDestinations');
    Object.assign(user, { emailVerified: false, recoveryEmailVerifiedAt: null });
    expect((await service.userDetail('target', UserRole.SUPER_ADMIN)).recoveryDestinations).toEqual([]);
  });
});
