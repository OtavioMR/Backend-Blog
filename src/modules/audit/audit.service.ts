import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AuditLog } from './audit.entity.js';
import { paginationMeta } from '../../common/utils/pagination.js';
@Injectable()
export class AuditService {
  constructor(private readonly dataSource: DataSource) {}
  async record(manager: EntityManager, actorId: string | null, action: string, targetType: string, targetId: string, details: Record<string, unknown> = {}) {
    const repository = manager.getRepository(AuditLog);
    await repository.save(repository.create({ actorId, action, targetType, targetId, details }));
  }
  async list(page = 1, limit = 20, filters: { actorId?: string; targetId?: string; action?: string; targetType?: string; from?: string; to?: string; search?: string } = {}) {
    if (filters.from && filters.to && new Date(filters.from) > new Date(filters.to)) throw new BadRequestException('Intervalo de datas inválido.');
    const query = this.dataSource.getRepository(AuditLog).createQueryBuilder('log');
    if (filters.actorId) query.andWhere('log.actorId = :actorId', { actorId: filters.actorId });
    if (filters.targetId) query.andWhere('log.targetId = :targetId', { targetId: filters.targetId });
    if (filters.action) query.andWhere('log.action = :action', { action: filters.action });
    if (filters.targetType) query.andWhere('log.targetType = :targetType', { targetType: filters.targetType });
    if (filters.from) query.andWhere('log.createdAt >= :from', { from: filters.from });
    if (filters.to) query.andWhere('log.createdAt <= :to', { to: filters.to });
    if (filters.search?.trim()) {
      query.leftJoin('users', 'actor_search', 'actor_search.id = log.actorId AND actor_search.deleted_at IS NULL')
        .leftJoin('users', 'user_search', "log.targetType = 'user' AND user_search.id = log.targetId AND user_search.deleted_at IS NULL")
        .leftJoin('posts', 'post_search', "log.targetType = 'post' AND post_search.id = log.targetId AND post_search.deleted_at IS NULL")
        .leftJoin('comments', 'comment_search', "log.targetType = 'comment' AND comment_search.id = log.targetId AND (comment_search.is_active = true OR comment_search.moderation_hidden = true)")
        .andWhere("concat_ws(' ', log.action, actor_search.name, user_search.name, post_search.title, comment_search.content) ILIKE :search ESCAPE '\\'", { search: `%${filters.search.trim().replace(/[\\%_]/g, '\\$&')}%` });
    }
    const [items, total] = await query.orderBy('log.createdAt', 'DESC').addOrderBy('log.id', 'DESC').skip((page - 1) * limit).take(limit).getManyAndCount();
    const userIds = [...new Set(items.flatMap(item => [item.actorId, item.targetType === 'user' ? item.targetId : null]).filter((id): id is string => !!id))];
    const postIds = items.filter(item => item.targetType === 'post').map(item => item.targetId);
    const commentIds = items.filter(item => item.targetType === 'comment').map(item => item.targetId);
    const categoryIds = items.filter(item => item.targetType === 'category').map(item => item.targetId);
    const tagIds = items.filter(item => item.targetType === 'tag').map(item => item.targetId);
    const reportIds = items.filter(item => item.targetType === 'report').map(item => item.targetId);
    const names: { type: string; id: string; label: string }[] = items.length ? await this.dataSource.query(`
      SELECT 'user' AS type, id, CASE WHEN deleted_at IS NULL THEN name ELSE 'Usuário removido' END AS label FROM users WHERE id = ANY($1::uuid[])
      UNION ALL SELECT 'post', id, CASE WHEN deleted_at IS NULL THEN title ELSE 'Conteúdo indisponível' END FROM posts WHERE id = ANY($2::uuid[])
      UNION ALL SELECT 'comment', id, CASE WHEN is_active OR moderation_hidden THEN left(content, 160) ELSE 'Conteúdo indisponível' END FROM comments WHERE id = ANY($3::uuid[])
      UNION ALL SELECT 'category', id, name FROM categories WHERE id = ANY($4::uuid[])
      UNION ALL SELECT 'tag', id, name FROM tags WHERE id = ANY($5::uuid[])
      UNION ALL SELECT 'report', id, left(reason, 160) FROM reports WHERE id = ANY($6::uuid[])
    `, [userIds, postIds, commentIds, categoryIds, tagIds, reportIds]) : [];
    const labels = new Map(names.map(row => [`${row.type}:${row.id}`, row.label]));
    return { data: items.map(item => ({ id: item.id, actorId: item.actorId, action: item.action, targetType: item.targetType, targetId: item.targetId, details: item.details, createdAt: item.createdAt, actorName: item.actorId ? labels.get(`user:${item.actorId}`) ?? 'Usuário removido' : null,
      targetLabel: labels.get(`${item.targetType}:${item.targetId}`) ?? null })), meta: paginationMeta(page, limit, total) };
  }
}
