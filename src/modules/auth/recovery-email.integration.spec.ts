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
import { ModerationService } from '../moderation/moderation.service.js';
import { UserRole } from '../users/enums/user.enum.js';

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
  it('requires verified separate email for administrative setup, stores hashes, confirms once under concurrency and keeps private data out of profiles', async () => {
    const id = await account('ADMIN'), address = `recovery-${id}@example.invalid`;
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
  it('supports neither mechanism, secondary only, TOTP only and independent disable for ordinary users', async () => {
    const id = await account();
    expect(await emailService.status(id)).toMatchObject({ email: null, verified: false });
    expect((await dataSource.getRepository(User).findOneByOrFail({ id })).totpEnabled).toBe(false);
    const prepared = await totp.setup(id, password);
    const enabled = await totp.enable(id, generateSync({ secret: prepared.secret }));
    expect(enabled.recoveryCodes).toHaveLength(8);
    expect(await emailService.status(id)).toMatchObject({ email: null, verified: false });
    await totp.disable(id, password, enabled.recoveryCodes[0]);
    const address = `recovery-${id}@example.invalid`;
    await emailService.request(id, 2, address, password); await emailService.confirm(tokenFor(address));
    expect((await dataSource.getRepository(User).findOneByOrFail({ id })).totpEnabled).toBe(false);
    const next = await totp.setup(id, password);
    const both = await totp.enable(id, generateSync({ secret: next.secret }));
    await totp.disable(id, password, both.recoveryCodes[0]);
    expect(await emailService.status(id)).toMatchObject({ email: address, verified: true });
  });
  it.each(['ADMIN', 'SUPER_ADMIN'])('forbids removing the secondary for %s, including a pre-existing removal token', async role => {
    const id = await account(), address = await enroll(id);
    await emailService.request(id, 0, null, password);
    const token = tokenFor(`${id}@example.invalid`, 'remove');
    // Simulate a role change while a request is pending, without relying on auth_version invalidation.
    await dataSource.query('UPDATE users SET role=$1 WHERE id=$2', [role, id]);
    await expect(emailService.request(id, 0, null, password)).rejects.toThrow('administrativas');
    await expect(emailService.confirm(token, false, true)).rejects.toThrow('administrativas');
    expect(await emailService.status(id)).toMatchObject({ email: address, verified: true });
  });
  it.each(['ADMIN', 'SUPER_ADMIN'])('replaces a verified secondary for %s while preserving the original until confirmation', async role => {
    const id = await account(role), original = await enroll(id), next = `next-${id}@example.invalid`;
    const prepared = await totp.prepareRecovery(`${id}@example.invalid`);
    await dataSource.query('UPDATE users SET totp_enabled=true,totp_secret=$1 WHERE id=$2', [prepared.encryptedSecret, id]);
    await expect(totp.disable(id, password, generateSync({ secret: prepared.secret }))).rejects.toThrow('administrativos');
    await emailService.request(id, 0, next, password, generateSync({ secret: prepared.secret }));
    expect(await emailService.status(id)).toMatchObject({ email: original, pendingEmail: next, verified: true });
    await emailService.confirm(tokenFor(next));
    expect(await emailService.status(id)).toMatchObject({ email: next, pendingEmail: null, verified: true });
    expect((await dataSource.getRepository(User).findOneByOrFail({ id })).totpEnabled).toBe(true);
  });
  it('requires both verified emails and TOTP before promotion, and serializes promotion against removal', async () => {
    const actor = await account('SUPER_ADMIN'), id = await account();
    await enroll(actor);
    await dataSource.query('UPDATE users SET totp_enabled=true WHERE id=ANY($1::uuid[])', [[actor, id]]);
    const moderation = new ModerationService(dataSource, { record: vi.fn() } as unknown as AuditService);
    await expect(moderation.changeRole(actor, id, UserRole.ADMIN, 'Synthetic security check', 0)).rejects.toThrow('secundário');
    await dataSource.query('UPDATE users SET totp_enabled=false WHERE id=$1', [id]);
    const address = await enroll(id);
    await dataSource.query('UPDATE users SET totp_enabled=false WHERE id=$1', [id]);
    await expect(moderation.changeRole(actor, id, UserRole.ADMIN, 'Synthetic security check', 0)).rejects.toThrow('dois fatores');
    await emailService.request(id, 0, null, password);
    const token = tokenFor(`${id}@example.invalid`, 'remove');
    await dataSource.query('UPDATE users SET totp_enabled=true WHERE id=$1', [id]);
    await Promise.allSettled([
      moderation.changeRole(actor, id, UserRole.ADMIN, 'Synthetic security check', 0),
      emailService.confirm(token, false, true),
    ]);
    const [row] = await dataSource.query('SELECT role,recovery_email,recovery_email_verified_at FROM users WHERE id=$1', [id]);
    if (row.role === 'ADMIN') expect(row).toMatchObject({ recovery_email: address, recovery_email_verified_at: expect.any(Date) });
    else expect(row.recovery_email).toBeNull();
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
  it('removes only after confirmation at the primary address, invalidates pending recovery and never sends a new recovery link after removal', async () => {
    const id = await account(), address = await enroll(id);
    const prepared = await totp.prepareRecovery(`${id}@example.invalid`);
    await dataSource.query('UPDATE users SET totp_enabled=true,totp_secret=$1 WHERE id=$2', [prepared.encryptedSecret, id]);
    await recovery.request(`${id}@example.invalid`, password);
    const grant = tokenFor(address);
    await expect(emailService.request(id, 0, null, password)).rejects.toThrow();
    await emailService.request(id, 0, null, password, generateSync({ secret: prepared.secret }));
    const token = tokenFor(`${id}@example.invalid`, 'remove');
    expect(await emailService.status(id)).toMatchObject({ email: address, verified: true, pending: { action: 'remove', email: `${id}@example.invalid`, confirmationDestination: 'primary' } });
    expect(vi.mocked(transactionalMail).mock.calls.filter(call => call[2].to === address).every(call => !call[2].text.includes('#remove='))).toBe(true);
    await expect(emailService.confirm(token)).rejects.toThrow();
    expect(await emailService.confirm(token, false, true)).toEqual({ removed: true });
    await expect(emailService.confirm(token, false, true)).rejects.toThrow();
    await expect(recovery.recover(grant, password)).rejects.toThrow();
    expect(await emailService.status(id)).toMatchObject({ email: null, verified: false, pending: null });
    const before = vi.mocked(transactionalMail).mock.calls.length;
    expect(await recovery.request(`${id}@example.invalid`, password)).toMatchObject({ status: 'assisted_required' });
    expect(vi.mocked(transactionalMail).mock.calls).toHaveLength(before);
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
  it('distinguishes pending registration, replacement and removal, and cancels links from the authenticated account', async () => {
    const id = await account(), address = `recovery-${id}@example.invalid`, next = `next-${id}@example.invalid`;
    await emailService.request(id, 0, address, password);
    expect(await emailService.status(id)).toMatchObject({ verified: false, pending: { action: 'add', email: address, confirmationDestination: 'secondary' } });
    await emailService.confirm(tokenFor(address));
    await emailService.request(id, 0, next, password);
    const replacement = tokenFor(next);
    expect(await emailService.status(id)).toMatchObject({ email: address, pending: { action: 'replace', email: next } });
    await expect(emailService.cancelPending(id, 1)).rejects.toThrow();
    await emailService.cancelPending(id, 0);
    await expect(emailService.confirm(replacement)).rejects.toThrow();
    expect(await emailService.status(id)).toMatchObject({ email: address, pending: null });
    await emailService.request(id, 0, null, password);
    const removal = tokenFor(`${id}@example.invalid`, 'remove');
    await emailService.cancelPending(id, 0);
    await expect(emailService.confirm(removal, false, true)).rejects.toThrow();
    expect(await emailService.status(id)).toMatchObject({ email: address, verified: true, pending: null });
    await expect(emailService.cancelPending(id, 0)).resolves.toEqual({ cancelled: true });
  });
  it('hides expired and credential-invalidated pending removals and explains accounts without 2FA', async () => {
    const id = await account(); await enroll(id);
    expect(await recovery.request(`${id}@example.invalid`, password)).toMatchObject({ status: 'not_enabled' });
    await emailService.request(id, 0, null, password);
    await dataSource.query("UPDATE users SET recovery_email_expires_at=now()-interval '1 second' WHERE id=$1", [id]);
    expect(await emailService.status(id)).toMatchObject({ pending: null });
    await emailService.request(id, 0, null, password);
    await dataSource.query('UPDATE users SET auth_version=auth_version+1 WHERE id=$1', [id]);
    expect(await emailService.status(id)).toMatchObject({ pending: null });
  });
  it('commits invalid recovery password attempts and refuses valid passwords during lockout', async () => {
    const id = await account();
    for (let index = 0; index < 5; index++) await expect(recovery.request(`${id}@example.invalid`, 'incorrect')).rejects.toThrow('E-mail ou senha inválidos');
    const [row] = await dataSource.query('SELECT failed_login_attempts,login_locked_until FROM users WHERE id=$1', [id]);
    expect(row.failed_login_attempts).toBe(5);
    expect(row.login_locked_until.getTime()).toBeGreaterThan(Date.now());
    await expect(recovery.request(`${id}@example.invalid`, password)).rejects.toThrow('E-mail ou senha inválidos');
  });
  it('uses confirmed email immediately, authenticates before disclosing eligibility and keeps SUPER_ADMIN server-only', async () => {
    const id = await account(), address = await enroll(id);
    await dataSource.query("UPDATE users SET totp_enabled=true, recovery_email_available_at=now()+interval '24 hours' WHERE id=$1", [id]);
    const first = await recovery.request(`${id}@example.invalid`, password);
    expect(first).toMatchObject({ status: 'sent' });
    const token = tokenFor(address);
    const [grant] = await dataSource.query('SELECT available_at FROM totp_recovery_grants WHERE user_id=$1 AND consumed_at IS NULL', [id]);
    expect(grant.available_at.getTime()).toBeLessThanOrEqual(Date.now());
    const messages = vi.mocked(transactionalMail).mock.calls.filter(call => call[2].to === `${id}@example.invalid`);
    expect(messages.every(call => !call[2].text.includes('/recuperar-autenticador#token='))).toBe(true);
    await expect(recovery.request('missing@example.invalid', password)).rejects.toThrow('E-mail ou senha inválidos');
    await expect(recovery.request(`${id}@example.invalid`, 'wrong-password')).rejects.toThrow('E-mail ou senha inválidos');
    const owner = await account('SUPER_ADMIN'); await enroll(owner);
    await dataSource.query('UPDATE users SET totp_enabled=true WHERE id=$1', [owner]);
    expect(await recovery.request(`${owner}@example.invalid`, password)).toMatchObject({ status: 'assisted_required' });
    expect((await dataSource.query('SELECT count(*)::int AS count FROM totp_recovery_grants WHERE user_id=$1', [owner]))[0].count).toBe(0);
    const before = (await dataSource.query('SELECT count(*)::int AS count FROM totp_recovery_grants WHERE user_id=$1', [id]))[0].count;
    await recovery.request(`${id}@example.invalid`, password);
    expect((await dataSource.query('SELECT count(*)::int AS count FROM totp_recovery_grants WHERE user_id=$1', [id]))[0].count).toBe(before);
    // A previously issued link must no longer inherit the old email waiting period.
    await dataSource.query("UPDATE totp_recovery_grants SET available_at=now()+interval '23 hours' WHERE user_id=$1", [id]);
    const recovered = await recovery.recover(token, password);
    expect(recovered).toHaveProperty('secret');
    if (!('secret' in recovered)) throw new Error('Expected a new TOTP enrollment');
    expect(recovered.secret).toBeTruthy();
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
