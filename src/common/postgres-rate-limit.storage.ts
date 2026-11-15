import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { createHash } from 'node:crypto';

@Injectable()
export class PostgresRateLimitStorage implements ThrottlerStorage {
  constructor(private readonly db: DataSource) {}

  async increment(rawKey: string, ttl: number, limit: number, blockDuration: number, name: string) {
    const key = createHash('sha256').update(`${process.env.RATE_LIMIT_NAMESPACE ?? 'http'}:${name}:${rawKey}`).digest('hex');
    try {
      return await this.db.transaction(async manager => {
        await manager.query("SET LOCAL lock_timeout = '2000ms'");
        await manager.query("SET LOCAL statement_timeout = '3000ms'");
        await manager.query('INSERT INTO http_rate_limits(key, expires_at) VALUES($1, 0) ON CONFLICT DO NOTHING', [key]);
        const [row]: { hits: string[]; expires_at: string; blocked_until: string; now_ms: string }[] = await manager.query(
          `SELECT *, floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now_ms
           FROM http_rate_limits WHERE key = $1 FOR UPDATE`, [key]);
        const now = Number(row.now_ms);
        let hits = row.hits.map(Number).filter(expiry => expiry > now);
        let blockedUntil = Number(row.blocked_until);
        if (blockedUntil > 0 && blockedUntil <= now) { hits = []; blockedUntil = 0; }
        let blocked = blockedUntil > now;
        if (!blocked) {
          if (blockDuration > 0) {
            hits.push(now + ttl);
            if (hits.length > limit) { blocked = true; blockedUntil = now + blockDuration; }
          } else {
            blocked = hits.length >= limit;
            if (!blocked) hits.push(now + ttl);
          }
        }
        // Bounded by the configured limit (+ the first rejected hit), never by attack volume.
        const expires = Math.max(now + ttl, blockedUntil, ...hits);
        await manager.query('UPDATE http_rate_limits SET hits=$2::bigint[], expires_at=$3, blocked_until=$4 WHERE key=$1', [key, hits, expires, blockedUntil]);
        return { totalHits: hits.length + (blocked && blockDuration <= 0 ? 1 : 0),
          timeToExpire: Math.max(0, Math.ceil((expires - now) / 1000)), isBlocked: blocked,
          timeToBlockExpire: blocked ? Math.max(1, Math.ceil(((blockDuration > 0 ? blockedUntil : Math.min(...hits)) - now) / 1000)) : 0 };
      });
    } catch { throw new ServiceUnavailableException('Controle de requisições temporariamente indisponível.'); }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async cleanup(): Promise<void> {
    await this.db.query(`WITH expired AS (SELECT key FROM http_rate_limits
      WHERE expires_at <= floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint LIMIT 1000 FOR UPDATE SKIP LOCKED)
      DELETE FROM http_rate_limits r USING expired e WHERE r.key=e.key`);
    await this.db.query(`WITH expired AS (SELECT key FROM security_attempts WHERE expires_at <= clock_timestamp() LIMIT 1000 FOR UPDATE SKIP LOCKED)
      DELETE FROM security_attempts r USING expired e WHERE r.key=e.key`);
    await this.db.query(`WITH expired AS (SELECT key FROM admin_bff_sessions WHERE expires_at <= clock_timestamp() LIMIT 1000 FOR UPDATE SKIP LOCKED)
      DELETE FROM admin_bff_sessions r USING expired e WHERE r.key=e.key`);
  }
}
