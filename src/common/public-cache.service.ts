import { createHash, randomUUID } from 'node:crypto';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class PublicCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(PublicCacheService.name);
  private readonly redis: Redis;
  private ready = false;
  constructor(config: ConfigService) {
    this.redis = new Redis(config.get<string>('REDIS_URL', 'redis://127.0.0.1:6379'), { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false });
    this.redis.on('ready', () => {
      void this.redis.set('public:epoch', randomUUID()).then(() => { this.ready = this.redis.status === 'ready'; }).catch(() => { this.ready = false; });
    });
    this.redis.on('close', () => { this.ready = false; });
    this.redis.on('error', () => this.logger.warn('Cache Redis indisponível; consultas continuam no banco.'));
  }

  async key(url: string): Promise<string | null> {
    try {
      if (this.redis.status === 'wait') { void this.redis.connect().catch(() => undefined); return null; }
      if (!this.ready || this.redis.status !== 'ready') return null;
      const version = await this.redis.get('public:epoch');
      if (!version) return null;
      return `public:v2:${version}:${createHash('sha256').update(url).digest('hex')}`;
    } catch { return null; }
  }

  async invalidate(): Promise<void> {
    try { await this.redis.set('public:epoch', randomUUID()); }
    catch { this.ready = false; }
  }

  async read(key: string): Promise<unknown> {
    try {
      const value = await this.redis.get(key);
      return value === null ? undefined : JSON.parse(value);
    } catch { return undefined; }
  }

  async write(key: string, value: unknown): Promise<void> {
    try { await this.redis.set(key, JSON.stringify(value), 'EX', 60); } catch { /* Cache é opcional. */ }
  }

  async onModuleDestroy(): Promise<void> { this.redis.disconnect(); }
}
