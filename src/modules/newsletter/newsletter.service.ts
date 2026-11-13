import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity.js';
import { MailService } from '../mail/mail.service.js';
import { MailQueueService } from '../mail/mail-queue.service.js';

@Injectable()
export class NewsletterService {
  private readonly logger = new Logger(NewsletterService.name);
  constructor(@InjectRepository(User) private readonly users: Repository<User>, private readonly mail: MailService, private readonly config: ConfigService, private readonly queue: MailQueueService) {
    this.queue.registerNewsletterHandler(delivery => this.processDelivery(delivery));
  }
  private hash(token: string) { return createHash('sha256').update(token).digest('hex'); }
  private signature(id: string) { return createHmac('sha256', this.config.getOrThrow<string>('JWT_SECRET')).update(`newsletter-unsubscribe:${id}`).digest('hex'); }
  async subscribe(email: string) {
    const token = randomBytes(32).toString('hex');
    const rows: { id: string }[] = await this.users.query(`INSERT INTO newsletter_subscribers(email, confirmation_hash, confirmation_expires_at)
      VALUES ($1, $2, now() + interval '24 hours') ON CONFLICT(email) DO UPDATE
      SET confirmation_hash = EXCLUDED.confirmation_hash, confirmation_expires_at = EXCLUDED.confirmation_expires_at
      WHERE newsletter_subscribers.confirmed = false RETURNING id`, [email.trim().toLowerCase(), this.hash(token)]);
    if (rows.length) {
      try { await this.mail.sendNewsletterConfirmation(email.trim().toLowerCase(), token); }
      catch { this.logger.error('Falha ao enviar confirmação de inscrição na newsletter.'); }
    }
    return { message: 'Se a inscrição precisar de confirmação, as instruções serão enviadas por e-mail.' };
  }
  async confirm(token: string) {
    const rows: unknown[] = await this.users.query(`WITH updated AS (UPDATE newsletter_subscribers SET confirmed = true, confirmed_at = now(), confirmation_hash = NULL, confirmation_expires_at = NULL
      WHERE confirmation_hash = $1 AND confirmation_expires_at > now() AND confirmed = false RETURNING id) SELECT id FROM updated`, [this.hash(token)]);
    if (!rows.length) throw new BadRequestException('Token inválido ou expirado.');
    return { message: 'Inscrição confirmada.' };
  }
  async unsubscribe(token: string) {
    const [id, signature, extra] = token.split('.');
    if (!id || !/^[0-9a-f-]{36}$/i.test(id) || !signature || !/^[0-9a-f]{64}$/i.test(signature) || extra) throw new BadRequestException('Token inválido.');
    const expected = Buffer.from(this.signature(id), 'hex'), provided = Buffer.from(signature, 'hex');
    if (!timingSafeEqual(expected, provided)) throw new BadRequestException('Token inválido.');
    await this.users.manager.transaction(async manager => {
      await manager.query('UPDATE newsletter_subscribers SET confirmed = false, confirmation_hash = NULL, confirmation_expires_at = NULL, confirmed_at = NULL WHERE id = $1', [id]);
      await manager.query('DELETE FROM newsletter_deliveries WHERE subscriber_id = $1 AND sent_at IS NULL', [id]);
    });
    return { message: 'Inscrição cancelada.' };
  }
  // @Cron(CronExpression.EVERY_MINUTE) - Desabilitado para V1
  async deliverPending(): Promise<void> {
    try {
      const rows: { postId: string; subscriberId: string }[] = await this.users.query(`SELECT d.post_id AS "postId", d.subscriber_id AS "subscriberId"
        FROM newsletter_deliveries d JOIN newsletter_subscribers s ON s.id = d.subscriber_id JOIN posts p ON p.id = d.post_id
        WHERE d.sent_at IS NULL AND d.next_attempt_at <= now() AND s.confirmed = true AND p.published = true AND p.is_active = true AND p.deleted_at IS NULL
        ORDER BY d.next_attempt_at, d.post_id, d.subscriber_id LIMIT 50`);
      for (const delivery of rows) await this.queue.enqueueNewsletter(delivery);
    } catch (error) { this.logger.error('Falha ao processar newsletter', error instanceof Error ? error.stack : String(error)); }
  }

  async processDelivery(delivery: { postId: string; subscriberId: string }): Promise<void> {
    await this.users.manager.transaction(async manager => {
      const rows: { email: string; title: string; slug: string }[] = await manager.query(`SELECT s.email, p.title, p.slug
        FROM newsletter_deliveries d JOIN newsletter_subscribers s ON s.id = d.subscriber_id JOIN posts p ON p.id = d.post_id
        WHERE d.post_id = $1 AND d.subscriber_id = $2 AND d.sent_at IS NULL AND d.next_attempt_at <= now()
          AND s.confirmed = true AND p.published = true AND p.is_active = true AND p.deleted_at IS NULL
        FOR UPDATE OF d, s`, [delivery.postId, delivery.subscriberId]);
      if (!rows.length) return;
      const row = rows[0];
      try {
        await this.mail.sendNewsletterPost(row.email, row.title, row.slug, `${delivery.subscriberId}.${this.signature(delivery.subscriberId)}`);
        await manager.query('UPDATE newsletter_deliveries SET sent_at = now(), attempts = attempts + 1 WHERE post_id = $1 AND subscriber_id = $2', [delivery.postId, delivery.subscriberId]);
      } catch {
        await manager.query("UPDATE newsletter_deliveries SET attempts = attempts + 1, next_attempt_at = now() + interval '5 minutes' WHERE post_id = $1 AND subscriber_id = $2", [delivery.postId, delivery.subscriberId]);
        this.logger.error('Falha ao enviar uma newsletter; nova tentativa em cinco minutos.');
      }
    });
  }
}
