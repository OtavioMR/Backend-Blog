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
  async list(page = 1, limit = 20, filters: { actorId?: string; targetId?: string; action?: string; targetType?: string; from?: string; to?: string } = {}) {
    if (filters.from && filters.to && new Date(filters.from) > new Date(filters.to)) throw new BadRequestException('Intervalo de datas inválido.');
    const query = this.dataSource.getRepository(AuditLog).createQueryBuilder('log');
    if (filters.actorId) query.andWhere('log.actorId = :actorId', { actorId: filters.actorId });
    if (filters.targetId) query.andWhere('log.targetId = :targetId', { targetId: filters.targetId });
    if (filters.action) query.andWhere('log.action = :action', { action: filters.action });
    if (filters.targetType) query.andWhere('log.targetType = :targetType', { targetType: filters.targetType });
    if (filters.from) query.andWhere('log.createdAt >= :from', { from: filters.from });
    if (filters.to) query.andWhere('log.createdAt <= :to', { to: filters.to });
    const [items, total] = await query.orderBy('log.createdAt', 'DESC').addOrderBy('log.id', 'DESC').skip((page - 1) * limit).take(limit).getManyAndCount();
    return { data: items, meta: paginationMeta(page, limit, total) };
  }
}
