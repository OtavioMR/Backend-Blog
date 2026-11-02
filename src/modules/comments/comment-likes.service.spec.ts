import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Repository } from 'typeorm';
import { Comment } from './entities/comment.entity.js';
import { CommentLikesService } from './comment-likes.service.js';

describe('CommentLikesService', () => {
  it('uses an idempotent insert and reports the count and personal state', async () => {
    const query = vi.fn().mockResolvedValueOnce([{ id: 'comment' }]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'comment' }]).mockResolvedValueOnce([{ likes: 1, liked: true }]);
    const service = new CommentLikesService({ query } as unknown as Repository<Comment>);
    await service.set('comment', 'user', true);
    expect(query.mock.calls[1][0]).toContain('ON CONFLICT DO NOTHING');
    await expect(service.status('comment', 'user')).resolves.toEqual({ likes: 1, liked: true });
  });
  it('does not allow interactions with unavailable comments', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const service = new CommentLikesService({ query } as unknown as Repository<Comment>);
    await expect(service.set('comment', 'user', true)).rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
