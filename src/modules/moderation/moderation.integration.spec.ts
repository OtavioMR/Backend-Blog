import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource, QueryRunner } from 'typeorm';
import dataSource from '../../database/data-source.js';
import { ModerationService } from './moderation.service.js';
import { UserRole } from '../users/enums/user.enum.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { ReportsService } from '../reports/reports.service.js';
import { Report, ReportStatus, ReportTarget } from '../reports/reports.entity.js';
import { Post } from '../posts/entities/post.entity.js';
import { Comment } from '../comments/entities/comment.entity.js';
import { User } from '../users/entities/user.entity.js';
import { AuditLog } from '../audit/audit.entity.js';
import { AuditService } from '../audit/audit.service.js';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('operações administrativas no PostgreSQL', () => {
  let runner: QueryRunner, service: ModerationService, reportsService: ReportsService;
  const admin = randomUUID(), author = randomUUID(), post = randomUUID(), comment = randomUUID();
  beforeAll(async () => {
    dataSource.setOptions({ migrations: [], entities: [...(dataSource.options.entities as any[]), Report, AuditLog] });
    await dataSource.initialize();
    runner = dataSource.createQueryRunner();
    await runner.startTransaction();
    await runner.query(`INSERT INTO users (id, name, email, password_hash, role, email_verified, author_rules_accepted_at, author_rules_version) VALUES ($1, 'Admin de teste', $2, 'hash', 'SUPER_ADMIN', true, NULL, NULL), ($3, 'Autor de teste', $4, 'hash', 'READER', true, now(), '1')`, [admin, `${admin}@example.invalid`, author, `${author}@example.invalid`]);
    await runner.query('UPDATE users SET totp_enabled = true WHERE id = $1', [admin]);
    await runner.query(`INSERT INTO posts (id, title, slug, content, author_id, published) VALUES ($1, 'Artigo de teste', $2, 'Conteúdo de teste', $3, false)`, [post, `teste-${post}`, author]);
    await runner.query(`INSERT INTO comments (id, post_id, author_id, content) VALUES ($1, $2, $3, 'Comentário de teste')`, [comment, post, author]);
    const db = { transaction: runner.manager.transaction.bind(runner.manager), query: runner.query.bind(runner), getRepository: runner.manager.getRepository.bind(runner.manager) } as unknown as DataSource;
    const audit: any = { record: (manager: any, actorId: string, action: string, targetType: string, targetId: string, details: unknown = {}) => manager.query('INSERT INTO audit_logs(actor_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5::jsonb)', [actorId, action, targetType, targetId, JSON.stringify(details)]) };
    service = new ModerationService(db, audit);
    reportsService = new ReportsService(runner.manager.getRepository(Report), runner.manager.getRepository(Post), runner.manager.getRepository(Comment), audit, runner.manager.getRepository(User));
  });
  afterAll(async () => {
    if (runner?.isTransactionActive) await runner.rollbackTransaction();
    if (runner) await runner.release();
    if (dataSource.isInitialized) await dataSource.destroy();
  });
  it('enriquece e pesquisa eventos de auditoria sem alterar dados históricos', async () => {
    await runner.query("INSERT INTO audit_logs(actor_id, action, target_type, target_id, details) VALUES ($1, 'comment.hide', 'comment', $2, $3::jsonb)", [admin, comment, JSON.stringify({ reason: 'Teste sintético' })]);
    const db = { getRepository: runner.manager.getRepository.bind(runner.manager), query: runner.query.bind(runner) } as unknown as DataSource;
    const result = await new AuditService(db).list(1, 20, { actorId: admin, search: 'Comentário de teste' });
    expect(result.data).toEqual(expect.arrayContaining([expect.objectContaining({ actorName: 'Admin de teste', targetLabel: 'Comentário de teste', action: 'comment.hide' })]));
  });
  it('inclui nomes de autor e artigo nas filas administrativas', async () => {
    const posts = await service.listPosts({ authorId: author });
    const comments = await service.listComments({ authorId: author });
    expect(posts.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: post, author: expect.objectContaining({ name: 'Autor de teste' }) })]));
    expect(comments.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: comment, author: expect.objectContaining({ name: 'Autor de teste' }), post: expect.objectContaining({ title: 'Artigo de teste' }) })]));
  });
  it('mostra a concessão administrativa quando há evento histórico correspondente', async () => {
    await runner.query("INSERT INTO audit_logs(actor_id, action, target_type, target_id, details) VALUES ($1, 'user.permissions_changed', 'user', $1, $2::jsonb)", [admin, JSON.stringify({ role: 'SUPER_ADMIN' })]);
    const result = await service.listUsers({ role: UserRole.SUPER_ADMIN, search: admin });
    expect(result.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: admin, grantedAt: expect.any(Date), grantedBy: 'Admin de teste' })]));
  });
  it('concede e revoga ADMIN com auditoria e invalidação das credenciais', async () => {
    const target = randomUUID();
    await runner.query("INSERT INTO users(id, name, email, password_hash, role, email_verified) VALUES ($1, 'Pessoa sintética', $2, 'hash', 'READER', true)", [target, `${target}@example.invalid`]);
    await service.changeRole(admin, target, UserRole.ADMIN, 'Concessão sintética', 0);
    await service.changeRole(admin, target, UserRole.READER, 'Revogação sintética', 0);
    const [user] = await runner.query('SELECT role, auth_version FROM users WHERE id = $1', [target]);
    expect(user).toMatchObject({ role: 'READER', auth_version: 2 });
    const events = await runner.query("SELECT details->>'role' AS role FROM audit_logs WHERE target_id = $1 AND action = 'user.permissions_changed' ORDER BY created_at, id", [target]);
    expect(events.map((event: { role: string }) => event.role)).toEqual(expect.arrayContaining(['ADMIN', 'READER']));
  });
  it('filtra a fila por responsável e apresenta o comentário e moderador', async () => {
    const id = randomUUID();
    await runner.query("INSERT INTO reports(id, reporter_id, comment_id, reason) VALUES ($1, $2, $3, 'Motivo sintético')", [id, admin, comment]);
    const unassigned = await reportsService.list({ assignee: 'unassigned', target: ReportTarget.COMMENT }, admin);
    expect(unassigned.data).toEqual(expect.arrayContaining([expect.objectContaining({ id, targetLabel: 'Comentário de teste', moderatorName: null, authorName: 'Autor de teste', postTitle: 'Artigo de teste' })]));
    await reportsService.assign(id, admin, admin);
    const mine = await reportsService.list({ assignee: 'me', target: ReportTarget.COMMENT }, admin);
    expect(mine.data).toEqual(expect.arrayContaining([expect.objectContaining({ id, moderatorName: 'Admin de teste' })]));
    expect(await reportsService.detail(id)).toEqual(expect.objectContaining({ assignedAt: expect.any(Date), moderator: expect.objectContaining({ name: 'Admin de teste' }) }));
    await reportsService.release(id, admin);
    const [report] = await runner.query('SELECT status, moderator_id FROM reports WHERE id = $1', [id]);
    expect(report).toEqual({ status: 'PENDING', moderator_id: null });
    await runner.query('DELETE FROM reports WHERE id = $1', [id]);
  });
  it('não apresenta conteúdo excluído pelo autor na denúncia nem na auditoria', async () => {
    const removedComment = randomUUID(), report = randomUUID();
    await runner.query("INSERT INTO comments(id, post_id, author_id, content, is_active, moderation_hidden) VALUES ($1, $2, $3, 'Texto removido sintético', false, false)", [removedComment, post, author]);
    await runner.query("INSERT INTO reports(id, reporter_id, comment_id, reason) VALUES ($1, $2, $3, 'Motivo sintético')", [report, admin, removedComment]);
    await runner.query("INSERT INTO audit_logs(actor_id, action, target_type, target_id) VALUES ($1, 'comment.moderated', 'comment', $2)", [admin, removedComment]);
    expect((await reportsService.detail(report)).target).toBeNull();
    const db = { getRepository: runner.manager.getRepository.bind(runner.manager), query: runner.query.bind(runner) } as unknown as DataSource;
    const events = await new AuditService(db).list(1, 20, { targetId: removedComment });
    expect(events.data[0].targetLabel).toBe('Conteúdo indisponível');
  });
  it('persiste mudança de função com auditoria, revogação e notificação na mesma transação', async () => {
    await service.changeRole(admin, author, UserRole.AUTHOR, 'Autoria aprovada', 0);
    const [user] = await runner.query('SELECT role, auth_version FROM users WHERE id = $1', [author]);
    expect(user).toMatchObject({ role: 'AUTHOR', auth_version: 1 });
    const [audit] = await runner.query("SELECT action FROM audit_logs WHERE target_id = $1 AND action = 'user.permissions_changed'", [author]);
    expect(audit.action).toBe('user.permissions_changed');
    const [notification] = await runner.query("SELECT type FROM notifications WHERE recipient_id = $1 AND type = 'role_changed'", [author]);
    expect(notification.type).toBe('role_changed');
  });
  it('revoga sessões de forma auditada sem depender da existência de sessão ativa', async () => {
    await expect(service.revokeUserSessions(admin, author, 0, 'Revogação de segurança')).resolves.toEqual({ revoked: true });
    const [user] = await runner.query('SELECT auth_version FROM users WHERE id = $1', [author]);
    expect(user.auth_version).toBe(2);
    const [audit] = await runner.query("SELECT action FROM audit_logs WHERE target_id = $1 AND action = 'user.sessions_revoked'", [author]);
    expect(audit.action).toBe('user.sessions_revoked');
  });
  it('restaura somente comentário que foi ocultado pela moderação', async () => {
    await service.moderateComment(comment, admin, true, 'Conteúdo inadequado');
    const [hidden] = await runner.query('SELECT is_active, moderation_hidden FROM comments WHERE id = $1', [comment]);
    expect(hidden).toMatchObject({ is_active: false, moderation_hidden: true });
    await service.moderateComment(comment, admin, false, 'Revisão concluída');
    const [restored] = await runner.query('SELECT is_active, moderation_hidden FROM comments WHERE id = $1', [comment]);
    expect(restored).toMatchObject({ is_active: true, moderation_hidden: false });
  });
  it('oculta e restaura artigo sem perder seu estado de publicação', async () => {
    await runner.query('UPDATE users SET first_post_approved = true WHERE id = $1', [author]);
    await runner.query('UPDATE posts SET published = true WHERE id = $1', [post]);
    await service.moderatePost(post, admin, true, 'Violação confirmada');
    const [hidden] = await runner.query('SELECT published, is_active, moderation_hidden FROM posts WHERE id = $1', [post]);
    expect(hidden).toMatchObject({ published: true, is_active: false, moderation_hidden: true });
    await service.moderatePost(post, admin, false, 'Revisão concluída');
    const [restored] = await runner.query('SELECT published, is_active, moderation_hidden FROM posts WHERE id = $1', [post]);
    expect(restored).toMatchObject({ published: true, is_active: true, moderation_hidden: false });
  });
  it('impede denúncia duplicada enquanto outra está em análise', async () => {
    const id = randomUUID();
    await runner.query("INSERT INTO reports(id, reporter_id, user_id, reason, status) VALUES ($1, $2, $3, 'Motivo de teste', 'IN_REVIEW')", [id, author, admin]);
    await expect(runner.manager.transaction(manager => manager.query("INSERT INTO reports(reporter_id, user_id, reason) VALUES ($1, $2, 'Outro motivo')", [author, admin]))).rejects.toMatchObject({ code: '23505' });
    await runner.query("UPDATE reports SET status = 'RESOLVED' WHERE id = $1", [id]);
    await expect(runner.query("INSERT INTO reports(reporter_id, user_id, reason) VALUES ($1, $2, 'Outro motivo')", [author, admin])).resolves.toBeDefined();
    const list = await reportsService.list({ status: ReportStatus.RESOLVED, target: ReportTarget.USER, page: 1, limit: 10 });
    expect(list.data).toEqual(expect.arrayContaining([expect.objectContaining({ id })]));
    await expect(reportsService.detail(id)).resolves.toMatchObject({ id, target: { id: admin, type: 'USER' } });
  });
  it('registra a criação de denúncia de perfil e o evento de auditoria', async () => {
    const report = await reportsService.create(admin, { target: ReportTarget.USER, targetId: author, reason: 'Motivo suficiente' });
    const [event] = await runner.query("SELECT action FROM audit_logs WHERE target_id = $1 AND action = 'report.created'", [report.id]);
    expect(event.action).toBe('report.created');
  });
  it('calcula a série diária e indicadores no banco', async () => {
    const analytics = new AnalyticsService({ query: runner.query.bind(runner) } as unknown as DataSource);
    const from = new Date(Date.now() - 60_000).toISOString();
    const to = new Date(Date.now() + 60_000).toISOString();
    const result = await analytics.activity(from, to);
    expect(result.series.length).toBeGreaterThan(0);
    expect(result.series.reduce((sum: number, row: { users: number }) => sum + row.users, 0)).toBeGreaterThanOrEqual(2);
    await expect(analytics.newsletter()).resolves.toHaveProperty('subscribers.active');
  });
  it('filtra contas, comentários e artigos diretamente no banco', async () => {
    const accounts = await service.listUsers({ page: 1, limit: 10, search: author });
    expect(accounts.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: author })]));
    const comments = await service.listComments({ postId: post, status: 'active' });
    expect(comments.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: comment })]));
    const posts = await service.listPosts({ authorId: author, search: 'Artigo de teste' });
    expect(posts.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: post })]));
    await expect(service.postDetail(post)).resolves.toMatchObject({ id: post, authorId: author });
  });
  it('mescla tags sem duplicar associações e mantém auditoria', async () => {
    const source = await service.saveTag(null, `origem-${randomUUID()}`, admin);
    const target = await service.saveTag(null, `destino-${randomUUID()}`, admin);
    await runner.query('INSERT INTO post_tags(post_id, tag_id) VALUES ($1, $2), ($1, $3)', [post, source.id, target.id]);
    await service.mergeTag(source.id, target.id, admin);
    const rows = await runner.query('SELECT tag_id FROM post_tags WHERE post_id = $1', [post]);
    expect(rows).toEqual([{ tag_id: target.id }]);
    const audit = await runner.query("SELECT action FROM audit_logs WHERE target_id = $1 AND action = 'tag.merged'", [source.id]);
    expect(audit).toHaveLength(1);
  });
  it('conclui denúncia e oculta comentário na mesma transação', async () => {
    const id = randomUUID();
    await runner.query("INSERT INTO reports(id, reporter_id, comment_id, reason) VALUES ($1, $2, $3, 'Comentário ofensivo')", [id, admin, comment]);
    await reportsService.resolveWithAction(id, admin, { status: ReportStatus.RESOLVED, note: 'Violação confirmada', action: 'HIDE_COMMENT' });
    const [row] = await runner.query('SELECT r.status, c.moderation_hidden FROM reports r JOIN comments c ON c.id = r.comment_id WHERE r.id = $1', [id]);
    expect(row).toMatchObject({ status: 'RESOLVED', moderation_hidden: true });
    const events = await runner.query("SELECT action FROM audit_logs WHERE target_id = ANY($1::uuid[]) AND action IN ('report.review', 'comment.hide')", [[id, comment]]);
    expect(events.map((event: { action: string }) => event.action)).toEqual(expect.arrayContaining(['report.review', 'comment.hide']));
  });
  it('reverte ocultação se a auditoria da decisão falhar', async () => {
    const newComment = randomUUID(), reportId = randomUUID();
    await runner.query("INSERT INTO comments(id, post_id, author_id, content) VALUES ($1, $2, $3, 'Outro comentário')", [newComment, post, author]);
    await runner.query("INSERT INTO reports(id, reporter_id, comment_id, reason) VALUES ($1, $2, $3, 'Comentário ofensivo')", [reportId, admin, newComment]);
    const audit: any = { record: async (_manager: unknown, _actor: string, action: string) => { if (action === 'report.review') throw new Error('falha de auditoria'); } };
    const failing = new ReportsService(runner.manager.getRepository(Report), runner.manager.getRepository(Post), runner.manager.getRepository(Comment), audit, runner.manager.getRepository(User));
    await expect(failing.resolveWithAction(reportId, admin, { status: ReportStatus.RESOLVED, note: 'Violação confirmada', action: 'HIDE_COMMENT' })).rejects.toThrow('falha de auditoria');
    const [row] = await runner.query('SELECT r.status, c.is_active, c.moderation_hidden FROM reports r JOIN comments c ON c.id = r.comment_id WHERE r.id = $1', [reportId]);
    expect(row).toMatchObject({ status: 'PENDING', is_active: true, moderation_hidden: false });
  });
  it('permite publicação direta após concessão administrativa', async () => {
    const newAdmin = randomUUID(), newPost = randomUUID();
    await runner.query("INSERT INTO users(id, name, email, password_hash, role, email_verified) VALUES ($1, 'Novo admin', $2, 'hash', 'READER', true)", [newAdmin, `${newAdmin}@example.invalid`]);
    await service.changeRole(admin, newAdmin, UserRole.ADMIN, 'Promoção aprovada', 0);
    await runner.query("INSERT INTO posts(id, title, slug, content, author_id, published) VALUES ($1, 'Artigo admin', $2, 'Conteúdo', $3, true)", [newPost, `admin-${newPost}`, newAdmin]);
    const [row] = await runner.query('SELECT u.first_post_approved, p.published FROM users u JOIN posts p ON p.author_id = u.id WHERE p.id = $1', [newPost]);
    expect(row).toMatchObject({ first_post_approved: true, published: true });
    await expect(service.suspend(admin, newAdmin, 'Suspensão de teste', null, [], 0)).resolves.toMatchObject({ suspended: true });
    await expect(service.restore(admin, newAdmin, 0)).resolves.toMatchObject({ suspended: false });
  });
});
