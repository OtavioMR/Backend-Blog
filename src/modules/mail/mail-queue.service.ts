import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { ConnectionOptions } from 'bullmq';

export type QueuedMail = { to: string; subject: string; text: string; html?: string; expiresAt: number };
type NewsletterJob = { postId: string; subscriberId: string };
type MailJob = { kind: 'mail'; payload: string; expiresAt: number } | { kind: 'newsletter'; delivery: NewsletterJob };

// Retry for longer than the longest token lifetime, without unbounded backoff.
export function mailRetryDelay(attemptsMade: number): number {
  return Math.min(5_000 * 2 ** Math.min(Math.max(attemptsMade - 1, 0), 6), 300_000);
}

@Injectable()
export class MailQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(MailQueueService.name);
  private readonly queue: Queue<MailJob>;
  private readonly worker: Worker<MailJob>;
  private newsletterHandler?: (delivery: NewsletterJob) => Promise<void>;
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly encryptionKey: Buffer;
  private flushing = false;

  constructor(config: ConfigService, @Optional() private readonly db?: DataSource) {
    const url = new URL(config.get<string>('REDIS_URL', 'redis://127.0.0.1:6379'));
    if (!['redis:', 'rediss:'].includes(url.protocol)) throw new Error('REDIS_URL deve usar redis:// ou rediss://');
    const connection: ConnectionOptions = {
      host: url.hostname, port: Number(url.port || 6379),
      ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
      ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
      ...(url.pathname.length > 1 ? { db: Number(url.pathname.slice(1)) } : {}),
      ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    };
    this.from = config.get<string>('SMTP_FROM', 'noreply@blog.com');
    this.encryptionKey = createHmac('sha256', config.getOrThrow<string>('JWT_SECRET')).update('mail-queue-encryption-v1').digest();
    this.transporter = nodemailer.createTransport({
      host: config.getOrThrow<string>('SMTP_HOST'),
      port: Number(config.getOrThrow<number>('SMTP_PORT')),
      secure: Number(config.getOrThrow<number>('SMTP_PORT')) === 465,
      auth: { user: config.getOrThrow<string>('SMTP_USER'), pass: config.getOrThrow<string>('SMTP_PASS') },
    });
    const prefix = config.get<string>('MAIL_QUEUE_PREFIX', 'bull');
    this.queue = new Queue<MailJob>('transactional-mail', { prefix, connection: { ...connection, maxRetriesPerRequest: 1, connectTimeout: 1000, commandTimeout: 1500 } });
    this.worker = new Worker<MailJob>('transactional-mail', async job => {
      if (job.data.kind === 'newsletter') {
        if (!this.newsletterHandler) throw new Error('Newsletter handler unavailable');
        return this.newsletterHandler(job.data.delivery);
      }
      if (Date.now() >= job.data.expiresAt) return;
      const encrypted = Buffer.from(job.data.payload, 'base64url');
      const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, encrypted.subarray(0, 12));
      decipher.setAuthTag(encrypted.subarray(12, 28));
      const message = JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(28)), decipher.final()]).toString('utf8')) as Omit<QueuedMail, 'expiresAt'>;
      await this.transporter.sendMail({ ...message, from: this.from });
    }, {
      prefix,
      connection: { ...connection, maxRetriesPerRequest: null },
      concurrency: 5,
      settings: { backoffStrategy: mailRetryDelay },
    });
    this.queue.on('error', () => this.logger.error('Falha na conexão da fila de e-mails.'));
    this.worker.on('error', () => this.logger.error('Falha no worker de e-mails.'));
    this.worker.on('failed', job => this.logger.error(`Falha no processamento de e-mail (tentativa ${job?.attemptsMade ?? 0}).`));
  }

  async enqueue(message: QueuedMail): Promise<void> {
    const { expiresAt, ...content } = message;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(content), 'utf8'), cipher.final()]);
    const payload = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
    if (this.db) {
      await this.db.query('INSERT INTO mail_outbox(payload, expires_at) VALUES ($1, $2)', [payload, new Date(expiresAt)]);
      return;
    }
    await this.enqueueEncrypted(payload, expiresAt);
  }

  private async enqueueEncrypted(payload: string, expiresAt: number, id?: string): Promise<void> {
    await this.queue.add('send', { kind: 'mail', payload, expiresAt }, {
      ...(id ? { jobId: `mail-${id}` } : {}),
      attempts: 300, backoff: { type: 'mailRetry' },
      removeOnComplete: id ? { age: 300, count: 10000 } : true, removeOnFail: true,
    });
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async flushPending(): Promise<void> {
    if (!this.db || this.flushing) return;
    this.flushing = true;
    try {
      await this.db.transaction(async manager => {
        await manager.query('DELETE FROM mail_outbox WHERE expires_at <= now()');
        const rows: { id: string; payload: string; expiresAt: Date }[] = await manager.query(
          'SELECT id, payload, expires_at AS "expiresAt" FROM mail_outbox ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT 100');
        for (const row of rows) {
          await this.enqueueEncrypted(row.payload, row.expiresAt.getTime(), row.id);
          await manager.query('DELETE FROM mail_outbox WHERE id = $1', [row.id]);
        }
      });
    } catch { this.logger.error('Fila indisponível; e-mails permanecem pendentes no banco.'); }
    finally { this.flushing = false; }
  }

  registerNewsletterHandler(handler: (delivery: NewsletterJob) => Promise<void>): void {
    this.newsletterHandler = handler;
  }

  async enqueueNewsletter(delivery: NewsletterJob): Promise<void> {
    await this.queue.add('newsletter', { kind: 'newsletter', delivery }, {
      jobId: `newsletter-${delivery.postId}-${delivery.subscriberId}`,
      attempts: 5, backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true, removeOnFail: true,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
    this.transporter.close();
  }
}
