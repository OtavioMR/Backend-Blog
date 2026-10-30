import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PostInteractionsService } from './post-interactions.service.js';
import type { Repository } from 'typeorm';
import type { Post } from './entities/post.entity.js';
import type { PostInteraction } from './entities/post-interaction.entity.js';

describe('PostInteractionsService', () => {
  function setup(exists = true) {
    const execute = vi.fn().mockResolvedValue(undefined);
    const builder = {
      insert: vi.fn(),
      values: vi.fn(),
      orUpdate: vi.fn(),
      execute,
    };
    builder.insert.mockReturnValue(builder);
    builder.values.mockReturnValue(builder);
    builder.orUpdate.mockReturnValue(builder);
    const posts = { exists: vi.fn().mockResolvedValue(exists) };
    const interactions = {
      createQueryBuilder: vi.fn().mockReturnValue(builder),
      findOneBy: vi.fn().mockResolvedValue(null),
      countBy: vi.fn().mockResolvedValue(3),
    };
    const service = new PostInteractionsService(
      posts as unknown as Repository<Post>,
      interactions as unknown as Repository<PostInteraction>,
    );
    return { service, posts, interactions, builder };
  }

  it('updates only the requested flag using an upsert', async () => {
    const { service, builder } = setup();
    await service.set('post', 'user', 'saved', true);
    expect(builder.values).toHaveBeenCalledWith({
      postId: 'post',
      userId: 'user',
      saved: true,
    });
    expect(builder.orUpdate).toHaveBeenCalledWith(
      ['saved'],
      ['post_id', 'user_id'],
    );
  });

  it('rejects interactions with unavailable posts', async () => {
    const { service, interactions } = setup(false);
    await expect(
      service.set('post', 'user', 'liked', true),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(interactions.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('returns default personal state and the total likes', async () => {
    const { service } = setup();
    await expect(service.status('post', 'user')).resolves.toEqual({
      liked: false,
      saved: false,
      likes: 3,
    });
  });
});
