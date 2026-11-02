import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import { DataSource, QueryRunner } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import dataSource from '../../database/data-source.js';
import { MailQueueService } from './mail-queue.service.js';

describe.skipIf(process.env.RUN_DB_TESTS !== '1' || process.env.RUN_REDIS_TESTS !== '1')('durable transactional mail outbox', () => {
  let runner: QueryRunner, service: MailQueueService;
  const sendMail = vi.fn().mockResolvedValue({});
  beforeAll(async () => {
    dataSource.setOptions({ migrations: [] });
    await dataSource.initialize();
    runner = dataSource.createQueryRunner();
    await runner.startTransaction();
    const db = { query: runner.query.bind(runner), transaction: runner.manager.transaction.bind(runner.manager) } as unknown as DataSource;
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail, close: vi.fn() } as never);
    const values: Record<string, string | number> = { MAIL_QUEUE_PREFIX: `test-${randomUUID()}`, REDIS_URL: 'redis://127.0.0.1:16379', SMTP_HOST: 'localhost', SMTP_PORT: 25, SMTP_USER: 'user', SMTP_PASS: 'pass', JWT_SECRET: 'outbox-test-secret' };
    service = new MailQueueService({ get: (key: string, fallback: unknown) => values[key] ?? fallback, getOrThrow: (key: string) => values[key] } as ConfigService, db);
  });
  afterAll(async () => {
    await service?.onModuleDestroy();
    if (runner) { await runner.rollbackTransaction(); await runner.release(); }
    if (dataSource.isInitialized) await dataSource.destroy();
    vi.restoreAllMocks();
  });
  it('persists encrypted mail before Redis and keeps it for retry after a queue outage', async () => {
    await service.enqueue({ to: 'outbox@example.test', subject: 'test', text: 'private-token', expiresAt: Date.now() + 30_000 });
    const rows: { id: string; payload: string }[] = await runner.query('SELECT id, payload FROM mail_outbox');
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).not.toContain('private-token');
    expect(sendMail).not.toHaveBeenCalled();
    const queue = (service as unknown as { queue: { add: () => Promise<unknown> } }).queue;
    const add = vi.spyOn(queue, 'add').mockRejectedValueOnce(new Error('Redis unavailable'));
    await service.flushPending();
    expect((await runner.query('SELECT id FROM mail_outbox'))).toHaveLength(1);
    add.mockRestore();
    await service.flushPending();
    expect((await runner.query('SELECT id FROM mail_outbox'))).toHaveLength(0);
    await vi.waitFor(() => expect(sendMail).toHaveBeenCalledOnce(), { timeout: 5000 });
  });
});
