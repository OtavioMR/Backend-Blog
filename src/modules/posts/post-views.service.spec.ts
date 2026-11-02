import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import type { Repository } from 'typeorm';
import { Post } from './entities/post.entity.js';
import { PostViewsService } from './post-views.service.js';

describe('PostViewsService', () => {
  function setup() {
    const query = vi.fn();
    const exists = vi.fn();
    const posts = { manager: { query }, exists } as unknown as Repository<Post>;
    return { service: new PostViewsService(posts, { getOrThrow: () => 'secret' } as unknown as ConfigService), query, exists };
  }
  it('counts a new visitor and reports the accumulated total', async () => {
    const { service, query } = setup();
    query.mockResolvedValueOnce([{ post_id: 'id' }]).mockResolvedValueOnce([{ total: 7 }]);
    await expect(service.record('id', '127.0.0.1')).resolves.toEqual({ counted: true, total: 7 });
    const parameters = query.mock.calls[0][1];
    expect(parameters[1]).toMatch(/^[a-f0-9]{64}$/);
    expect(parameters[1]).not.toContain('127.0.0.1');
  });
  it('does not count a duplicate and rejects unavailable posts', async () => {
    const { service, query, exists } = setup();
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 1 }]).mockResolvedValueOnce([]);
    exists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(service.record('id', 'ip')).resolves.toEqual({ counted: false, total: 1 });
    await expect(service.record('id', 'ip')).rejects.toBeInstanceOf(NotFoundException);
  });
  it('returns a consistent total even when the requested page is empty', async () => {
    const { service, query } = setup();
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 3 }]);
    const result = await service.trending({ page: 2, limit: 10 });
    expect(result.data).toEqual([]);
    expect(result.meta.total).toBe(3);
    expect(query.mock.calls[0][0]).toContain("::date - 6");
  });
});
