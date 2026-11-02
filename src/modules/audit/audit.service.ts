import { Injectable } from '@nestjs/common';
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
  async list(page = 1, limit = 20) {
    const [items, total] = await this.dataSource.getRepository(AuditLog).findAndCount({ order: { createdAt: 'DESC', id: 'DESC' }, skip: (page - 1) * limit, take: limit });
    return { data: items, meta: paginationMeta(page, limit, total) };
  }
}
