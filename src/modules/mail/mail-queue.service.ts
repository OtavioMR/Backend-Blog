import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export type QueuedMail = { to: string; subject: string; text: string; html?: string; expiresAt: number };
type NewsletterJob = { postId: string; subscriberId: string };
export type ReservedMail = { id: string; kind: 'mail' | 'newsletter'; payload: string; attempts: number; max_attempts: number; version: string; lease_owner: string };

export function mailRetryDelay(attemptsMade: number): number {
  return Math.min(5_000 * 2 ** Math.min(Math.max(attemptsMade - 1, 0), 6), 300_000);
}

@Injectable()
export class MailQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(MailQueueService.name);
  private newsletterHandler?: (delivery: NewsletterJob) => Promise<void>;
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly encryptionKey: Buffer;
  private readonly queueName: string;
  private processing?: Promise<void>;
  private stopping = false;

  constructor(config: ConfigService, private readonly db: DataSource) {
    this.from = config.get<string>('SMTP_FROM', 'noreply@blog.com');
    this.queueName = config.get<string>('MAIL_QUEUE_NAME', 'default');
    this.encryptionKey = createHmac('sha256', config.getOrThrow<string>('JWT_SECRET')).update('mail-queue-encryption-v1').digest();
    this.transporter = nodemailer.createTransport({
      host: config.getOrThrow<string>('SMTP_HOST'), port: Number(config.getOrThrow<number>('SMTP_PORT')),
      secure: Number(config.getOrThrow<number>('SMTP_PORT')) === 465,
      auth: { user: config.getOrThrow<string>('SMTP_USER'), pass: config.getOrThrow<string>('SMTP_PASS') },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 30000,
    });
  }

  private encrypt(content: unknown): string {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(content), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
  }
  private decrypt(payload: string): unknown {
    const encrypted = Buffer.from(payload, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, encrypted.subarray(0, 12));
    decipher.setAuthTag(encrypted.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(28)), decipher.final()]).toString('utf8'));
  }

  async enqueue(message: QueuedMail): Promise<void> {
    const { expiresAt, ...content } = message;
    await this.db.query('INSERT INTO mail_outbox(payload, expires_at, queue_name) VALUES ($1, $2, $3)',
      [this.encrypt(content), new Date(expiresAt), this.queueName]);
  }

  // Reservation commits before SMTP. The advisory transaction lock only coordinates
  // the capacity check: at most five unexpired reservations per queue across processes.
  async reserve(): Promise<ReservedMail[]> {
    return this.db.transaction(async manager => {
      await manager.query("SET LOCAL lock_timeout = '2000ms'");
      await manager.query("SET LOCAL statement_timeout = '5000ms'");
      await manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`mail-capacity:${this.queueName}`]);
      await manager.query(`UPDATE mail_outbox SET status=CASE WHEN expires_at <= clock_timestamp() THEN 'expired' ELSE 'failed' END,
        completed_at=clock_timestamp(),lease_owner=NULL,lease_until=NULL,version=version+1
        WHERE queue_name=$1 AND status IN ('pending','processing') AND (lease_until IS NULL OR lease_until <= clock_timestamp())
        AND (expires_at <= clock_timestamp() OR attempts >= max_attempts)`, [this.queueName]);
      const [capacity]: { active: string }[] = await manager.query(
        "SELECT count(*) AS active FROM mail_outbox WHERE queue_name=$1 AND status='processing' AND lease_until > clock_timestamp()", [this.queueName]);
      const available = Math.max(0, 5 - Number(capacity.active));
      if (!available) return [];
      return manager.query(`WITH candidates AS (
        SELECT id FROM mail_outbox WHERE queue_name=$1 AND expires_at > clock_timestamp() AND attempts < max_attempts
        AND (kind='mail' OR $4::boolean) AND ((status='pending' AND next_attempt_at <= clock_timestamp())
        OR (status='processing' AND lease_until <= clock_timestamp()))
        ORDER BY next_attempt_at,created_at,id LIMIT $2 FOR UPDATE SKIP LOCKED), reserved AS (
        UPDATE mail_outbox m SET status='processing',attempts=attempts+1,lease_owner=$3,
        lease_until=clock_timestamp() + interval '120 seconds',version=version+1
        FROM candidates c WHERE m.id=c.id RETURNING m.*) SELECT * FROM reserved`, [this.queueName, available, randomUUID(), !!this.newsletterHandler]);
    });
  }

  async processReserved(job: ReservedMail): Promise<void> {
    const owned = await this.db.query(`SELECT id FROM mail_outbox WHERE id=$1 AND queue_name=$2 AND version=$3
      AND lease_owner=$4 AND lease_until > clock_timestamp() AND status='processing' AND expires_at > clock_timestamp()`,
    [job.id, this.queueName, job.version, job.lease_owner]);
    if (!owned.length) return;
    let invalidPayload = false;
    try {
      let payload: unknown;
      try { payload = this.decrypt(job.payload); } catch { invalidPayload = true; throw new Error('Invalid payload'); }
      if (job.kind === 'newsletter') {
        if (!this.newsletterHandler) throw new Error('Newsletter handler unavailable');
        await this.newsletterHandler(payload as NewsletterJob);
      } else {
        await this.transporter.sendMail({ ...(payload as Omit<QueuedMail, 'expiresAt'>), from: this.from,
          messageId: `<${job.id}@griforio.invalid>` });
      }
      const delivered: { id: string }[] = await this.db.query(`WITH changed AS (UPDATE mail_outbox SET status='delivered',completed_at=clock_timestamp(),
        lease_owner=NULL,lease_until=NULL,last_error=NULL WHERE id=$1 AND version=$2 AND lease_owner=$3
        AND status='processing' AND lease_until > clock_timestamp() RETURNING id) SELECT id FROM changed`, [job.id, job.version, job.lease_owner]);
      if (delivered.length) this.logger.log(`mail_job_delivered id=${job.id} attempts=${job.attempts}`);
      else this.logger.warn(`mail_job_lease_lost id=${job.id}`);
    } catch {
      const result: { status: string }[] = await this.db.query(`WITH changed AS (UPDATE mail_outbox SET
        status=CASE WHEN expires_at <= clock_timestamp() THEN 'expired' WHEN attempts >= max_attempts OR $5 THEN 'failed' ELSE 'pending' END,
        next_attempt_at=clock_timestamp() + $4 * interval '1 millisecond',
        completed_at=CASE WHEN expires_at <= clock_timestamp() OR attempts >= max_attempts OR $5 THEN clock_timestamp() ELSE NULL END,
        last_error=$6,lease_owner=NULL,lease_until=NULL
        WHERE id=$1 AND version=$2 AND lease_owner=$3 AND status='processing' AND lease_until > clock_timestamp() RETURNING status) SELECT status FROM changed`,
      [job.id, job.version, job.lease_owner, mailRetryDelay(job.attempts), invalidPayload, invalidPayload ? 'INVALID_PAYLOAD' : 'DELIVERY_ERROR']);
      this.logger.warn(`mail_job_attempt id=${job.id} attempts=${job.attempts} status=${result[0]?.status ?? 'lease_lost'}`);
    }
  }

  @Cron(CronExpression.EVERY_SECOND)
  async flushPending(): Promise<void> {
    if (this.stopping) return;
    if (this.processing) return this.processing;
    this.processing = (async () => {
      try { const jobs = await this.reserve(); await Promise.all(jobs.map(job => this.processReserved(job))); }
      catch { this.logger.error('mail_queue_unavailable: jobs remain durable in PostgreSQL'); }
    })();
    try { await this.processing; } finally { this.processing = undefined; }
  }

  registerNewsletterHandler(handler: (delivery: NewsletterJob) => Promise<void>): void { this.newsletterHandler = handler; }
  async enqueueNewsletter(delivery: NewsletterJob): Promise<void> {
    await this.db.query(`INSERT INTO mail_outbox(kind,payload,expires_at,max_attempts,deduplication_key,queue_name)
      VALUES('newsletter',$1,clock_timestamp() + interval '7 days',5,$2,$3)
      ON CONFLICT(queue_name,deduplication_key) DO UPDATE SET status='pending',payload=EXCLUDED.payload,
        expires_at=EXCLUDED.expires_at,next_attempt_at=clock_timestamp(),completed_at=NULL,attempts=0,version=mail_outbox.version+1
      WHERE mail_outbox.status IN ('delivered','expired','failed')`,
    [this.encrypt(delivery), `newsletter-${delivery.postId}-${delivery.subscriberId}`, this.queueName]);
  }

  async statistics() {
    return this.db.query(`SELECT status,count(*)::int AS total,
      count(*) FILTER(WHERE status='processing' AND lease_until <= clock_timestamp())::int AS stalled,
      coalesce(max(extract(epoch FROM (clock_timestamp()-created_at))) FILTER(WHERE status IN ('pending','processing')),0)::int AS oldest_age_seconds
      FROM mail_outbox WHERE queue_name=$1 GROUP BY status ORDER BY status`, [this.queueName]);
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async scrubCompletedPayloads(): Promise<void> {
    await this.db.query(`UPDATE mail_outbox SET payload='' WHERE queue_name=$1 AND status IN ('delivered','expired','failed')
      AND completed_at < clock_timestamp() - interval '7 days' AND payload <> ''`, [this.queueName]);
  }
  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    await this.processing;
    this.transporter.close();
  }
}
