import { expect, it, vi } from 'vitest';
import { createDecipheriv, createHmac } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { transactionalMail } from './transactional-mail.js';

it('encrypts recovery tokens in the transaction outbox using the worker format', async () => {
  const manager = { query: vi.fn() };
  const message = { to: 'synthetic@example.invalid', subject: 'Synthetic recovery', text: 'private-token-for-test', expiresAt: Date.now() + 60_000 };
  const jwtSecret = 'synthetic-test-key';
  await transactionalMail(manager as unknown as EntityManager, jwtSecret, message);
  const args = manager.query.mock.calls[0];
  const payload = args[1][0];
  expect(payload).not.toContain(message.text);
  const encrypted = Buffer.from(payload, 'base64url');
  const key = createHmac('sha256', jwtSecret).update('mail-queue-encryption-v1').digest();
  const decipher = createDecipheriv('aes-256-gcm', key, encrypted.subarray(0, 12));
  decipher.setAuthTag(encrypted.subarray(12, 28));
  const decrypted = JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(28)), decipher.final()]).toString('utf8'));
  expect(decrypted).toMatchObject({ to: message.to, text: message.text });
  expect(args[1][1]).toEqual(new Date(message.expiresAt));
});
