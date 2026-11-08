import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { generateSync } from 'otplib';
import { ConfigService } from '@nestjs/config';
import dataSource from '../../database/data-source.js';
import { TotpService } from './totp.service.js';
import { TotpRecoveryService } from './totp-recovery.service.js';
import { authorizeRecovery, lockRecoveryUser } from './totp-recovery-operations.js';
import { transactionalMail } from '../mail/transactional-mail.js';
import { User } from '../users/entities/user.entity.js';
import { AuthSession } from './entities/session.entity.js';
import type { AuditService } from '../audit/audit.service.js';

// Real transactions and row locks; no SMTP or Redis interaction, even with production-like env.
vi.mock('../mail/transactional-mail.js', () => ({ transactionalMail: vi.fn(async () => {}) }));

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('TOTP recovery PostgreSQL', () => {
  const ids: string[] = [];
  const config = new ConfigService({ TOTP_ENCRYPTION_KEY: 'c'.repeat(64), JWT_SECRET: 'synthetic-test-secret'.repeat(3), FRONTEND_URL: 'https://example.invalid' });
  const password = 'SyntheticPassword123!';
  let totp: TotpService, service: TotpRecoveryService, passwordHash: string;
  beforeAll(async () => {
    dataSource.setOptions({ migrations: [] });
    await dataSource.initialize();
    passwordHash = await bcrypt.hash(password, 4);
    totp = new TotpService(dataSource, config, { record: vi.fn() } as unknown as AuditService);
    service = new TotpRecoveryService(dataSource, config, totp);
  });
  afterAll(async () => {
    if (!dataSource.isInitialized) return;
    await dataSource.query('DELETE FROM audit_logs WHERE target_id = ANY($1::uuid[]) OR actor_id = ANY($1::uuid[])', [ids]);
    await dataSource.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
    await dataSource.destroy();
  });
  async function account(role = 'READER') {
    const id = randomUUID(); ids.push(id);
    await dataSource.query("INSERT INTO users(id, name, email, password_hash, role, email_verified, totp_enabled) VALUES ($1, 'Synthetic recovery test', $2, $3, $4, true, true)", [id, `${id}@example.invalid`, passwordHash, role]);
    await dataSource.query('UPDATE users SET recovery_email = $1, recovery_email_verified_at = now(), recovery_email_available_at = now() WHERE id = $2', [`recovery-${id}@example.invalid`, id]);
    return id;
  }
  async function grant(id: string) {
    await dataSource.transaction(async manager => {
      const user = await lockRecoveryUser(manager, id);
      await authorizeRecovery(manager, user!, { operator: 'synthetic-operator', reason: 'Synthetic independently verified identity test' }, { frontendUrl: 'https://example.invalid', jwtSecret: 'test-secret' });
    });
    const message = [...vi.mocked(transactionalMail).mock.calls].reverse().find(call => call[2].text.includes('#token='))![2];
    const token = /#token=([\w-]{43})/.exec(message.text)![1];
    const cancel = /#cancel=([\w-]{43})/.exec(message.text)![1];
    return { token, cancel };
  }
  async function release(id: string) {
    await dataSource.query("UPDATE totp_recovery_grants SET available_at = now() - interval '1 second' WHERE user_id = $1", [id]);
  }
  async function setup(token: string) {
    const value = await service.recover(token, password);
    if (!('secret' in value)) throw new Error('Expected setup');
    return value;
  }
  it('reports the cooldown only for valid credentials and does not create another grant', async () => {
    const id = await account('ADMIN');
    await grant(id);
    const result = await service.request(`${id}@example.invalid`, password);
    expect(result).toHaveProperty('retryAt');
    expect(new Date(result.retryAt!).getTime()).toBeGreaterThan(Date.now());
    const invalid = await service.request(`${id}@example.invalid`, 'wrong-password');
    expect(invalid).not.toHaveProperty('retryAt');
    const [count] = await dataSource.query('SELECT count(*)::int AS count FROM totp_recovery_grants WHERE user_id = $1', [id]);
    expect(count.count).toBe(1);
  });
  it('preserves factor until completion, requires password and persists failures', async () => {
    const id = await account('SUPER_ADMIN'), { token } = await grant(id);
    const [user] = await dataSource.query('SELECT totp_enabled, auth_version FROM users WHERE id = $1', [id]);
    expect(user).toMatchObject({ totp_enabled: true, auth_version: 0 });
    await release(id);
    for (let index = 0; index < 10; index++) await expect(service.recover(token, 'wrong-password')).rejects.toThrow();
    const [row] = await dataSource.query('SELECT attempts FROM totp_recovery_grants WHERE user_id = $1', [id]);
    expect(row.attempts).toBe(10);
    await expect(service.recover(token, password)).rejects.toThrow();
  });
  it('cancels with separate token without changing the existing factor', async () => {
    const id = await account(), { token, cancel } = await grant(id);
    await expect(service.cancel(token)).rejects.toThrow();
    await expect(service.cancel(cancel)).resolves.toEqual({ cancelled: true });
    await expect(service.cancel(cancel)).rejects.toThrow();
    await expect(service.recover(token, password)).rejects.toThrow();
    expect((await dataSource.query('SELECT totp_enabled FROM users WHERE id = $1', [id]))[0].totp_enabled).toBe(true);
  });
  it('invalidates grants when credentials change or a replacement grant is issued', async () => {
    const id = await account(), first = await grant(id), second = await grant(id);
    await release(id);
    await expect(service.recover(first.token, password)).rejects.toThrow();
    await dataSource.query('UPDATE users SET auth_version = auth_version + 1 WHERE id = $1', [id]);
    await expect(service.recover(second.token, password)).rejects.toThrow();
  });
  it('replaces once under concurrent completion, revokes sessions and old codes, audits and notifies', async () => {
    const id = await account('ADMIN'), { token } = await grant(id);
    await release(id);
    await dataSource.getRepository(AuthSession).save({ id: randomUUID(), userId: id, authVersion: 0, tokenHash: 'synthetic', expiresAt: new Date(Date.now() + 60_000), lastUsedAt: new Date() });
    await dataSource.query("INSERT INTO user_recovery_codes(user_id, code_hash) VALUES ($1, 'old-test-code')", [id]);
    const prepared = await setup(token);
    expect((await dataSource.query('SELECT totp_enabled FROM users WHERE id = $1', [id]))[0].totp_enabled).toBe(true);
    await expect(service.recover(token, password, 'invalid')).rejects.toThrow();
    const code = generateSync({ secret: prepared.secret });
    const results = await Promise.allSettled([service.recover(token, password, code), service.recover(token, password, code)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const winner = results.find(result => result.status === 'fulfilled');
    expect(winner?.status === 'fulfilled' && 'recoveryCodes' in winner.value && winner.value.recoveryCodes).toHaveLength(8);
    expect(await dataSource.getRepository(AuthSession).countBy({ userId: id })).toBe(0);
    expect((await dataSource.query('SELECT count(*)::int AS count FROM user_recovery_codes WHERE user_id = $1 AND code_hash = $2', [id, 'old-test-code']))[0].count).toBe(0);
    expect((await dataSource.getRepository(User).findOneByOrFail({ id })).authVersion).toBe(1);
    expect((await dataSource.query("SELECT count(*)::int AS count FROM audit_logs WHERE target_id = $1 AND action = 'auth.totp_recovered'", [id]))[0].count).toBe(1);
    expect(vi.mocked(transactionalMail).mock.calls.at(-1)![2].subject).toContain('substituído');
    await expect(service.recover(token, password, code)).rejects.toThrow();
  });
  it('rejects non-superadmin authorizers, self and SUPER_ADMIN targets', async () => {
    const admin = await account('ADMIN'), owner = await account('SUPER_ADMIN');
    await expect(service.authorize(admin, 0, owner, '123456', 'Synthetic verification')).rejects.toThrow();
    await expect(service.authorize(owner, 0, owner, '123456', 'Synthetic verification')).rejects.toThrow();
    const other = await account('SUPER_ADMIN');
    await expect(service.authorize(owner, 0, other, '123456', 'Synthetic verification')).rejects.toThrow();
  });
  it('authorizes another account only with a fresh TOTP and rejects replay or stale session', async () => {
    const owner = await account('SUPER_ADMIN'), target = await account('ADMIN');
    const prepared = await totp.prepareRecovery(`${owner}@example.invalid`);
    await dataSource.query('UPDATE users SET totp_secret = $1 WHERE id = $2', [prepared.encryptedSecret, owner]);
    const code = generateSync({ secret: prepared.secret });
    await expect(service.authorize(owner, 1, target, code, 'Synthetic verified identity, reference TEST-1')).rejects.toThrow();
    await expect(service.authorize(owner, 0, target, code, 'Synthetic verified identity, reference TEST-1')).resolves.toMatchObject({ authorized: true });
    await expect(service.authorize(owner, 0, target, code, 'Synthetic verified identity, reference TEST-1')).rejects.toThrow();
  });
});
