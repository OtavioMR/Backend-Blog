import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import dataSource from '../database/data-source.js';
import { PostgresRateLimitStorage } from './postgres-rate-limit.storage.js';
import { VerificationCodeService } from '../modules/users/verification-code.service.js';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('PostgreSQL security coordination', () => {
  const db = dataSource;
  beforeAll(async () => { db.setOptions({ migrations: [] }); await db.initialize(); });
  afterAll(async () => { if (db.isInitialized) await db.destroy(); });

  it('shares a sliding window and blocking between independent instances', async () => {
    const a = new PostgresRateLimitStorage(db), b = new PostgresRateLimitStorage(db), key = randomUUID();
    const results = await Promise.all(Array.from({ length: 20 }, (_, index) => (index % 2 ? a : b).increment(key, 150, 5, 200, 'test')));
    expect(results.filter(result => !result.isBlocked)).toHaveLength(5);
    expect(results.filter(result => result.isBlocked)).toHaveLength(15);
    await new Promise(resolve => setTimeout(resolve, 220));
    expect((await b.increment(key, 150, 5, 200, 'test')).isBlocked).toBe(false);
  });

  it('does not reset a sliding window at a fixed boundary or extend a block on rejected hits', async () => {
    const a = new PostgresRateLimitStorage(db), key = randomUUID();
    for (let index = 0; index < 3; index++) expect((await a.increment(key, 10000, 3, 30000, 'test')).isBlocked).toBe(false);
    const rejected = await a.increment(key, 10000, 3, 30000, 'test');
    const repeated = await a.increment(key, 10000, 3, 30000, 'test');
    expect(rejected.isBlocked).toBe(true);
    expect(repeated.timeToBlockExpire).toBeLessThanOrEqual(rejected.timeToBlockExpire);
    expect(repeated.totalHits).toBe(4);
    expect((await a.increment(key, 10000, 3, 30000, 'another-purpose')).isBlocked).toBe(false);
  });

  it('allows only five verification attempts across instances and keeps the deadline', async () => {
    const config = new ConfigService({ JWT_SECRET: 'synthetic-verification-secret' });
    const a = new VerificationCodeService(config, db), b = new VerificationCodeService(config, db);
    const email = `${randomUUID()}@example.test`;
    const results = await Promise.allSettled(Array.from({ length: 12 }, (_, index) => (index % 2 ? a : b).checkAttempt(index % 2 ? email : ` ${email.toUpperCase()} `)));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(5);
    for (const result of results) if (result.status === 'rejected') expect(result.reason.getStatus()).toBe(429);
    // The SQL result is capped; repeated abusive requests never grow a history array.
    const rows = await db.query("SELECT attempts FROM security_attempts WHERE attempts=6");
    expect(rows.length).toBeGreaterThan(0);
  });
});
