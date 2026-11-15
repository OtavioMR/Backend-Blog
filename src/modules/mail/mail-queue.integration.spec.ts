import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { createServer, type Socket } from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import dataSource from '../../database/data-source.js';
import { transactionalMail } from './transactional-mail.js';
import { MailQueueService } from './mail-queue.service.js';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('PostgreSQL outbox with real local SMTP', () => {
  const queueName = `synthetic-${randomUUID()}`, messages: string[] = [], sockets = new Set<Socket>();
  let failures = 0, port: number;
  const smtp = createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    socket.write('220 synthetic.local ESMTP\r\n');
    let buffer = '', data = false, body: string[] = [];
    socket.on('data', chunk => {
      buffer += chunk.toString();
      while (buffer.includes('\r\n')) {
        const index = buffer.indexOf('\r\n'), line = buffer.slice(0, index); buffer = buffer.slice(index + 2);
        if (data) {
          if (line === '.') { messages.push(body.join('\r\n')); body = []; data = false; socket.write('250 accepted\r\n'); }
          else body.push(line);
        } else if (/^(EHLO|HELO)/i.test(line)) socket.write('250-synthetic.local\r\n250 AUTH PLAIN\r\n');
        else if (/^AUTH/i.test(line)) socket.write('235 authenticated\r\n');
        else if (/^MAIL/i.test(line) && failures > 0) { failures--; socket.write('451 temporary synthetic failure\r\n'); }
        else if (/^DATA/i.test(line)) { data = true; socket.write('354 send data\r\n'); }
        else if (/^QUIT/i.test(line)) socket.end('221 bye\r\n');
        else socket.write('250 ok\r\n');
      }
    });
  });
  const services: MailQueueService[] = [];
  function service() {
    const config = new ConfigService({ MAIL_QUEUE_NAME: queueName, SMTP_HOST: '127.0.0.1', SMTP_PORT: port,
      SMTP_USER: 'synthetic', SMTP_PASS: 'synthetic', SMTP_FROM: 'synthetic@example.test', JWT_SECRET: 'synthetic-mail-secret' });
    const worker = new MailQueueService(config, dataSource); services.push(worker); return worker;
  }
  const mail = (text: string, expiresAt = Date.now() + 60000) => ({ to: 'synthetic@example.test', subject: 'Synthetic queue test', text, expiresAt });
  async function rows() { return dataSource.query('SELECT * FROM mail_outbox WHERE queue_name=$1 ORDER BY created_at,id', [queueName]); }
  beforeAll(async () => {
    dataSource.setOptions({ migrations: [] }); await dataSource.initialize();
    smtp.listen(0, '127.0.0.1'); await once(smtp, 'listening');
    port = (smtp.address() as { port: number }).port;
  });
  afterAll(async () => {
    for (const worker of services) await worker.onModuleDestroy();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => smtp.close(() => resolve()));
    if (dataSource.isInitialized) {
      await dataSource.query('DELETE FROM mail_outbox WHERE queue_name=$1', [queueName]); await dataSource.destroy();
    }
  });
  it('persists encrypted content and retains delivered/expired state, using SMTP outside a transaction', async () => {
    const a = service();
    await a.enqueue(mail('private-token'));
    const [persisted] = await rows();
    expect(persisted.payload).not.toContain('private-token'); expect(persisted.payload).not.toContain('synthetic@example.test');
    await a.flushPending();
    expect(messages.at(-1)).toContain('private-token');
    expect((await rows())[0]).toMatchObject({ status: 'delivered', attempts: 1, lease_owner: null });
    await a.enqueue(mail('expired', Date.now() - 1)); await a.flushPending();
    expect((await rows()).at(-1).status).toBe('expired');
    expect(messages.some(message => message.includes('\r\nexpired'))).toBe(false);
  });
  it('backs off a real SMTP failure and retries successfully in a different instance', async () => {
    const a = service(), b = service(); failures = 1;
    await a.enqueue(mail('retry-body')); await a.flushPending();
    const pending = (await rows()).at(-1);
    expect(pending).toMatchObject({ status: 'pending', attempts: 1, last_error: 'DELIVERY_ERROR' });
    expect(pending.next_attempt_at.getTime()).toBeGreaterThan(Date.now() + 3500);
    await dataSource.query('UPDATE mail_outbox SET next_attempt_at=now() WHERE id=$1', [pending.id]);
    await b.flushPending(); expect((await rows()).at(-1)).toMatchObject({ status: 'delivered', attempts: 2 });
  });
  it('recovers interrupted reservations and fences the former worker', async () => {
    const a = service(), b = service();
    await a.enqueue(mail('restart-body'));
    const [old] = await a.reserve(); expect(old).toBeDefined();
    await a.onModuleDestroy();
    await dataSource.query("UPDATE mail_outbox SET lease_until=now()-interval '1 second' WHERE id=$1", [old.id]);
    const [next] = await b.reserve(); expect(Number(next.version)).toBeGreaterThan(Number(old.version));
    const before = messages.length;
    await a.processReserved(old); expect(messages).toHaveLength(before);
    await b.processReserved(next); expect(messages).toHaveLength(before + 1);
    expect((await rows()).at(-1)).toMatchObject({ status: 'delivered', attempts: 2 });
  });
  it('recovers a durable job after the processor process is terminated', async () => {
    const a = service(); await a.enqueue(mail('killed-process'));
    // Exercise the built application service in another OS process, then terminate it
    // after reservation and before SMTP. Build the backend before this integration suite.
    const script = `import 'dotenv/config'; import configured from './dist/database/data-source.js';
      import { ConfigService } from '@nestjs/config'; import { MailQueueService } from './dist/modules/mail/mail-queue.service.js';
      configured.setOptions({migrations:[]}); await configured.initialize();
      const worker=new MailQueueService(new ConfigService({MAIL_QUEUE_NAME:process.env.PROCESS_TEST_QUEUE,
        SMTP_HOST:'127.0.0.1',SMTP_PORT:25,SMTP_USER:'synthetic',SMTP_PASS:'synthetic',JWT_SECRET:'synthetic-mail-secret'}),configured);
      const jobs=await worker.reserve(); process.send(jobs); setInterval(()=>{},1000);`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
      cwd: process.cwd(), env: { ...process.env, PROCESS_TEST_QUEUE: queueName },
      windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    let errors = ''; child.stderr?.on('data', chunk => { errors += chunk.toString(); });
    try {
      const reservations = await Promise.race([
        once(child, 'message').then(([jobs]) => jobs as { id: string }[]),
        once(child, 'exit').then(() => { throw new Error(`Processor exited before reservation: ${errors.slice(-500)}`); }),
      ]);
      expect(reservations).toHaveLength(1);
      child.kill(); await once(child, 'exit');
      await dataSource.query("UPDATE mail_outbox SET lease_until=now()-interval '1 second' WHERE id=$1", [reservations[0].id]);
      await service().flushPending();
      expect((await rows()).at(-1)).toMatchObject({ status: 'delivered', attempts: 2 });
      expect(messages.at(-1)).toContain('killed-process');
    } finally { if (child.exitCode === null) child.kill(); }
  }, 15000);
  it('reserves at most five jobs across consumers and preserves permanent failures', async () => {
    const a = service(), b = service();
    for (let index = 0; index < 8; index++) await a.enqueue(mail(`capacity-${index}`));
    const reservations = await Promise.all([a.reserve(), b.reserve()]);
    expect(reservations.flat()).toHaveLength(5);
    expect(new Set(reservations.flat().map(job => job.id)).size).toBe(5);
    for (const job of reservations.flat()) await b.processReserved(job);
    await a.flushPending();
    await a.enqueue(mail('permanent-failure'));
    const last = (await rows()).at(-1);
    await dataSource.query('UPDATE mail_outbox SET max_attempts=1 WHERE id=$1', [last.id]);
    failures = 1; await a.flushPending();
    expect((await rows()).at(-1)).toMatchObject({ status: 'failed', attempts: 1 });
  });
  it('rolls back mail with its business transaction and preserves newsletter job deduplication', async () => {
    const runner = dataSource.createQueryRunner(); await runner.startTransaction();
    try {
      await transactionalMail(runner.manager, 'synthetic-mail-secret', mail('rolled-back'));
      await runner.rollbackTransaction();
    } finally { await runner.release(); }
    const a = service(), delivery = { postId: randomUUID(), subscriberId: randomUUID() };
    let delivered = 0; a.registerNewsletterHandler(async value => { expect(value).toEqual(delivery); delivered++; });
    await Promise.all([a.enqueueNewsletter(delivery), a.enqueueNewsletter(delivery)]); await a.flushPending();
    expect(delivered).toBe(1);
    const stats = await a.statistics(); expect(stats.some((row: { status: string }) => row.status === 'failed')).toBe(true);
  });
});
