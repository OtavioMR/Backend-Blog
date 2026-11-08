import { createCipheriv, createHmac, randomBytes } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import type { QueuedMail } from './mail-queue.service.js';

// Uses the same encrypted, durable outbox as MailQueueService, inside the caller's transaction.
export async function transactionalMail(manager: EntityManager, secret: string, message: QueuedMail): Promise<void> {
  const { expiresAt, ...content } = message;
  const key = createHmac('sha256', secret).update('mail-queue-encryption-v1').digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(content), 'utf8'), cipher.final()]);
  const payload = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
  await manager.query('INSERT INTO mail_outbox(payload, expires_at) VALUES ($1, $2)', [payload, new Date(expiresAt)]);
}
