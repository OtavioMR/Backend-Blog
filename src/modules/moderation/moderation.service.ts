import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PublicCacheService } from '../../common/public-cache.service.js';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, In } from 'typeorm';
import { User } from '../users/entities/user.entity.js';
import { Post } from '../posts/entities/post.entity.js';
import { AuditService } from '../audit/audit.service.js';
import { isAdministrator, UserRole } from '../users/enums/user.enum.js';
import { paginationMeta } from '../../common/utils/pagination.js';
import { AdminUsersQuery } from './admin-users.dto.js';
import { Comment } from '../comments/entities/comment.entity.js';
import { randomBytes } from 'node:crypto';
import { slugify } from '../../common/utils/slugify.util.js';
import { Tag } from '../tags/entities/tag.entity.js';
import { ModerationAppeal, AppealStatus, AppealTargetType } from './entities/moderation-appeal.entity.js';

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);
  constructor(private readonly dataSource: DataSource, private readonly audit: AuditService, @Optional() private readonly cache?: PublicCacheService) {}
  async listPosts(filters: { page?: number; limit?: number; authorId?: string; search?: string; status?: 'published' | 'pending' | 'rejected' | 'hidden' | 'draft' }) {
    const page = filters.page ?? 1, limit = filters.limit ?? 10;
    const query = this.dataSource.getRepository(Post).createQueryBuilder('p').leftJoinAndSelect('p.author', 'author');
    if (filters.authorId) query.andWhere('p.authorId = :authorId', { authorId: filters.authorId });
    if (filters.search?.trim()) query.andWhere("p.title ILIKE :search ESCAPE '\\'", { search: `%${filters.search.trim().replace(/[\\%_]/g, '\\$&')}%` });
    if (filters.status === 'published') query.andWhere('p.published = true AND p.isActive = true');
    if (filters.status === 'pending') query.andWhere("p.reviewStatus = 'PENDING' AND p.isActive = true");
    if (filters.status === 'rejected') query.andWhere("p.reviewStatus = 'REJECTED' AND p.isActive = true");
    if (filters.status === 'hidden') query.andWhere('p.moderationHidden = true');
    if (filters.status === 'draft') query.andWhere("p.published = false AND p.isActive = true AND p.reviewStatus = 'DRAFT'");
    const [posts, total] = await query.orderBy('p.createdAt', 'DESC').addOrderBy('p.id', 'DESC').skip((page - 1) * limit).take(limit).getManyAndCount();
    return { data: posts.map(p => ({ id: p.id, title: p.title, slug: p.slug, authorId: p.authorId, author: p.author ? { id: p.author.id, name: p.author.name, profilePhoto: p.author.profilePhoto } : null, published: p.published, reviewStatus: p.reviewStatus, isActive: p.isActive, moderationHidden: p.moderationHidden, createdAt: p.createdAt, updatedAt: p.updatedAt })), meta: paginationMeta(page, limit, total) };
  }
  async postDetail(id: string) {
    const post = await this.dataSource.getRepository(Post).createQueryBuilder('p').addSelect('p.reviewNote').leftJoinAndSelect('p.author', 'author').where('p.id = :id', { id }).getOne();
    if (!post) throw new NotFoundException('Artigo não encontrado.');
    return { id: post.id, title: post.title, slug: post.slug, content: post.content, excerpt: post.excerpt, coverImage: post.coverImage, author: post.author ? { id: post.author.id, name: post.author.name } : null, authorId: post.authorId, published: post.published, publishedAt: post.publishedAt, reviewStatus: post.reviewStatus, reviewNote: post.reviewNote, isActive: post.isActive, moderationHidden: post.moderationHidden, createdAt: post.createdAt, updatedAt: post.updatedAt };
  }
  async contentHistory(type: 'post' | 'comment', id: string, page = 1, limit = 10) {
    const repository = type === 'post' ? this.dataSource.getRepository(Post) : this.dataSource.getRepository(Comment);
    if (!(await repository.exists({ where: { id } }))) throw new NotFoundException('Conteúdo não encontrado.');
    return this.audit.list(page, limit, { targetType: type, targetId: id });
  }
  async commentDetail(id: string) {
    const comment = await this.dataSource.getRepository(Comment).findOne({ where: { id }, relations: { author: true, post: true } });
    if (!comment) throw new NotFoundException('Comentário não encontrado.');
    const reports = await this.dataSource.query(`SELECT id, status, reason, reason_category AS "reasonCategory", created_at AS "createdAt" FROM reports WHERE comment_id = $1 ORDER BY created_at DESC, id DESC LIMIT 100`, [id]);
    return { id: comment.id, postId: comment.postId, authorId: comment.authorId, author: comment.author ? { id: comment.author.id, name: comment.author.name, profilePhoto: comment.author.profilePhoto } : null, post: comment.post ? { id: comment.post.id, title: comment.post.title, slug: comment.post.slug } : null, rootId: comment.rootId, replyToId: comment.replyToId, content: comment.content, isActive: comment.isActive, moderationHidden: comment.moderationHidden, createdAt: comment.createdAt, reports };
  }
  async listCategories(page = 1, limit = 10) {
    const [data, count] = await Promise.all([
      this.dataSource.query(`SELECT c.id, c.name, c.slug, c.description, c.is_active AS "isActive", c.deleted_at AS "deletedAt", count(pc.post_id)::int AS "postCount" FROM categories c LEFT JOIN post_categories pc ON pc.category_id = c.id GROUP BY c.id ORDER BY c.name, c.id LIMIT $1 OFFSET $2`, [limit, (page - 1) * limit]),
      this.dataSource.query('SELECT count(*)::int AS total FROM categories'),
    ]);
    return { data, meta: paginationMeta(page, limit, count[0].total) };
  }
  async moderatePost(id: string, actorId: string, hide: boolean, reason: string) {
    if (reason.trim().length < 5) throw new BadRequestException('Informe o motivo.');
    const result = await this.dataSource.transaction(async manager => {
      const posts = manager.getRepository(Post);
      const post = await posts.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!post) throw new NotFoundException('Artigo não encontrado.');
      if (hide ? !post.isActive || !post.published : post.isActive || !post.moderationHidden) throw new ConflictException('Transição de artigo inválida.');
      if (!hide) {
        const author = await manager.getRepository(User).findOne({ where: { id: post.authorId, isActive: true } });
        if (!author) throw new ConflictException('Autor indisponível.');
      }
      await posts.update(id, { isActive: !hide, moderationHidden: hide });
      await this.audit.record(manager, actorId, hide ? 'post.hide' : 'post.restore', 'post', id, { reason: reason.trim(), authorId: post.authorId });
      if (post.authorId !== actorId) await manager.query('INSERT INTO notifications(recipient_id, actor_id, type, post_id, details) VALUES ($1, $2, $3, $4, $5)', [post.authorId, actorId, hide ? 'post_hidden' : 'post_restored', id, JSON.stringify({ reason: reason.trim() })]);
      return { id, isActive: !hide, moderationHidden: hide };
    });
    await this.cache?.invalidate();
    return result;
  }
  async changePostRating(id: string, actorId: string, rating: string, reason: string) {
    if (reason.trim().length < 5) throw new BadRequestException('Informe o motivo.');
    const result = await this.dataSource.transaction(async manager => {
      const posts = manager.getRepository(Post);
      const post = await posts.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!post) throw new NotFoundException('Artigo não encontrado.');
      const oldRating = post.contentRating;
      if (oldRating === rating) throw new ConflictException('O artigo já possui esta classificação etária.');
      await posts.update(id, { contentRating: rating });
      await this.audit.record(manager, actorId, 'post.rating_changed', 'post', id, {
        oldRating,
        newRating: rating,
        reason: reason.trim(),
        authorId: post.authorId,
      });
      if (post.authorId !== actorId) {
        await manager.query(
          'INSERT INTO notifications(recipient_id, actor_id, type, post_id, details) VALUES ($1, $2, $3, $4, $5)',
          [post.authorId, actorId, 'content_rating_changed', id, JSON.stringify({ reason: reason.trim(), oldRating, newRating: rating })],
        );
      }
      return { id, contentRating: rating, previousRating: oldRating };
    });
    await this.cache?.invalidate();
    return result;
  }
  async listTags(page = 1, limit = 10) {
    const [data, count] = await Promise.all([
      this.dataSource.query(`SELECT t.id, t.name, t.slug, count(pt.post_id)::int AS "postCount" FROM tags t LEFT JOIN post_tags pt ON pt.tag_id = t.id GROUP BY t.id ORDER BY t.name, t.id LIMIT $1 OFFSET $2`, [limit, (page - 1) * limit]),
      this.dataSource.query('SELECT count(*)::int AS total FROM tags'),
    ]);
    return { data, meta: paginationMeta(page, limit, count[0].total) };
  }
  async saveTag(id: string | null, rawName: string, actorId: string) {
    const name = rawName.trim().replace(/\s+/g, ' '), slug = slugify(name);
    if (!name || name.length > 50 || !slug || slug.length > 60) throw new BadRequestException('Nome de tag inválido.');
    try {
      const result = await this.dataSource.transaction(async manager => {
        const repository = manager.getRepository(Tag);
        const tag = id ? await repository.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } }) : repository.create();
        if (!tag) throw new NotFoundException('Tag não encontrada.');
        const previous = id ? { name: tag.name, slug: tag.slug } : null;
        tag.name = name; tag.slug = slug;
        const saved = await repository.save(tag);
        await this.audit.record(manager, actorId, id ? 'tag.updated' : 'tag.created', 'tag', saved.id, { previous, name, slug });
        return { id: saved.id, name: saved.name, slug: saved.slug };
      });
      await this.cache?.invalidate();
      return result;
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException('Já existe uma tag com este slug.');
      throw error;
    }
  }
  async removeTag(id: string, actorId: string) {
    await this.dataSource.transaction(async manager => {
      const rows = await manager.query('SELECT id, name, slug FROM tags WHERE id = $1 FOR UPDATE', [id]);
      if (!rows.length) throw new NotFoundException('Tag não encontrada.');
      const usage = await manager.query('SELECT 1 FROM post_tags WHERE tag_id = $1 LIMIT 1', [id]);
      if (usage.length) throw new ConflictException('A tag está associada a artigos; use a mesclagem.');
      await manager.query('DELETE FROM tags WHERE id = $1', [id]);
      await this.audit.record(manager, actorId, 'tag.deleted', 'tag', id, { name: rows[0].name, slug: rows[0].slug });
    });
    await this.cache?.invalidate();
    return { deleted: true };
  }
  async mergeTag(id: string, targetId: string, actorId: string) {
    if (id === targetId) throw new BadRequestException('Origem e destino devem ser diferentes.');
    await this.dataSource.transaction(async manager => {
      const rows = await manager.query('SELECT id FROM tags WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [[id, targetId]]);
      if (rows.length !== 2) throw new NotFoundException('Tag não encontrada.');
      await manager.query('INSERT INTO post_tags (post_id, tag_id) SELECT post_id, $2 FROM post_tags WHERE tag_id = $1 ON CONFLICT DO NOTHING', [id, targetId]);
      await manager.query('DELETE FROM tags WHERE id = $1', [id]);
      await this.audit.record(manager, actorId, 'tag.merged', 'tag', id, { targetId });
    });
    await this.cache?.invalidate();
    return { merged: true, targetId };
  }
  async listComments(filters: { page?: number; limit?: number; search?: string; authorId?: string; postId?: string; status?: 'active' | 'hidden' | 'deleted'; from?: string; to?: string }) {
    const page = filters.page ?? 1, limit = filters.limit ?? 10;
    if (filters.from && filters.to && new Date(filters.from) > new Date(filters.to)) throw new BadRequestException('Intervalo de datas inválido.');
    const query = this.dataSource.getRepository(Comment).createQueryBuilder('c').leftJoinAndSelect('c.author', 'author').leftJoinAndSelect('c.post', 'post');
    if (filters.search?.trim()) query.andWhere("c.content ILIKE :search ESCAPE '\\'", { search: `%${filters.search.trim().replace(/[\\%_]/g, '\\$&')}%` });
    if (filters.authorId) query.andWhere('c.authorId = :authorId', { authorId: filters.authorId });
    if (filters.postId) query.andWhere('c.postId = :postId', { postId: filters.postId });
    if (filters.status === 'active') query.andWhere('c.isActive = true');
    if (filters.status === 'hidden') query.andWhere('c.moderationHidden = true');
    if (filters.status === 'deleted') query.andWhere('c.isActive = false AND c.moderationHidden = false');
    if (filters.from) query.andWhere('c.createdAt >= :from', { from: filters.from });
    if (filters.to) query.andWhere('c.createdAt <= :to', { to: filters.to });
    const [data, total] = await query.orderBy('c.createdAt', 'DESC').addOrderBy('c.id', 'DESC').skip((page - 1) * limit).take(limit).getManyAndCount();
    return { data: data.map(c => ({ id: c.id, postId: c.postId, authorId: c.authorId, rootId: c.rootId, replyToId: c.replyToId, content: c.content, isActive: c.isActive, moderationHidden: c.moderationHidden, editedAt: c.editedAt, createdAt: c.createdAt, author: c.author ? { id: c.author.id, name: c.author.name, profilePhoto: c.author.profilePhoto } : null, post: c.post ? { id: c.post.id, title: c.post.title, slug: c.post.slug } : null })), meta: paginationMeta(page, limit, total) };
  }
  async moderateComment(id: string, actorId: string, hide: boolean, reason: string) {
    if (reason.trim().length < 5) throw new BadRequestException('Informe o motivo.');
    const result = await this.dataSource.transaction(async manager => {
      const repository = manager.getRepository(Comment);
      const comment = await repository.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!comment) throw new NotFoundException('Comentário não encontrado.');
      if (hide ? !comment.isActive : comment.isActive || !comment.moderationHidden) throw new ConflictException('Transição de comentário inválida.');
      await repository.update(id, { isActive: !hide, moderationHidden: hide });
      await this.audit.record(manager, actorId, hide ? 'comment.hide' : 'comment.restore', 'comment', id, { reason: reason.trim(), postId: comment.postId });
      if (comment.authorId !== actorId) await manager.query('INSERT INTO notifications(recipient_id, actor_id, type, post_id, comment_id, details) VALUES ($1, $2, $3, $4, $5, $6)', [comment.authorId, actorId, hide ? 'comment_hidden' : 'comment_restored', comment.postId, id, JSON.stringify({ reason: reason.trim() })]);
      return { id, isActive: !hide, moderationHidden: hide };
    });
    await this.cache?.invalidate();
    return result;
  }
  async listUsers(query: AdminUsersQuery) {
    const page = query.page ?? 1, limit = query.limit ?? 10;
    if (query.createdFrom && query.createdTo && new Date(query.createdFrom) > new Date(query.createdTo)) throw new BadRequestException('Intervalo de datas inválido.');
    const qb = this.dataSource.getRepository(User).createQueryBuilder('u');
    if (query.search?.trim()) {
      const term = query.search.trim().replace(/[\\%_]/g, '\\$&');
      qb.andWhere("(u.name ILIKE :search ESCAPE '\\' OR u.email ILIKE :search ESCAPE '\\' OR CAST(u.id AS text) = :id)", { search: `%${term}%`, id: query.search.trim() });
    }
    if (query.role) qb.andWhere('u.role = :role', { role: query.role });
    if (query.status === 'active') qb.andWhere('u.is_active = true');
    if (query.status === 'suspended') qb.andWhere('u.moderation_suspended = true');
    if (query.status === 'inactive') qb.andWhere('u.is_active = false AND u.moderation_suspended = false');
    if (query.createdFrom) qb.andWhere('u.created_at >= :createdFrom', { createdFrom: query.createdFrom });
    if (query.createdTo) qb.andWhere('u.created_at <= :createdTo', { createdTo: query.createdTo });
    qb.orderBy(query.sort === 'name' ? 'u.name' : 'u.createdAt', query.order ?? 'DESC').addOrderBy('u.id', 'DESC').skip((page - 1) * limit).take(limit);
    const [users, total] = await qb.getManyAndCount();
    const adminIds = users.filter(user => isAdministrator(user.role)).map(user => user.id);
    const grants: { targetId: string; role: string; grantedAt: Date; grantedBy: string | null }[] = adminIds.length ? await this.dataSource.query(`
      SELECT DISTINCT ON (a.target_id) a.target_id AS "targetId", a.details->>'role' AS role, a.created_at AS "grantedAt",
        CASE WHEN actor.deleted_at IS NULL THEN actor.name ELSE NULL END AS "grantedBy"
      FROM audit_logs a LEFT JOIN users actor ON actor.id = a.actor_id
      WHERE a.target_type = 'user' AND a.target_id = ANY($1::uuid[]) AND a.action = 'user.permissions_changed'
      ORDER BY a.target_id, a.created_at DESC, a.id DESC
    `, [adminIds]) : [];
    const byUser = new Map(grants.map(grant => [grant.targetId, grant]));
    return { data: users.map(u => { const grant = byUser.get(u.id); return { id: u.id, name: u.name, email: u.email, emailVerified: u.emailVerified, profilePhoto: u.profilePhoto, role: u.role, isActive: u.isActive, moderationSuspended: u.moderationSuspended, createdAt: u.createdAt, grantedAt: grant?.role === u.role ? grant.grantedAt : null, grantedBy: grant?.role === u.role ? grant.grantedBy : null }; }), meta: paginationMeta(page, limit, total) };
  }
  async blockedAuthorAccounts(page = 1, limit = 10, search = '', filter: 'requested' | 'all' = 'all') {
    const query = this.dataSource.getRepository(User).createQueryBuilder('u')
      .where('u.author_promotion_blocked = true AND u.role = :role AND u.is_active = true AND u.deleted_at IS NULL', { role: UserRole.READER });
    const pendingTotal = await query.clone().andWhere('u.author_access_requested_at IS NOT NULL').getCount();
    if (filter === 'requested') query.andWhere('u.author_access_requested_at IS NOT NULL');
    if (search.trim()) {
      const term = search.trim().replace(/[\\%_]/g, '\\$&');
      query.andWhere("(u.name ILIKE :search ESCAPE '\\' OR u.email ILIKE :search ESCAPE '\\' OR CAST(u.id AS text) = :id)", { search: `%${term}%`, id: search.trim() });
    }
    query.orderBy('u.author_access_requested_at', 'DESC', 'NULLS LAST').addOrderBy('u.name', 'ASC').addOrderBy('u.id', 'ASC').skip((page - 1) * limit).take(limit);
    const [users, total] = await query.getManyAndCount();
    return { data: users.map(user => ({ id: user.id, name: user.name, email: user.email, requestedAt: user.authorAccessRequestedAt })), pendingTotal, meta: paginationMeta(page, limit, total) };
  }
  async userDetail(userId: string, requesterRole?: UserRole) {
    const user = await this.dataSource.getRepository(User).findOne({ where: { id: userId }, select: { id: true, name: true, email: true, profilePhoto: true, role: true, isActive: true, moderationSuspended: true, suspensionEndsAt: true, emailVerified: true, totpEnabled: true, authorPromotionBlocked: true, createdAt: true, recoveryEmail: true, recoveryEmailVerifiedAt: true } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    const [counts] = await this.dataSource.query(`SELECT
      (SELECT count(*)::int FROM posts WHERE author_id = $1 AND deleted_at IS NULL) AS posts,
      (SELECT count(*)::int FROM comments WHERE author_id = $1) AS comments`, [userId]);
    return { id: user.id, name: user.name, email: user.email, profilePhoto: user.profilePhoto, role: user.role, isActive: user.isActive,
      moderationSuspended: user.moderationSuspended, suspensionEndsAt: user.suspensionEndsAt,
      emailVerified: user.emailVerified, totpEnabled: user.totpEnabled, recoveryEmailVerified: !!user.recoveryEmail && !!user.recoveryEmailVerifiedAt,
      ...(requesterRole === UserRole.SUPER_ADMIN ? { recoveryDestinations: [
        ...(user.emailVerified ? [{ destination: 'primary', email: user.email }] : []),
        ...(user.recoveryEmail && user.recoveryEmailVerifiedAt ? [{ destination: 'secondary', email: user.recoveryEmail }] : []),
      ] } : {}), authorPromotionBlocked: user.authorPromotionBlocked, createdAt: user.createdAt, counts };
  }
  async userHistory(userId: string, page = 1, limit = 10) {
    if (!(await this.dataSource.getRepository(User).exists({ where: { id: userId } }))) throw new NotFoundException('Usuário não encontrado.');
    const [data, count] = await Promise.all([
      this.dataSource.query(`SELECT a.id, a.actor_id AS "actorId", CASE WHEN u.deleted_at IS NULL THEN u.name ELSE NULL END AS "actorName", a.action, a.target_type AS "targetType", a.target_id AS "targetId", a.details, a.created_at AS "createdAt" FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id WHERE a.target_type = 'user' AND a.target_id = $1 AND a.action IN ('user.suspend', 'user.restore', 'user.suspension_expired', 'user.permissions_changed', 'user.sessions_revoked', 'user.author_promoted', 'user.author_request_unblocked', 'user.super_admin_bootstrap', 'auth.totp_recovery_authorized', 'auth.totp_recovery_cancelled', 'auth.totp_recovered') ORDER BY a.created_at DESC, a.id DESC LIMIT $2 OFFSET $3`, [userId, limit, (page - 1) * limit]),
      this.dataSource.query(`SELECT count(*)::int AS total FROM audit_logs WHERE target_type = 'user' AND target_id = $1 AND action IN ('user.suspend', 'user.restore', 'user.suspension_expired', 'user.permissions_changed', 'user.sessions_revoked', 'user.author_promoted', 'user.author_request_unblocked', 'user.super_admin_bootstrap', 'auth.totp_recovery_authorized', 'auth.totp_recovery_cancelled', 'auth.totp_recovered')`, [userId]),
    ]);
    return { data, meta: paginationMeta(page, limit, count[0].total) };
  }
  async userReports(userId: string, page = 1, limit = 10) {
    if (!(await this.dataSource.getRepository(User).exists({ where: { id: userId } }))) throw new NotFoundException('Usuário não encontrado.');
    const where = `(r.user_id = $1 OR EXISTS (SELECT 1 FROM posts p WHERE p.id = r.post_id AND p.author_id = $1) OR EXISTS (SELECT 1 FROM comments c WHERE c.id = r.comment_id AND c.author_id = $1))`;
    const [data, count] = await Promise.all([
      this.dataSource.query(`SELECT r.id, r.post_id AS "postId", r.comment_id AS "commentId", r.user_id AS "userId", r.reason, r.reason_category AS "reasonCategory", r.status, r.moderator_id AS "moderatorId", r.created_at AS "createdAt", r.reviewed_at AS "reviewedAt" FROM reports r WHERE ${where} ORDER BY r.created_at DESC, r.id DESC LIMIT $2 OFFSET $3`, [userId, limit, (page - 1) * limit]),
      this.dataSource.query(`SELECT count(*)::int AS total FROM reports r WHERE ${where}`, [userId]),
    ]);
    return { data, meta: paginationMeta(page, limit, count[0].total) };
  }
  async allowAuthorRequest(actorId: string, userId: string, reason: string, actorVersion: number) {
    if (actorId === userId) throw new ForbiddenException('Não é permitido liberar a própria conta.');
    if (reason.trim().length < 5) throw new BadRequestException('Informe o motivo.');
    return this.dataSource.transaction(async manager => {
      await manager.query("SELECT pg_advisory_xact_lock(hashtext('griforio.admin.roles'))");
      const users = manager.getRepository(User);
      const actor = await users.findOne({ where: { id: actorId }, lock: { mode: 'pessimistic_write' } });
      if (!actor?.isActive || !isAdministrator(actor.role) || actor.authVersion !== actorVersion || !actor.totpEnabled) throw new ForbiddenException('Sessão administrativa inválida ou sem TOTP ativo.');
      const user = await users.findOne({ where: { id: userId }, lock: { mode: 'pessimistic_write' } });
      if (!user || !user.isActive) throw new NotFoundException('Usuário ativo não encontrado.');
      if (user.role !== UserRole.READER || !user.authorPromotionBlocked) throw new ConflictException('A conta não possui solicitação de autoria bloqueada.');
      await users.update(userId, { authorPromotionBlocked: false, authorAccessRequestedAt: null });
      await this.audit.record(manager, actorId, 'user.author_request_unblocked', 'user', userId, { reason: reason.trim() });
      return { allowed: true };
    });
  }
  async changeRole(actorId: string, userId: string, role: UserRole, reason: string, actorVersion: number) {
    if (role === UserRole.SUPER_ADMIN) throw new BadRequestException('Não é permitido atribuir a função SUPER_ADMIN por esta rota.');
    if (actorId === userId) throw new ForbiddenException('Não é permitido alterar a própria função.');
    if (reason.trim().length < 5) throw new BadRequestException('Informe o motivo.');
    return this.dataSource.transaction(async manager => {
      // Serialize privilege changes, including the check for the last owner.
      await manager.query("SELECT pg_advisory_xact_lock(hashtext('griforio.admin.roles'))");
      const users = manager.getRepository(User);
      const actor = await users.findOne({ where: { id: actorId }, lock: { mode: 'pessimistic_write' } });
      if (!actor?.isActive || !isAdministrator(actor.role) || actor.authVersion !== actorVersion || !actor.totpEnabled) throw new ForbiddenException('Sessão administrativa inválida ou sem TOTP ativo.');
      const user = await users.findOne({ where: { id: userId }, lock: { mode: 'pessimistic_write' }, select: { id: true, role: true, isActive: true, emailVerified: true, totpEnabled: true, moderationSuspended: true, authorRulesAcceptedAt: true, authorRulesVersion: true, recoveryEmail: true, recoveryEmailVerifiedAt: true } });
      if (!user || !user.isActive) throw new NotFoundException('Usuário ativo não encontrado.');
      if (actor.role === UserRole.ADMIN) {
        if (isAdministrator(user.role)) throw new ForbiddenException('Administradores não podem alterar o cargo de outros administradores.');
        if (role !== UserRole.READER) throw new ForbiddenException('Administradores só podem rebaixar contas para leitor.');
      }
      if (user.role === role) throw new ConflictException('Usuário já possui esta função.');
      if (isAdministrator(role) && !user.emailVerified) throw new ConflictException('A conta precisa ter e-mail verificado para receber privilégios administrativos.');
      if (isAdministrator(role) && !user.totpEnabled) throw new ConflictException('A conta precisa ativar a autenticação em dois fatores antes de receber privilégios administrativos.');
      if (isAdministrator(role) && (!user.recoveryEmail || !user.recoveryEmailVerifiedAt)) throw new ConflictException('A conta precisa confirmar um e-mail secundário de recuperação antes de receber privilégios administrativos.');
      if (isAdministrator(role) && user.moderationSuspended) throw new ConflictException('Contas suspensas não podem receber privilégios administrativos.');
      if (role === UserRole.AUTHOR && (!user.emailVerified || !user.authorRulesAcceptedAt || user.authorRulesVersion !== '1')) throw new ConflictException('A autoria exige e-mail verificado e aceite da versão atual das regras.');
      if (user.role === UserRole.SUPER_ADMIN) {
        const remaining = await users.count({ where: { role: UserRole.SUPER_ADMIN, isActive: true } });
        if (remaining <= 1) throw new ConflictException('O último SUPER_ADMIN não pode ser rebaixado.');
      }
      const previousRole = user.role;
      const isDemotedToReader = role === UserRole.READER && (previousRole === UserRole.AUTHOR || isAdministrator(previousRole));
      await users.update(userId, {
        role,
        authVersion: () => 'auth_version + 1',
        refreshTokenHash: null,
        ...(isAdministrator(role) ? { firstPostApproved: true } : {}),
        ...(isDemotedToReader ? { authorPromotionBlocked: true, authorAccessRequestedAt: null } : {}),
        ...(role === UserRole.AUTHOR ? { authorPromotionBlocked: false, authorAccessRequestedAt: null } : {}),
      });
      await manager.query("DELETE FROM auth_sessions WHERE user_id = $1", [userId]);
      if (isDemotedToReader) {
        const rejected: { id: string }[] = await manager.query("WITH cancelled AS (UPDATE posts SET review_status = 'REJECTED', review_note = 'A função de autoria foi alterada; a revisão foi encerrada.' WHERE author_id = $1 AND review_status = 'PENDING' RETURNING id) SELECT id FROM cancelled", [userId]);
        for (const post of rejected) await this.audit.record(manager, actorId, 'post.review_cancelled', 'post', post.id, { reason: 'Função de autoria alterada', userId });
      }
      await this.audit.record(manager, actorId, 'user.permissions_changed', 'user', userId, { previousRole, role, reason: reason.trim() });
      await manager.query("INSERT INTO notifications(recipient_id, actor_id, type) VALUES ($1, $2, 'role_changed')", [userId, actorId]);
      return { id: userId, role };
    });
  }
  async revokeUserSessions(actorId: string, userId: string, actorVersion: number, reason: string) {
    if (reason.trim().length < 5) throw new BadRequestException('Informe o motivo.');
    return this.dataSource.transaction(async manager => {
      const users = manager.getRepository(User);
      const actor = await users.findOne({ where: { id: actorId }, lock: { mode: 'pessimistic_write' } });
      if (!actor?.isActive || !isAdministrator(actor.role) || actor.authVersion !== actorVersion) throw new ForbiddenException('Sessão administrativa inválida.');
      const target = actorId === userId ? actor : await users.findOne({ where: { id: userId }, lock: { mode: 'pessimistic_write' } });
      if (!target) throw new NotFoundException('Usuário não encontrado.');
      if (actorId !== userId && isAdministrator(target.role) && actor.role !== UserRole.SUPER_ADMIN) throw new ForbiddenException('Não é permitido alterar outro administrador.');
      await users.update(userId, { authVersion: () => 'auth_version + 1', refreshTokenHash: null });
      await this.audit.record(manager, actorId, 'user.sessions_revoked', 'user', userId, { reason: reason.trim() });
      if (actorId !== userId) await manager.query("INSERT INTO notifications(recipient_id, actor_id, type) VALUES ($1, $2, 'sessions_revoked')", [userId, actorId]);
      return { revoked: true };
    });
  }
  async suspend(actorId: string, userId: string, reason: string, endsAt: string | null, hidePostIds: string[], actorVersion: number) {
    if (actorId === userId) throw new ForbiddenException('Não é permitido suspender a própria conta.');
    const end = endsAt ? new Date(endsAt) : null;
    if (endsAt && !/(?:Z|[+-]\d{2}:\d{2})$/i.test(endsAt)) throw new BadRequestException('Informe o fuso horário do fim da suspensão.');
    if (end && (!Number.isFinite(end.getTime()) || end.getTime() <= Date.now())) throw new BadRequestException('O fim da suspensão deve estar no futuro.');
    if (reason.trim().length < 5) throw new BadRequestException('Informe o motivo.');
    if (new Set(hidePostIds).size !== hidePostIds.length) throw new BadRequestException('Há identificadores de artigos repetidos.');
    return this.dataSource.transaction(async manager => {
      const users = manager.getRepository(User);
      const actor = await users.findOne({ where: { id: actorId }, lock: { mode: 'pessimistic_write' } });
      if (!actor?.isActive || !isAdministrator(actor.role) || actor.authVersion !== actorVersion) throw new ForbiddenException('Sessão administrativa inválida.');
      const user = await users.findOne({ where: { id: userId }, lock: { mode: 'pessimistic_write' } });
      if (!user) throw new NotFoundException('Usuário não encontrado.');
      if (user.role === UserRole.SUPER_ADMIN || (user.role === UserRole.ADMIN && actor.role !== UserRole.SUPER_ADMIN)) throw new ForbiddenException('Não é permitido suspender esta conta administrativa.');
      if (!user.isActive) throw new ConflictException('Usuário já está inativo.');
      if (hidePostIds.length) {
        const posts = manager.getRepository(Post);
        const found = await posts.find({ where: { id: In(hidePostIds), authorId: userId, published: true, isActive: true } });
        if (found.length !== hidePostIds.length) throw new BadRequestException('Os artigos devem estar publicados e pertencer ao usuário.');
        await posts.update({ id: In(hidePostIds), authorId: userId, published: true }, { published: false, publishedAt: null, scheduledAt: null });
      }
      await users.update(userId, { isActive: false, moderationSuspended: true, suspensionEndsAt: end, authVersion: () => 'auth_version + 1' });
      await this.audit.record(manager, actorId, 'user.suspend', 'user', userId, { reason: reason.trim(), endsAt: end?.toISOString() ?? null, hiddenPostIds: hidePostIds });
      await manager.query("INSERT INTO notifications(recipient_id, actor_id, type) VALUES ($1, $2, 'account_suspended')", [userId, actorId]);
      return { suspended: true, endsAt: end };
    });
  }
  async restore(actorId: string, userId: string, actorVersion: number) {
    return this.dataSource.transaction(async manager => {
      const users = manager.getRepository(User);
      const actor = await users.findOne({ where: { id: actorId }, lock: { mode: 'pessimistic_write' } });
      if (!actor?.isActive || !isAdministrator(actor.role) || actor.authVersion !== actorVersion) throw new ForbiddenException('Sessão administrativa inválida.');
      const user = await users.findOne({ where: { id: userId }, lock: { mode: 'pessimistic_write' } });
      if (!user) throw new NotFoundException('Usuário não encontrado.');
      if (user.role === UserRole.SUPER_ADMIN || (user.role === UserRole.ADMIN && actor.role !== UserRole.SUPER_ADMIN)) throw new ForbiddenException('Não é permitido restaurar esta conta administrativa.');
      if (!user.moderationSuspended) throw new ConflictException('Usuário não está suspenso.');
      await users.update(userId, { isActive: true, moderationSuspended: false, suspensionEndsAt: null });
      await this.audit.record(manager, actorId, 'user.restore', 'user', userId);
      await manager.query("INSERT INTO notifications(recipient_id, actor_id, type) VALUES ($1, $2, 'account_restored')", [userId, actorId]);
      return { suspended: false };
    });
  }
  @Cron(CronExpression.EVERY_MINUTE)
  async restoreExpired() {
    try {
      await this.dataSource.transaction(async manager => {
        const users = await manager.getRepository(User).createQueryBuilder('u').where('u.moderation_suspended = true AND u.suspension_ends_at <= CURRENT_TIMESTAMP AND u.deleted_at IS NULL').setLock('pessimistic_write').setOnLocked('skip_locked').take(100).getMany();
        for (const user of users) {
          await manager.getRepository(User).update(user.id, { isActive: true, moderationSuspended: false, suspensionEndsAt: null });
          await this.audit.record(manager, null, 'user.suspension_expired', 'user', user.id);
        }
      });
    } catch (error) { this.logger.error('Failed to restore expired suspensions', error instanceof Error ? error.stack : String(error)); }
    await this.cache?.invalidate();
  }

  async createAppeal(userId: string, dto: { targetType: AppealTargetType; targetId: string; reason: string }) {
    const reason = dto.reason.trim();
    if (reason.length < 10) throw new BadRequestException('Descreva o motivo do recurso com mais detalhes (mínimo 10 caracteres).');

    if (dto.targetType === AppealTargetType.POST) {
      const post = await this.dataSource.getRepository(Post).findOne({ where: { id: dto.targetId } });
      if (!post) throw new NotFoundException('Artigo não encontrado.');
      if (post.authorId !== userId) throw new ForbiddenException('Apenas o autor pode recorrer de ações contra sua publicação.');
      if (!post.moderationHidden && post.isActive) {
        const ratingLog: unknown[] = await this.dataSource.query(
          `SELECT 1 FROM audit_logs WHERE target_id = $1 AND action = 'post.rating_changed' LIMIT 1`,
          [dto.targetId],
        );
        if (!ratingLog.length) {
          throw new ConflictException('O artigo não possui ação de moderação passível de recurso.');
        }
      }
    } else if (dto.targetType === AppealTargetType.COMMENT) {
      const comment = await this.dataSource.getRepository(Comment).findOne({ where: { id: dto.targetId } });
      if (!comment) throw new NotFoundException('Comentário não encontrado.');
      if (comment.authorId !== userId) throw new ForbiddenException('Apenas o autor pode recorrer de ações contra seu comentário.');
      if (!comment.moderationHidden && comment.isActive) throw new ConflictException('O comentário não está oculto pela moderação.');
    } else if (dto.targetType === AppealTargetType.ACCOUNT) {
      if (dto.targetId !== userId) throw new ForbiddenException('Apenas o titular pode recorrer de suspensão da própria conta.');
    }

    const existing = await this.dataSource.getRepository(ModerationAppeal).findOne({
      where: { targetId: dto.targetId, status: In([AppealStatus.PENDING, AppealStatus.UNDER_REVIEW]) },
    });
    if (existing) throw new ConflictException('Já existe um recurso em análise para este conteúdo.');

    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const protocol = `GRIF-REC-${todayStr}-${randomBytes(3).toString('hex').toUpperCase()}`;
    const deadlineAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

    const appeal = await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(ModerationAppeal);
      const created = repo.create({
        protocol,
        userId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason,
        status: AppealStatus.PENDING,
        deadlineAt,
      });
      const saved = await repo.save(created);
      await this.audit.record(manager, userId, 'appeal.created', 'appeal', saved.id, {
        protocol,
        targetType: dto.targetType,
        targetId: dto.targetId,
      });
      return saved;
    });

    return {
      id: appeal.id,
      protocol: appeal.protocol,
      status: appeal.status,
      deadlineAt: appeal.deadlineAt,
      createdAt: appeal.createdAt,
      message: 'Seu recurso foi registrado com sucesso. Nossa equipe tem até 15 dias para concluir a análise.',
    };
  }

  async listMyAppeals(userId: string, query: { page?: number; limit?: number }) {
    const page = query.page ?? 1, limit = query.limit ?? 10;
    const [data, total] = await this.dataSource.getRepository(ModerationAppeal).findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, meta: paginationMeta(page, limit, total) };
  }

  async listAppeals(query: { page?: number; limit?: number; status?: AppealStatus }) {
    const page = query.page ?? 1, limit = query.limit ?? 10;
    const qb = this.dataSource.getRepository(ModerationAppeal).createQueryBuilder('a');
    if (query.status) qb.andWhere('a.status = :status', { status: query.status });
    const [data, total] = await qb
      .orderBy('a.deadline_at', 'ASC')
      .addOrderBy('a.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return { data, meta: paginationMeta(page, limit, total) };
  }

  async assignAppeal(id: string, actorId: string, moderatorId: string) {
    return this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(ModerationAppeal);
      const appeal = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!appeal) throw new NotFoundException('Recurso não encontrado.');
      if (appeal.status !== AppealStatus.PENDING && appeal.status !== AppealStatus.UNDER_REVIEW) {
        throw new ConflictException('Este recurso já foi finalizado.');
      }
      if (appeal.userId === moderatorId) {
        throw new BadRequestException('Conflito de interesse: o requerente não pode avaliar o próprio recurso.');
      }
      const conflicting = await manager.query(
        `SELECT 1 FROM audit_logs WHERE target_id = $1 AND actor_id = $2 AND action IN ('post.hide', 'comment.hide', 'user.suspend', 'post.rating_changed') LIMIT 1`,
        [appeal.targetId, moderatorId],
      );
      if (conflicting.length) {
        throw new BadRequestException('Conflito de interesse: o moderador que realizou a ação original não pode avaliar este recurso.');
      }

      await repo.update(id, { moderatorId, status: AppealStatus.UNDER_REVIEW });
      await this.audit.record(manager, actorId, 'appeal.assigned', 'appeal', id, { moderatorId });
      return { id, moderatorId, status: AppealStatus.UNDER_REVIEW };
    });
  }

  async decideAppeal(id: string, actorId: string, decision: AppealStatus.ACCEPTED | AppealStatus.REJECTED, decisionNotes: string) {
    if (decisionNotes.trim().length < 5) throw new BadRequestException('Informe a fundamentação da decisão.');
    const result = await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(ModerationAppeal);
      const appeal = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!appeal) throw new NotFoundException('Recurso não encontrado.');
      if (appeal.status !== AppealStatus.PENDING && appeal.status !== AppealStatus.UNDER_REVIEW) {
        throw new ConflictException('Este recurso já foi finalizado.');
      }
      if (appeal.userId === actorId) {
        throw new BadRequestException('Conflito de interesse: o requerente não pode julgar o próprio recurso.');
      }
      const conflicting = await manager.query(
        `SELECT 1 FROM audit_logs WHERE target_id = $1 AND actor_id = $2 AND action IN ('post.hide', 'comment.hide', 'user.suspend', 'post.rating_changed') LIMIT 1`,
        [appeal.targetId, actorId],
      );
      if (conflicting.length) {
        throw new BadRequestException('Conflito de interesse: o moderador responsável pela decisão original não pode julgar o recurso.');
      }

      await repo.update(id, {
        status: decision,
        moderatorId: actorId,
        moderatorNote: decisionNotes.trim(),
        reviewedAt: new Date(),
      });

      if (decision === AppealStatus.ACCEPTED) {
        if (appeal.targetType === AppealTargetType.POST) {
          const post = await manager.getRepository(Post).findOne({ where: { id: appeal.targetId } });
          if (post && !post.moderationHidden) {
            const lastRatingLog = await manager.query(
              `SELECT details->>'oldRating' AS "oldRating" FROM audit_logs WHERE target_id = $1 AND action = 'post.rating_changed' ORDER BY created_at DESC LIMIT 1`,
              [appeal.targetId],
            );
            const restoredRating = lastRatingLog[0]?.oldRating;
            if (restoredRating) {
              await manager.getRepository(Post).update(appeal.targetId, { contentRating: restoredRating });
              await this.audit.record(manager, actorId, 'post.rating_restored', 'post', appeal.targetId, {
                restoredRating,
                reason: `Recurso ${appeal.protocol} aceito: ${decisionNotes.trim()}`,
              });
            }
          } else {
            await manager.getRepository(Post).update(appeal.targetId, { isActive: true, moderationHidden: false });
            await this.audit.record(manager, actorId, 'post.restore', 'post', appeal.targetId, { reason: `Recurso ${appeal.protocol} aceito: ${decisionNotes.trim()}` });
          }
        } else if (appeal.targetType === AppealTargetType.COMMENT) {
          await manager.getRepository(Comment).update(appeal.targetId, { isActive: true, moderationHidden: false });
          await this.audit.record(manager, actorId, 'comment.restore', 'comment', appeal.targetId, { reason: `Recurso ${appeal.protocol} aceito: ${decisionNotes.trim()}` });
        } else if (appeal.targetType === AppealTargetType.ACCOUNT) {
          await manager.getRepository(User).update(appeal.targetId, { isActive: true, moderationSuspended: false, suspensionEndsAt: null });
          await this.audit.record(manager, actorId, 'user.restore', 'user', appeal.targetId, { reason: `Recurso ${appeal.protocol} aceito: ${decisionNotes.trim()}` });
        }
      }

      await this.audit.record(manager, actorId, 'appeal.decided', 'appeal', id, {
        decision,
        protocol: appeal.protocol,
        notes: decisionNotes.trim(),
      });

      await manager.query(
        `INSERT INTO notifications(recipient_id, actor_id, type, details) VALUES ($1, $2, 'appeal_decision', $3)`,
        [
          appeal.userId,
          actorId,
          JSON.stringify({
            protocol: appeal.protocol,
            targetType: appeal.targetType,
            decision,
            notes: decisionNotes.trim(),
          }),
        ],
      );

      return { id, protocol: appeal.protocol, status: decision, reviewedAt: new Date() };
    });

    await this.cache?.invalidate();
    return result;
  }
}

