import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import configured from '../../database/data-source.js';
import { Comment } from '../comments/entities/comment.entity.js';
import { Post } from '../posts/entities/post.entity.js';
import { User } from '../users/entities/user.entity.js';
import { Report } from './reports.entity.js';
import { ReportsService } from './reports.service.js';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('atribuição concorrente no PostgreSQL', () => {
  const first = randomUUID(), second = randomUUID(), target = randomUUID(), report = randomUUID();
  let db: DataSource, service: ReportsService;
  beforeAll(async () => {
    db = new DataSource({ ...configured.options, migrations: [], entities: [...configured.options.entities as any[], Report] });
    await db.initialize();
    await db.query(`INSERT INTO users(id, name, email, password_hash, role, email_verified) VALUES
      ($1, 'Moderador sintético A', $2, 'invalid', 'ADMIN', true),
      ($3, 'Moderador sintético B', $4, 'invalid', 'ADMIN', true),
      ($5, 'Perfil sintético', $6, 'invalid', 'READER', true)`, [first, `${first}@example.invalid`, second, `${second}@example.invalid`, target, `${target}@example.invalid`]);
    await db.query("INSERT INTO reports(id, reporter_id, user_id, reason) VALUES ($1, $2, $3, 'Motivo sintético')", [report, first, target]);
    const audit: any = { record: (manager: any, actorId: string, action: string, targetType: string, targetId: string, details: unknown) => manager.query('INSERT INTO audit_logs(actor_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5::jsonb)', [actorId, action, targetType, targetId, JSON.stringify(details)]) };
    service = new ReportsService(db.getRepository(Report), db.getRepository(Post), db.getRepository(Comment), audit, db.getRepository(User));
  });
  afterAll(async () => {
    if (!db?.isInitialized) return;
    try {
      await db.query('DELETE FROM notifications WHERE report_id = $1', [report]);
      await db.query('DELETE FROM audit_logs WHERE target_id = $1 OR actor_id = ANY($2::uuid[])', [report, [first, second, target]]);
      await db.query('DELETE FROM reports WHERE id = $1', [report]);
      await db.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[first, second, target]]);
    } finally { await db.destroy(); }
  });
  it('permite apenas uma tomada e registra um único responsável', async () => {
    const outcomes = await Promise.allSettled([service.assign(report, first, first), service.assign(report, second, second)]);
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(result => result.status === 'rejected')).toHaveLength(1);
    const [row] = await db.query('SELECT moderator_id FROM reports WHERE id = $1', [report]);
    expect([first, second]).toContain(row.moderator_id);
    const [audit] = await db.query("SELECT count(*)::int AS total FROM audit_logs WHERE target_id = $1 AND action = 'report.assign'", [report]);
    expect(audit.total).toBe(1);
    const next = row.moderator_id === first ? second : first;
    await service.assign(report, row.moderator_id, next);
    const [reassigned] = await db.query('SELECT moderator_id FROM reports WHERE id = $1', [report]);
    expect(reassigned.moderator_id).toBe(next);
  });
});
