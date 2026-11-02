import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, In } from 'typeorm';
import { User } from '../users/entities/user.entity.js';
import { Post } from '../posts/entities/post.entity.js';
import { AuditService } from '../audit/audit.service.js';

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);
  constructor(private readonly dataSource: DataSource, private readonly audit: AuditService) {}
  async suspend(actorId: string, userId: string, reason: string, endsAt: string | null, hidePostIds: string[]) {
    if (actorId === userId) throw new ForbiddenException('Não é permitido suspender a própria conta.');
    const end = endsAt ? new Date(endsAt) : null;
    if (endsAt && !/(?:Z|[+-]\d{2}:\d{2})$/i.test(endsAt)) throw new BadRequestException('Informe o fuso horário do fim da suspensão.');
    if (end && (!Number.isFinite(end.getTime()) || end.getTime() <= Date.now())) throw new BadRequestException('O fim da suspensão deve estar no futuro.');
    if (reason.trim().length < 5) throw new BadRequestException('Informe o motivo.');
    if (new Set(hidePostIds).size !== hidePostIds.length) throw new BadRequestException('Há identificadores de artigos repetidos.');
    return this.dataSource.transaction(async manager => {
      const users = manager.getRepository(User);
      const user = await users.findOne({ where: { id: userId }, lock: { mode: 'pessimistic_write' } });
      if (!user) throw new NotFoundException('Usuário não encontrado.');
      if (!user.isActive) throw new ConflictException('Usuário já está inativo.');
      if (hidePostIds.length) {
        const posts = manager.getRepository(Post);
        const found = await posts.find({ where: { id: In(hidePostIds), authorId: userId, published: true, isActive: true } });
        if (found.length !== hidePostIds.length) throw new BadRequestException('Os artigos devem estar publicados e pertencer ao usuário.');
        await posts.update({ id: In(hidePostIds), authorId: userId, published: true }, { published: false, publishedAt: null, scheduledAt: null });
      }
      await users.update(userId, { isActive: false, moderationSuspended: true, suspensionEndsAt: end, authVersion: () => 'auth_version + 1' });
      await this.audit.record(manager, actorId, 'user.suspend', 'user', userId, { reason: reason.trim(), endsAt: end?.toISOString() ?? null, hiddenPostIds: hidePostIds });
      return { suspended: true, endsAt: end };
    });
  }
  async restore(actorId: string, userId: string) {
    return this.dataSource.transaction(async manager => {
      const users = manager.getRepository(User);
      const user = await users.findOne({ where: { id: userId }, lock: { mode: 'pessimistic_write' } });
      if (!user) throw new NotFoundException('Usuário não encontrado.');
      if (!user.moderationSuspended) throw new ConflictException('Usuário não está suspenso.');
      await users.update(userId, { isActive: true, moderationSuspended: false, suspensionEndsAt: null });
      await this.audit.record(manager, actorId, 'user.restore', 'user', userId);
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
  }
}
