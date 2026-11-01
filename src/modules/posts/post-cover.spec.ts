import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PostsService } from './posts.service.js';
import { UserRole } from '../users/enums/user.enum.js';

vi.mock('node:fs/promises', () => ({ mkdir: vi.fn(), writeFile: vi.fn(), unlink: vi.fn().mockResolvedValue(undefined) }));
import { writeFile, unlink } from 'node:fs/promises';

describe('capa de artigo', () => {
  const owner = { userId: 'author', role: UserRole.AUTHOR };
  let repo: any;
  let builder: any;
  let service: PostsService;
  beforeEach(() => {
    vi.clearAllMocks();
    builder = { update: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), andWhere: vi.fn().mockReturnThis(), execute: vi.fn().mockResolvedValue({ affected: 1 }) };
    repo = { findOne: vi.fn().mockResolvedValue({ authorId: 'author', coverImage: null }), createQueryBuilder: vi.fn().mockReturnValue(builder) };
    service = new PostsService(repo, {} as any, {} as any);
  });
  it('processa a imagem e salva o caminho', async () => {
    const image = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).png().toBuffer();
    const result = await service.uploadCover('id', image, owner);
    expect(result.coverImage).toMatch(/^\/uploads\/post-covers\/.+\.webp$/);
    expect(writeFile).toHaveBeenCalledOnce();
    expect(builder.set).toHaveBeenCalledWith(result);
  });
  it('rejeita imagens inválidas e usuários sem permissão', async () => {
    await expect(service.uploadCover('id', Buffer.from('invalid'), owner)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.removeCover('id', { userId: 'other', role: UserRole.READER })).rejects.toBeInstanceOf(ForbiddenException);
    repo.findOne.mockResolvedValue(null);
    await expect(service.removeCover('id', owner)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('remove a capa anterior depois da atualização', async () => {
    repo.findOne.mockResolvedValue({ authorId: 'author', coverImage: '/uploads/post-covers/550e8400-e29b-41d4-a716-446655440000.webp' });
    expect(await service.removeCover('id', owner)).toEqual({ coverImage: null });
    expect(unlink).toHaveBeenCalledOnce();
  });
  it('descarta o novo arquivo quando há conflito', async () => {
    builder.execute.mockResolvedValue({ affected: 0 });
    const image = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#fff' } }).png().toBuffer();
    await expect(service.uploadCover('id', image, owner)).rejects.toBeInstanceOf(ConflictException);
    expect(unlink).toHaveBeenCalledOnce();
  });
});
