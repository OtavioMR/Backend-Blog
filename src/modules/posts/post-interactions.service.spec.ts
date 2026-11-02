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

  it('returns saved posts with public relations and pagination', async () => {
    const { service, posts } = setup();
    const post = {
      title: '<b>Title</b>', excerpt: 'Excerpt',
      author: { id: 'author', name: 'Author' },
      categories: [{ id: 'category', name: 'Category', slug: 'category', isActive: true }],
      tags: [{ id: 'tag', name: 'Tag', slug: 'tag' }],
    };
    const builder: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ['innerJoin', 'where', 'leftJoin', 'select', 'orderBy', 'addOrderBy', 'skip', 'take']) {
      builder[method] = vi.fn().mockReturnValue(builder);
    }
    builder.getManyAndCount = vi.fn().mockResolvedValue([[post], 11]);
    Object.assign(posts, { createQueryBuilder: vi.fn().mockReturnValue(builder) });

    const result = await service.saved('user', { page: 2, limit: 10 });
    expect(result.data[0]).toMatchObject({ title: 'Title', author: post.author, categories: post.categories, tags: post.tags });
    expect(result.meta).toMatchObject({ page: 2, limit: 10, total: 11 });
    expect(builder.leftJoin).toHaveBeenCalledWith('post.categories', 'category', 'category.is_active = true');
    expect(builder.select.mock.calls[0][0]).not.toContain('author.email');
    expect(builder.skip).toHaveBeenCalledWith(10);
  });
});
