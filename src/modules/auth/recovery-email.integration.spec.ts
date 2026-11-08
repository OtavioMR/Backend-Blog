import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { generateSync } from 'otplib';
import { instanceToPlain } from 'class-transformer';
import dataSource from '../../database/data-source.js';
import { TotpService } from './totp.service.js';
import { TotpRecoveryService } from './totp-recovery.service.js';
import { RecoveryEmailService } from './recovery-email.service.js';
import { transactionalMail } from '../mail/transactional-mail.js';
import { User } from '../users/entities/user.entity.js';
import type { AuditService } from '../audit/audit.service.js';

vi.mock('../mail/transactional-mail.js', () => ({ transactionalMail: vi.fn(async () => {}) }));

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('Recovery email PostgreSQL', () => {
  const ids: string[] = [], password = 'SyntheticPassword123!';
  const config = new ConfigService({ TOTP_ENCRYPTION_KEY: 'd'.repeat(64), JWT_SECRET: 'synthetic-secret'.repeat(3), FRONTEND_URL: 'https://example.invalid' });
  let totp: TotpService, emailService: RecoveryEmailService, recovery: TotpRecoveryService, hash: string;
  beforeAll(async () => {
    dataSource.setOptions({ migrations: [] }); await dataSource.initialize();
    hash = await bcrypt.hash(password, 4);
    totp = new TotpService(dataSource, config, { record: vi.fn() } as unknown as AuditService);
    emailService = new RecoveryEmailService(dataSource, config, totp);
    recovery = new TotpRecoveryService(dataSource, config, totp);
  });
  afterAll(async () => {
    if (!dataSource.isInitialized) return;
    await dataSource.query('DELETE FROM audit_logs WHERE target_id = ANY($1::uuid[]) OR actor_id = ANY($1::uuid[])', [ids]);
    await dataSource.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
    await dataSource.destroy();
  });
  async function account(role = 'READER') {
    const id = randomUUID(); ids.push(id);
    await dataSource.query("INSERT INTO users(id,name,email,password_hash,role,email_verified) VALUES ($1,'Synthetic email recovery',$2,$3,$4,true)", [id, `${id}@example.invalid`, hash, role]);
    return id;
  }
  function tokenFor(to: string, key = 'token') {
    const calls = [...vi.mocked(transactionalMail).mock.calls].reverse();
    const message = calls.find(call => call[2].to === to && call[2].text.includes(`#${key}=`))![2];
    return new RegExp(`#${key}=([\\w-]{43})`).exec(message.text)![1];
  }
  async function enroll(id: string) {
    const address = `recovery-${id}@example.invalid`;
    await emailService.request(id, 0, address, password);
    await emailService.confirm(tokenFor(address));
    return address;
  }
  it('requires verified separate email for setup, stores hashes, confirms once under concurrency and keeps private data out of profiles', async () => {
    const id = await account(), address = `recovery-${id}@example.invalid`;
    await expect(totp.setup(id, password)).rejects.toThrow();
    await expect(emailService.request(id, 0, `${id}@example.invalid`, password)).rejects.toThrow();
    await emailService.request(id, 0, address, password);
    await expect(totp.setup(id, password)).rejects.toThrow();
    const token = tokenFor(address);
    const [row] = await dataSource.query('SELECT recovery_email_token_hash, recovery_email FROM users WHERE id=$1', [id]);
    expect(row.recovery_email_token_hash).not.toContain(token); expect(row.recovery_email).toBeNull();
    const notice = [...vi.mocked(transactionalMail).mock.calls].reverse().find(call => call[2].to === `${id}@example.invalid`)![2];
    expect(notice.text).not.toContain('#token=');
    const results = await Promise.allSettled([emailService.confirm(token), emailService.confirm(token)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const status = await emailService.status(id);
    expect(status).toMatchObject({ email: address, verified: true, pendingEmail: null });
    expect(status.availableAt!.getTime()).toBeLessThanOrEqual(Date.now());
    const setup = await totp.setup(id, password);
    expect(setup.secret).toBeTruthy();
    const user = await dataSource.getRepository(User).createQueryBuilder('user').addSelect(['user.recoveryEmail', 'user.recoveryEmailVerifiedAt']).where('user.id = :id', { id }).getOneOrFail();
    expect(instanceToPlain(user)).not.toHaveProperty('recoveryEmail');
    expect(instanceToPlain(user)).not.toHaveProperty('recoveryEmailVerifiedAt');
  });
  it('requires fresh TOTP and password to change address; cancellation preserves old confirmed address', async () => {
    const id = await account(), original = await enroll(id);
    const prepared = await totp.prepareRecovery(`${id}@example.invalid`);
    await dataSource.query('UPDATE users SET totp_enabled=true, totp_secret=$1 WHERE id=$2', [prepared.encryptedSecret, id]);
    const next = `next-${id}@example.invalid`;
    await expect(emailService.request(id, 0, next, password)).rejects.toThrow();
    await expect(emailService.request(id, 1, next, password, '123456')).rejects.toThrow();
    await emailService.request(id, 0, next, password, generateSync({ secret: prepared.secret }));
    expect(await emailService.status(id)).toMatchObject({ email: original, pendingEmail: next });
    const cancel = tokenFor(original, 'cancel'), confirmation = tokenFor(next);
    await emailService.confirm(cancel, true);
    await expect(emailService.confirm(confirmation)).rejects.toThrow();
    expect(await emailService.status(id)).toMatchObject({ email: original, pendingEmail: null });
  });
  it('removes only after confirmation at the recovery address and invalidates pending recovery', async () => {
    const id = await account(), address = await enroll(id);
    const prepared = await totp.prepareRecovery(`${id}@example.invalid`);
    await dataSource.query('UPDATE users SET totp_enabled=true,totp_secret=$1 WHERE id=$2', [prepared.encryptedSecret, id]);
    await recovery.request(`${id}@example.invalid`, password);
    const grant = tokenFor(address);
    await expect(emailService.request(id, 0, null, password)).rejects.toThrow();
    await emailService.request(id, 0, null, password, generateSync({ secret: prepared.secret }));
    const token = tokenFor(address, 'remove');
    expect(await emailService.status(id)).toMatchObject({ email: address, verified: true });
    await expect(emailService.confirm(token)).rejects.toThrow();
    expect(await emailService.confirm(token, false, true)).toEqual({ removed: true });
    await expect(emailService.confirm(token, false, true)).rejects.toThrow();
    await expect(recovery.recover(grant, password)).rejects.toThrow();
    expect(await emailService.status(id)).toMatchObject({ email: null, verified: false });
    const [row] = await dataSource.query('SELECT totp_enabled FROM users WHERE id=$1', [id]);
    expect(row.totp_enabled).toBe(true);
  });
  it('invalidates expired confirmations and confirmations bound to changed credentials', async () => {
    const id = await account(), address = `recovery-${id}@example.invalid`;
    await emailService.request(id, 0, address, password);
    const token = tokenFor(address);
    await dataSource.query("UPDATE users SET recovery_email_expires_at = now() - interval '1 second' WHERE id=$1", [id]);
    await expect(emailService.confirm(token)).rejects.toThrow();
    await emailService.request(id, 0, address, password);
    const second = tokenFor(address);
    await dataSource.query('UPDATE users SET auth_version=auth_version+1 WHERE id=$1', [id]);
    await expect(emailService.confirm(second)).rejects.toThrow();
  });
  it('uses confirmed email immediately, returns uniform responses and keeps SUPER_ADMIN server-only', async () => {
    const id = await account(), address = await enroll(id);
    await dataSource.query("UPDATE users SET totp_enabled=true, recovery_email_available_at=now()+interval '24 hours' WHERE id=$1", [id]);
    const first = await recovery.request(`${id}@example.invalid`, password);
    const token = tokenFor(address);
    const [grant] = await dataSource.query('SELECT available_at FROM totp_recovery_grants WHERE user_id=$1 AND consumed_at IS NULL', [id]);
    expect(grant.available_at.getTime()).toBeLessThanOrEqual(Date.now());
    const messages = vi.mocked(transactionalMail).mock.calls.filter(call => call[2].to === `${id}@example.invalid`);
    expect(messages.every(call => !call[2].text.includes('/recuperar-autenticador#token='))).toBe(true);
    expect(await recovery.request('missing@example.invalid', password)).toEqual(first);
    expect(await recovery.request(`${id}@example.invalid`, 'wrong-password')).toEqual(first);
    const owner = await account('SUPER_ADMIN'); await enroll(owner);
    await dataSource.query('UPDATE users SET totp_enabled=true WHERE id=$1', [owner]);
    expect(await recovery.request(`${owner}@example.invalid`, password)).toEqual(first);
    expect((await dataSource.query('SELECT count(*)::int AS count FROM totp_recovery_grants WHERE user_id=$1', [owner]))[0].count).toBe(0);
    const before = (await dataSource.query('SELECT count(*)::int AS count FROM totp_recovery_grants WHERE user_id=$1', [id]))[0].count;
    await recovery.request(`${id}@example.invalid`, password);
    expect((await dataSource.query('SELECT count(*)::int AS count FROM totp_recovery_grants WHERE user_id=$1', [id]))[0].count).toBe(before);
    // A previously issued link must no longer inherit the old email waiting period.
    await dataSource.query("UPDATE totp_recovery_grants SET available_at=now()+interval '23 hours' WHERE user_id=$1", [id]);
    expect((await recovery.recover(token, password)).secret).toBeTruthy();
  });
  it('persists failed reauthentication attempts and locks further email changes', async () => {
    const id = await account(), address = `recovery-${id}@example.invalid`;
    for (let index = 0; index < 5; index++) await expect(emailService.request(id, 0, address, 'wrong-password')).rejects.toThrow();
    const [row] = await dataSource.query('SELECT failed_login_attempts, login_locked_until FROM users WHERE id=$1', [id]);
    expect(row.failed_login_attempts).toBe(5); expect(row.login_locked_until.getTime()).toBeGreaterThan(Date.now());
    await expect(emailService.request(id, 0, address, password)).rejects.toThrow();
  });
  it('replacing the confirmed recovery address invalidates previously issued recovery grants', async () => {
    const id = await account(), previous = await enroll(id), next = `next-${id}@example.invalid`;
    const prepared = await totp.prepareRecovery(`${id}@example.invalid`);
    await dataSource.query('UPDATE users SET totp_enabled=true,totp_secret=$1 WHERE id=$2', [prepared.encryptedSecret, id]);
    await recovery.request(`${id}@example.invalid`, password);
    const oldGrant = tokenFor(previous);
    await emailService.request(id, 0, next, password, generateSync({ secret: prepared.secret }));
    await emailService.confirm(tokenFor(next));
    await expect(recovery.recover(oldGrant, password)).rejects.toThrow();
    expect(await emailService.status(id)).toMatchObject({ email: next, verified: true });
  });
});
