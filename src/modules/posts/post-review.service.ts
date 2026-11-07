import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Post } from './entities/post.entity.js';
import { User } from '../users/entities/user.entity.js';
import { AuditService } from '../audit/audit.service.js';
import { isAdministrator, UserRole } from '../users/enums/user.enum.js';

@Injectable()
export class PostReviewService {
  constructor(private readonly dataSource: DataSource, private readonly audit: AuditService) {}
  async list() {
    return this.dataSource.getRepository(Post).find({ where: { reviewStatus: 'PENDING', isActive: true }, order: { updatedAt: 'ASC' }, take: 100 });
  }
  async result(id: string, requester: { userId: string; role: UserRole }) {
    const post = await this.dataSource.getRepository(Post).createQueryBuilder('post')
      .addSelect('post.reviewNote').where('post.id = :id', { id }).getOne();
    if (!post) throw new NotFoundException('Artigo não encontrado.');
    if (post.authorId !== requester.userId && !isAdministrator(requester.role)) throw new ForbiddenException('Sem acesso à revisão deste artigo.');
    return { status: post.reviewStatus, reason: post.reviewNote };
  }
  async submit(id: string, userId: string) {
    return this.dataSource.transaction(async manager => {
      const author = await manager.getRepository(User).findOne({ where: { id: userId }, lock: { mode: 'pessimistic_write' } });
      const post = await manager.getRepository(Post).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!post) throw new NotFoundException('Artigo não encontrado.');
      if (post.authorId !== userId || !author?.isActive || author.role !== UserRole.AUTHOR) throw new ForbiddenException('Autoria não autorizada.');
      if (author.firstPostApproved || post.published || !post.isActive || post.scheduledAt || post.reviewStatus === 'PENDING') throw new ConflictException('Artigo não elegível para revisão.');
      await manager.getRepository(Post).update(id, { reviewStatus: 'PENDING', reviewNote: null });
      return { status: 'PENDING' };
    });
  }
  async decide(id: string, decision: 'APPROVED' | 'REJECTED', actorId: string, reason?: string) {
    const note = reason?.trim() || null;
    if (decision === 'REJECTED' && (!note || note.length < 5)) throw new BadRequestException('Informe a justificativa da rejeição.');
    return this.dataSource.transaction(async manager => {
      const snapshot = await manager.getRepository(Post).findOne({ where: { id } });
      if (!snapshot) throw new NotFoundException('Artigo não encontrado.');
      if (snapshot.authorId === actorId) throw new ForbiddenException('Não é permitido revisar o próprio artigo.');
      // Serialize decisions for one author before locking individual posts.
      const author = await manager.getRepository(User).findOne({ where: { id: snapshot.authorId }, lock: { mode: 'pessimistic_write' } });
      const post = await manager.getRepository(Post).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!post) throw new NotFoundException('Artigo não encontrado.');
      if (post.authorId !== snapshot.authorId) throw new ConflictException('Autoria alterada simultaneamente.');
      if (post.reviewStatus !== 'PENDING' || !author?.isActive || author.role !== UserRole.AUTHOR || author.firstPostApproved) throw new ConflictException('Artigo ou autor não elegível para revisão.');
      if (decision === 'APPROVED') await manager.getRepository(User).update(author.id, { firstPostApproved: true });
      await manager.getRepository(Post).update(id, { reviewStatus: decision, reviewNote: decision === 'REJECTED' ? note : null, published: decision === 'APPROVED', publishedAt: decision === 'APPROVED' ? new Date() : null });
      if (decision === 'APPROVED') {
        const other = await manager.createQueryBuilder().update(Post).set({ reviewStatus: 'REJECTED', reviewNote: 'Outro primeiro artigo deste autor já foi aprovado; envie este artigo pela publicação normal.' }).where('author_id = :authorId AND review_status = :pending AND id <> :id', { authorId: author.id, pending: 'PENDING', id }).returning(['id']).execute();
        for (const row of other.raw as { id: string }[]) await this.audit.record(manager, actorId, 'post.review_superseded', 'post', row.id, { approvedPostId: id });
      }
      await this.audit.record(manager, actorId, 'post.review', 'post', id, { decision, authorId: author.id, ...(note ? { reason: note } : {}) });
      await manager.query('INSERT INTO notifications(recipient_id, actor_id, type, post_id) VALUES ($1, $2, $3, $4)', [author.id, actorId, decision === 'APPROVED' ? 'post_approved' : 'post_rejected', id]);
      return { status: decision };
    });
  }
}
