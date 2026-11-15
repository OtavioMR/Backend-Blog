import { randomUUID } from 'node:crypto';
import { createServer, type Socket } from 'node:net';
import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { generateSync } from 'otplib';
import request from 'supertest';
import { MailQueueService } from '../src/modules/mail/mail-queue.service.js';

describe('Real HTTP account mail flows with PostgreSQL and captured SMTP', () => {
  const suffix = randomUUID(), queueName = `proof-mail-${suffix}`, messages: string[] = [], sockets = new Set<Socket>();
  const email = `${suffix}@example.test`, changedEmail = `changed-${email}`;
  let app: INestApplication, db: DataSource, queue: MailQueueService, id: string, token: string;
  let password = 'SyntheticMailPassword123!';
  const smtp = createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    socket.write('220 capture.local ESMTP\r\n'); let buffer = '', data = false, body = '';
    socket.on('data', chunk => {
      buffer += chunk.toString();
      while (buffer.includes('\r\n')) {
        const at = buffer.indexOf('\r\n'), line = buffer.slice(0, at); buffer = buffer.slice(at + 2);
        if (data) {
          if (line === '.') { messages.push(body.replace(/=\r\n/g, '').replace(/=([A-F0-9]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))); data = false; body = ''; socket.write('250 captured\r\n'); }
          else body += line + '\r\n';
        } else if (/^(EHLO|HELO)/i.test(line)) socket.write('250-capture.local\r\n250 AUTH PLAIN\r\n');
        else if (/^AUTH/i.test(line)) socket.write('235 authenticated\r\n');
        else if (/^DATA$/i.test(line)) { data = true; socket.write('354 send\r\n'); }
        else if (/^QUIT/i.test(line)) socket.end('221 bye\r\n');
        else socket.write('250 ok\r\n');
      }
    });
  });
  beforeAll(async () => {
    smtp.listen(0, '127.0.0.1'); await once(smtp, 'listening');
    Object.assign(process.env, { SMTP_HOST: '127.0.0.1', SMTP_PORT: String((smtp.address() as { port: number }).port),
      SMTP_USER: 'synthetic', SMTP_PASS: 'synthetic', SMTP_FROM: 'synthetic@example.test',
      MAIL_QUEUE_NAME: queueName, RATE_LIMIT_NAMESPACE: queueName, TOTP_ENCRYPTION_KEY: 'd'.repeat(64) });
    const { AppModule } = await import('../src/app.module.js');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    for (const job of module.get(SchedulerRegistry).getCronJobs().values()) await job.stop();
    db = module.get(DataSource); queue = module.get(MailQueueService);
  });
  afterAll(async () => {
    if (db?.isInitialized) {
      await db.query('DELETE FROM mail_outbox WHERE queue_name=$1', [queueName]);
      if (id) {
        await db.query('DELETE FROM audit_logs WHERE actor_id=$1 OR target_id=$1', [id]);
        await db.query('DELETE FROM users WHERE id=$1', [id]);
      }
    }
    await app?.close(); for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => smtp.close(() => resolve()));
  });
  it('registers, delivers a code through SMTP, confirms once and authenticates', async () => {
    const server = app.getHttpServer();
    const created = await request(server).post('/api/v1/users').send({ name: 'Synthetic mail flow', email, password,
      birthDate: '1990-01-01', acceptedTerms: true, termsVersion: '1.0.0' }).expect(201); id = created.body.id;
    await queue.flushPending(); expect(messages).toHaveLength(1);
    const code = /:\s*(\d{6})\b/.exec(messages[0])?.[1]; expect(code).toMatch(/^\d{6}$/);
    await request(server).post('/api/v1/users/confirm-email').send({ email, token: code }).expect(200);
    await request(server).post('/api/v1/users/confirm-email').send({ email, token: code }).expect(400);
    token = (await request(server).post('/api/v1/auth/login').send({ email, password }).expect(200)).body.access_token;
    await request(server).get(`/api/v1/users/${id}`).set('Authorization', `Bearer ${token}`).expect(200);
    await request(server).get('/api/v1/admin/mail-queue').set('Authorization', `Bearer ${token}`).expect(403);
  });
  it('delivers password recovery and revokes the old session after reset', async () => {
    const server = app.getHttpServer();
    await request(server).post('/api/v1/auth/forgot-password').send({ email }).expect(200); await queue.flushPending();
    const resetToken = /reset-password\?token=([a-f0-9]{64})/.exec(messages.at(-1)!)?.[1]; expect(resetToken).toHaveLength(64);
    password = 'SyntheticMailNewPassword123!';
    await request(server).post('/api/v1/auth/reset-password').send({ token: resetToken, newPassword: password }).expect(200);
    await request(server).get(`/api/v1/users/${id}`).set('Authorization', `Bearer ${token}`).expect(401);
    token = (await request(server).post('/api/v1/auth/login').send({ email, password }).expect(200)).body.access_token;
  });
  it('delivers and confirms an address change without exposing the stored payload', async () => {
    const server = app.getHttpServer();
    await request(server).patch(`/api/v1/users/${id}`).set('Authorization', `Bearer ${token}`)
      .send({ email: changedEmail, currentPassword: password }).expect(200);
    await queue.flushPending();
    const changeToken = /\b([a-f0-9]{64})\b/.exec(messages.at(-1)!)?.[1]; expect(changeToken).toHaveLength(64);
    await request(server).post('/api/v1/users/confirm-email-change').send({ token: changeToken }).expect(200);
    token = (await request(server).post('/api/v1/auth/login').send({ email: changedEmail, password }).expect(200)).body.access_token;
    const rows = await db.query('SELECT status,payload FROM mail_outbox WHERE queue_name=$1', [queueName]);
    expect(rows.every((row: { status: string }) => row.status === 'delivered')).toBe(true);
    expect(JSON.stringify(rows)).not.toContain(changedEmail);
  });
  it('delivers the 2FA recovery link and security notices from the transactional outbox', async () => {
    const server = app.getHttpServer();
    await db.query('UPDATE users SET recovery_email=$2,recovery_email_verified_at=now(),recovery_email_available_at=now() WHERE id=$1', [id, `recovery-${email}`]);
    const setup = await request(server).post('/api/v1/auth/totp/setup').set('Authorization', `Bearer ${token}`).send({ password }).expect(200);
    const code = generateSync({ secret: setup.body.secret, epoch: (Math.floor(Date.now() / 30000) - 1) * 30 });
    await request(server).post('/api/v1/auth/totp/enable').set('Authorization', `Bearer ${token}`).send({ code }).expect(200);
    const before = messages.length;
    const recovery = await request(server).post('/api/v1/auth/totp-recovery/request').send({ email: changedEmail, password }).expect(200);
    expect(recovery.body.status).toBe('sent'); await queue.flushPending();
    expect(messages.length).toBeGreaterThanOrEqual(before + 2);
    expect(messages.slice(before).some(message => /#token=[A-Za-z0-9_-]{43}/.test(message))).toBe(true);
    expect((await queue.statistics()).some((row: { status: string }) => row.status === 'delivered')).toBe(true);
  });
});
