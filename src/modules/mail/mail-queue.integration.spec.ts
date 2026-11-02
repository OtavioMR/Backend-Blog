import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MailQueueService } from './mail-queue.service.js';

describe.skipIf(process.env.RUN_REDIS_TESTS !== '1')('fila de e-mails com Redis', () => {
  afterEach(() => vi.restoreAllMocks());

  it('processa e remove mensagens e não envia mensagens expiradas', async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail, close: vi.fn() } as never);
    const values: Record<string, string | number> = {
      MAIL_QUEUE_PREFIX: `test-${randomUUID()}`,
      REDIS_URL: 'redis://127.0.0.1:16379', SMTP_HOST: 'localhost', SMTP_PORT: 25,
      SMTP_USER: 'user', SMTP_PASS: 'pass', SMTP_FROM: 'blog@example.test', JWT_SECRET: 'test-secret',
    };
    const config = { get: (key: string, fallback: unknown) => values[key] ?? fallback, getOrThrow: (key: string) => values[key] } as ConfigService;
    const queue = new MailQueueService(config);
    try {
      await queue.enqueue({ to: 'test@example.test', subject: 'test', text: 'body', expiresAt: Date.now() + 30_000 });
      await vi.waitFor(() => expect(sendMail).toHaveBeenCalledOnce(), { timeout: 5000 });
      await queue.enqueue({ to: 'expired@example.test', subject: 'test', text: 'body', expiresAt: Date.now() - 1 });
      await vi.waitFor(async () => {
        const counts = await (queue as unknown as { queue: { getJobCounts: (...types: string[]) => Promise<Record<string, number>> } }).queue.getJobCounts('waiting', 'active', 'completed');
        expect(counts.waiting + counts.active + counts.completed).toBe(0);
      }, { timeout: 5000 });
      expect(sendMail).toHaveBeenCalledOnce();
    } finally { await queue.onModuleDestroy(); }
  }, 10_000);

  it('repete falhas SMTP e processa trabalhos de newsletter uma vez', async () => {
    const sendMail = vi.fn().mockRejectedValueOnce(new Error('SMTP indisponível')).mockResolvedValue({});
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail, close: vi.fn() } as never);
    const values: Record<string, string | number> = { MAIL_QUEUE_PREFIX: `test-${randomUUID()}`, REDIS_URL: 'redis://127.0.0.1:16379', SMTP_HOST: 'localhost', SMTP_PORT: 25, SMTP_USER: 'user', SMTP_PASS: 'pass', SMTP_FROM: 'blog@example.test', JWT_SECRET: 'test-secret' };
    const config = { get: (key: string, fallback: unknown) => values[key] ?? fallback, getOrThrow: (key: string) => values[key] } as ConfigService;
    const queue = new MailQueueService(config);
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const newsletter = vi.fn().mockImplementation(() => held);
    queue.registerNewsletterHandler(newsletter);
    try {
      await queue.enqueue({ to: 'retry@example.test', subject: 'test', text: 'body', expiresAt: Date.now() + 30_000 });
      const delivery = { postId: 'post', subscriberId: 'subscriber' };
      await Promise.all([queue.enqueueNewsletter(delivery), queue.enqueueNewsletter(delivery)]);
      release();
      await vi.waitFor(() => expect(sendMail).toHaveBeenCalledTimes(2), { timeout: 9000, interval: 100 });
      expect(newsletter).toHaveBeenCalledOnce();
      expect(newsletter).toHaveBeenCalledWith(delivery);
    } finally { release(); await queue.onModuleDestroy(); }
  }, 12000);

  it('mantém endereço e token cifrados nos dados persistidos no Redis', async () => {
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const sendMail = vi.fn().mockImplementation(() => held);
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail, close: vi.fn() } as never);
    const values: Record<string, string | number> = { MAIL_QUEUE_PREFIX: `test-${randomUUID()}`, REDIS_URL: 'redis://127.0.0.1:16379', SMTP_HOST: 'localhost', SMTP_PORT: 25, SMTP_USER: 'user', SMTP_PASS: 'pass', SMTP_FROM: 'blog@example.test', JWT_SECRET: 'test-secret' };
    const config = { get: (key: string, fallback: unknown) => values[key] ?? fallback, getOrThrow: (key: string) => values[key] } as ConfigService;
    const service = new MailQueueService(config);
    try {
      await service.enqueue({ to: 'private@example.test', subject: 'test', text: 'secret-token', expiresAt: Date.now() + 30_000 });
      await vi.waitFor(() => expect(sendMail).toHaveBeenCalledOnce(), { timeout: 5000 });
      const queue = (service as unknown as { queue: { getJobs: (states: string[]) => Promise<{ data: unknown }[]> } }).queue;
      const persisted = JSON.stringify((await queue.getJobs(['active']))[0].data);
      expect(persisted).not.toContain('private@example.test');
      expect(persisted).not.toContain('secret-token');
    } finally { release(); await service.onModuleDestroy(); }
  });
});
