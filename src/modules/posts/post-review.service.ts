import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Post } from './entities/post.entity.js';
import { User } from '../users/entities/user.entity.js';
import { AuditService } from '../audit/audit.service.js';
import { UserRole } from '../users/enums/user.enum.js';

@Injectable()
export class PostReviewService {
  constructor(private readonly dataSource: DataSource, private readonly audit: AuditService) {}
  async list() {
    return this.dataSource.getRepository(Post).find({ where: { reviewStatus: 'PENDING', isActive: true }, order: { updatedAt: 'ASC' }, take: 100 });
  }
  async submit(id: string, userId: string) {
    return this.dataSource.transaction(async manager => {
      const post = await manager.getRepository(Post).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!post) throw new NotFoundException('Artigo não encontrado.');
      const author = await manager.getRepository(User).findOne({ where: { id: userId }, lock: { mode: 'pessimistic_write' } });
      if (post.authorId !== userId || !author?.isActive || author.role !== UserRole.AUTHOR) throw new ForbiddenException('Autoria não autorizada.');
      if (author.firstPostApproved || post.published || !post.isActive || post.scheduledAt || post.reviewStatus === 'PENDING') throw new ConflictException('Artigo não elegível para revisão.');
      await manager.getRepository(Post).update(id, { reviewStatus: 'PENDING' });
      return { status: 'PENDING' };
    });
  }
  async decide(id: string, decision: 'APPROVED' | 'REJECTED', actorId: string) {
    return this.dataSource.transaction(async manager => {
      const post = await manager.getRepository(Post).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!post) throw new NotFoundException('Artigo não encontrado.');
      const author = await manager.getRepository(User).findOne({ where: { id: post.authorId }, lock: { mode: 'pessimistic_write' } });
      if (post.reviewStatus !== 'PENDING' || !author?.isActive || author.role !== UserRole.AUTHOR || author.firstPostApproved) throw new ConflictException('Artigo ou autor não elegível para revisão.');
      if (decision === 'APPROVED') await manager.getRepository(User).update(author.id, { firstPostApproved: true });
      await manager.getRepository(Post).update(id, { reviewStatus: decision, published: decision === 'APPROVED', publishedAt: decision === 'APPROVED' ? new Date() : null });
      if (decision === 'APPROVED') await manager.createQueryBuilder().update(Post).set({ reviewStatus: 'REJECTED' }).where('author_id = :authorId AND review_status = :pending AND id <> :id', { authorId: author.id, pending: 'PENDING', id }).execute();
      await this.audit.record(manager, actorId, 'post.review', 'post', id, { decision, authorId: author.id });
      return { status: decision };
    });
  }
}
