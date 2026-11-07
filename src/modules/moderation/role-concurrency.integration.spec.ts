import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import configured from '../../database/data-source.js';
import { UserRole } from '../users/enums/user.enum.js';
import { ModerationService } from './moderation.service.js';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('concorrência de permissões no PostgreSQL', () => {
  const first = randomUUID(), second = randomUUID();
  let db: DataSource, service: ModerationService;
  beforeAll(async () => {
    db = new DataSource({ ...configured.options, migrations: [] });
    await db.initialize();
    await db.query(`INSERT INTO users(id, name, email, password_hash, role, email_verified, totp_enabled) VALUES
      ($1, 'Teste concorrente A', $2, 'invalid-hash', 'SUPER_ADMIN', true, true),
      ($3, 'Teste concorrente B', $4, 'invalid-hash', 'SUPER_ADMIN', true, true)`, [first, `${first}@example.invalid`, second, `${second}@example.invalid`]);
    const audit: any = { record: (manager: any, actorId: string, action: string, targetType: string, targetId: string, details: unknown) => manager.query('INSERT INTO audit_logs(actor_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5::jsonb)', [actorId, action, targetType, targetId, JSON.stringify(details)]) };
    service = new ModerationService(db, audit);
  });
  afterAll(async () => {
    if (!db?.isInitialized) return;
    try {
      await db.query('DELETE FROM notifications WHERE recipient_id = ANY($1::uuid[]) OR actor_id = ANY($1::uuid[])', [[first, second]]);
      await db.query('DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[]) OR target_id = ANY($1::uuid[])', [[first, second]]);
      await db.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[first, second]]);
    } finally { await db.destroy(); }
  });
  it('serializa rebaixamentos concorrentes e rejeita o ator cuja sessão perdeu privilégios', async () => {
    const outcomes = await Promise.allSettled([
      service.changeRole(first, second, UserRole.READER, 'Alteração de teste', 0),
      service.changeRole(second, first, UserRole.READER, 'Alteração de teste', 0),
    ]);
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(result => result.status === 'rejected')).toHaveLength(1);
    const rows = await db.query('SELECT role, auth_version FROM users WHERE id = ANY($1::uuid[])', [[first, second]]);
    expect(rows.filter((row: { role: string }) => row.role === 'SUPER_ADMIN')).toHaveLength(1);
    expect(rows.filter((row: { role: string; auth_version: number }) => row.role === 'READER' && row.auth_version === 1)).toHaveLength(1);
  });
});
