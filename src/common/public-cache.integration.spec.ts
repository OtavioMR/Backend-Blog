import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PublicCacheService } from './public-cache.service.js';

describe.skipIf(process.env.RUN_REDIS_TESTS !== '1')('public Redis cache across instances', () => {
  let cache: PublicCacheService;
  let peer: PublicCacheService;
  beforeAll(async () => {
    const config = { get: () => 'redis://127.0.0.1:16379' } as unknown as ConfigService;
    cache = new PublicCacheService(config);
    peer = new PublicCacheService(config);
    await vi.waitFor(async () => {
      expect(await cache.key('/ready')).toBeTruthy();
      expect(await peer.key('/ready')).toBeTruthy();
    }, { timeout: 5000 });
  });
  afterAll(async () => { await cache?.onModuleDestroy(); await peer?.onModuleDestroy(); });
  it('shares results without a PostgreSQL dependency and invalidates all instances', async () => {
    const url = `/api/v1/tags?test=${randomUUID()}`;
    const key = await cache.key(url);
    expect(await peer.key(url)).toBe(key);
    await cache.write(key!, { data: ['original'] });
    expect(await peer.read(key!)).toEqual({ data: ['original'] });
    await cache.invalidate();
    const nextKey = await peer.key(url);
    expect(nextKey).not.toBe(key);
    expect(await peer.read(nextKey!)).toBeUndefined();
  });
});
