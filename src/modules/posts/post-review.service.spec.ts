import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PostReviewService } from './post-review.service.js';
import { Post } from './entities/post.entity.js';
import { UserRole } from '../users/enums/user.enum.js';

describe('PostReviewService', () => {
  it('exige justificativa, impede revisão própria e registra rejeição com motivo', async () => {
    const posts = { findOne: vi.fn().mockResolvedValue({ id: 'post', authorId: 'author', reviewStatus: 'PENDING' }), update: vi.fn() };
    const users = { findOne: vi.fn().mockResolvedValue({ id: 'author', role: UserRole.AUTHOR, isActive: true, firstPostApproved: false }) };
    const manager = { getRepository: vi.fn(entity => entity === Post ? posts : users), query: vi.fn() };
    const audit = { record: vi.fn() };
    const service = new PostReviewService({ transaction: (callback: any) => callback(manager) } as any, audit as any);
    await expect(service.decide('post', 'REJECTED', 'admin')).rejects.toThrow(BadRequestException);
    await expect(service.decide('post', 'APPROVED', 'author')).rejects.toThrow(ForbiddenException);
    await expect(service.decide('post', 'REJECTED', 'admin', '  Precisa de fontes  ')).resolves.toEqual({ status: 'REJECTED' });
    expect(posts.update).toHaveBeenCalledWith('post', expect.objectContaining({ reviewStatus: 'REJECTED', reviewNote: 'Precisa de fontes', published: false }));
    expect(audit.record).toHaveBeenCalledWith(manager, 'admin', 'post.review', 'post', 'post', expect.objectContaining({ reason: 'Precisa de fontes' }));
  });
  it('restringe o resultado ao autor e à administração', async () => {
    const query = { addSelect: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), getOne: vi.fn().mockResolvedValue({ authorId: 'author', reviewStatus: 'REJECTED', reviewNote: 'Faltam fontes' }) };
    const service = new PostReviewService({ getRepository: () => ({ createQueryBuilder: () => query }) } as any, {} as any);
    await expect(service.result('post', { userId: 'author', role: UserRole.AUTHOR })).resolves.toEqual({ status: 'REJECTED', reason: 'Faltam fontes' });
    await expect(service.result('post', { userId: 'other', role: UserRole.READER })).rejects.toThrow(ForbiddenException);
    await expect(service.result('post', { userId: 'admin', role: UserRole.SUPER_ADMIN })).resolves.toHaveProperty('reason', 'Faltam fontes');
  });
});
