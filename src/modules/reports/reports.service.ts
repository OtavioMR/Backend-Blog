import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { paginationMeta } from '../../common/utils/pagination.js';
import { Post } from '../posts/entities/post.entity.js';
import { Comment } from '../comments/entities/comment.entity.js';
import { AuditService } from '../audit/audit.service.js';
import { CreateReportDto, ListReportsDto, ResolveReportDto, ReviewReportDto } from './reports.dto.js';
import { Report, ReportStatus, ReportTarget } from './reports.entity.js';
import { User } from '../users/entities/user.entity.js';
import { isAdministrator } from '../users/enums/user.enum.js';
import { PublicCacheService } from '../../common/public-cache.service.js';

@Injectable()
export class ReportsService {
  constructor(@InjectRepository(Report) private readonly reports: Repository<Report>,
    @InjectRepository(Post) private readonly posts: Repository<Post>,
    @InjectRepository(Comment) private readonly comments: Repository<Comment>, private readonly audit: AuditService,
    @InjectRepository(User) private readonly users: Repository<User>, @Optional() private readonly cache?: PublicCacheService) {}

  async create(reporterId: string, dto: CreateReportDto) {
    const reason = dto.reason.trim();
    if (reason.length < 5) throw new BadRequestException('Informe o motivo da denúncia.');
    const post = dto.target === ReportTarget.POST
      ? await this.posts.findOne({ where: { id: dto.targetId, published: true, isActive: true, author: { isActive: true } } })
      : null;
    const comment = dto.target === ReportTarget.COMMENT
      ? await this.comments.findOne({ where: { id: dto.targetId, isActive: true, post: { published: true, isActive: true, author: { isActive: true } } } })
      : null;
    const user = dto.target === ReportTarget.USER ? await this.users.findOne({ where: { id: dto.targetId, isActive: true } }) : null;
    if (user?.id === reporterId) throw new BadRequestException('Não é permitido denunciar o próprio perfil.');
    if (!post && !comment && !user) throw new NotFoundException('Conteúdo não encontrado.');
    try {
      return await this.reports.manager.transaction(async manager => {
        const repository = manager.getRepository(Report);
        const report = await repository.save(repository.create({ reporterId, postId: post?.id ?? null, commentId: comment?.id ?? null, userId: user?.id ?? null, reason, reasonCategory: dto.reasonCategory ?? null, description: dto.description?.trim() || null, status: ReportStatus.PENDING }));
        await this.audit.record(manager, reporterId, 'report.created', 'report', report.id, { target: dto.target, targetId: dto.targetId });
        return report;
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException('Já existe uma denúncia pendente para este conteúdo.');
      throw error;
    }
  }
  async list(query: ListReportsDto) {
    const page = query.page ?? 1, limit = query.limit ?? 20;
    if (query.from && query.to && new Date(query.from) > new Date(query.to)) throw new BadRequestException('Intervalo de datas inválido.');
    const builder = this.reports.createQueryBuilder('report');
    if (query.status) builder.andWhere('report.status = :status', { status: query.status });
    if (query.moderatorId) builder.andWhere('report.moderatorId = :moderatorId', { moderatorId: query.moderatorId });
    if (query.target === ReportTarget.POST) builder.andWhere('report.postId IS NOT NULL');
    if (query.target === ReportTarget.COMMENT) builder.andWhere('report.commentId IS NOT NULL');
    if (query.target === ReportTarget.USER) builder.andWhere('report.userId IS NOT NULL');
    if (query.from) builder.andWhere('report.createdAt >= :from', { from: query.from });
    if (query.to) builder.andWhere('report.createdAt <= :to', { to: query.to });
    const [items, total] = await builder.orderBy('report.createdAt', 'DESC').addOrderBy('report.id', 'DESC').skip((page - 1) * limit).take(limit).getManyAndCount();
    return { data: items, meta: paginationMeta(page, limit, total) };
  }
  async history(id: string, page = 1, limit = 10) {
    if (!(await this.reports.exists({ where: { id } }))) throw new NotFoundException('Denúncia não encontrada.');
    return this.audit.list(page, limit, { targetType: 'report', targetId: id });
  }
  async detail(id: string) {
    const report = await this.reports.findOne({ where: { id } });
    if (!report) throw new NotFoundException('Denúncia não encontrada.');
    const post = report.postId ? await this.posts.findOne({ where: { id: report.postId }, withDeleted: true }) : null;
    const comment = report.commentId ? await this.comments.findOne({ where: { id: report.commentId } }) : null;
    const user = report.userId ? await this.users.findOne({ where: { id: report.userId }, withDeleted: true }) : null;
    const target = post ? { type: 'POST', id: post.id, title: post.title, content: post.content, authorId: post.authorId, isActive: post.isActive, published: post.published, deletedAt: post.deletedAt } :
      comment ? { type: 'COMMENT', id: comment.id, content: comment.content, postId: comment.postId, authorId: comment.authorId, rootId: comment.rootId, replyToId: comment.replyToId, isActive: comment.isActive } :
      user ? { type: 'USER', id: user.id, name: user.name, isActive: user.isActive, deletedAt: user.deletedAt } : null;
    return { id: report.id, reporterId: report.reporterId, postId: report.postId, commentId: report.commentId, userId: report.userId,
      reason: report.reason, reasonCategory: report.reasonCategory, description: report.description, status: report.status,
      moderatorId: report.moderatorId, moderationNote: report.moderationNote, reviewedAt: report.reviewedAt, createdAt: report.createdAt, target };
  }
  async assign(id: string, actorId: string, moderatorId: string) {
    return this.reports.manager.transaction(async manager => {
      const repository = manager.getRepository(Report);
      const report = await repository.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!report) throw new NotFoundException('Denúncia não encontrada.');
      if (![ReportStatus.PENDING, ReportStatus.IN_REVIEW].includes(report.status)) throw new ConflictException('Denúncia já analisada.');
      const moderator = await manager.getRepository(User).findOne({ where: { id: moderatorId, isActive: true } });
      if (!moderator || !isAdministrator(moderator.role)) throw new BadRequestException('Moderador ativo não encontrado.');
      await repository.update(id, { status: ReportStatus.IN_REVIEW, moderatorId });
      await this.audit.record(manager, actorId, 'report.assign', 'report', id, { moderatorId, previousModeratorId: report.moderatorId });
      if (moderatorId !== actorId && report.moderatorId !== moderatorId) await manager.query("INSERT INTO notifications(recipient_id, actor_id, type, report_id) VALUES ($1, $2, 'report_assigned', $3)", [moderatorId, actorId, id]);
      return { id, status: ReportStatus.IN_REVIEW, moderatorId };
    });
  }
  async resolveWithAction(id: string, actorId: string, dto: ResolveReportDto) {
    const note = dto.note?.trim();
    if (!note || note.length < 5) throw new BadRequestException('Informe a justificativa da decisão.');
    if (dto.status === ReportStatus.DISMISSED && dto.action !== 'NONE') throw new BadRequestException('Denúncia improcedente não pode resultar em ocultação.');
    const result = await this.reports.manager.transaction(async manager => {
      const reports = manager.getRepository(Report);
      const report = await reports.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!report) throw new NotFoundException('Denúncia não encontrada.');
      if (![ReportStatus.PENDING, ReportStatus.IN_REVIEW].includes(report.status)) throw new ConflictException('Denúncia já analisada.');
      if (dto.action === 'HIDE_POST') {
        if (!report.postId) throw new BadRequestException('A denúncia não é de artigo.');
        const posts = manager.getRepository(Post);
        const post = await posts.findOne({ where: { id: report.postId }, lock: { mode: 'pessimistic_write' } });
        if (!post?.isActive || !post.published) throw new ConflictException('Artigo indisponível para ocultação.');
        await posts.update(post.id, { isActive: false, moderationHidden: true });
        await this.audit.record(manager, actorId, 'post.hide', 'post', post.id, { reason: note, reportId: id });
        if (post.authorId !== actorId) await manager.query("INSERT INTO notifications(recipient_id, actor_id, type, post_id) VALUES ($1, $2, 'post_hidden', $3)", [post.authorId, actorId, post.id]);
      }
      if (dto.action === 'HIDE_COMMENT') {
        if (!report.commentId) throw new BadRequestException('A denúncia não é de comentário.');
        const comments = manager.getRepository(Comment);
        const comment = await comments.findOne({ where: { id: report.commentId }, lock: { mode: 'pessimistic_write' } });
        if (!comment?.isActive) throw new ConflictException('Comentário indisponível para ocultação.');
        await comments.update(comment.id, { isActive: false, moderationHidden: true });
        await this.audit.record(manager, actorId, 'comment.hide', 'comment', comment.id, { reason: note, reportId: id });
        if (comment.authorId !== actorId) await manager.query("INSERT INTO notifications(recipient_id, actor_id, type, post_id, comment_id) VALUES ($1, $2, 'comment_hidden', $3, $4)", [comment.authorId, actorId, comment.postId, comment.id]);
      }
      await reports.update(id, { status: dto.status, moderatorId: actorId, moderationNote: note, reviewedAt: new Date() });
      await this.audit.record(manager, actorId, 'report.review', 'report', id, { status: dto.status, note, action: dto.action });
      return { id, status: dto.status, action: dto.action };
    });
    if (dto.action !== 'NONE') await this.cache?.invalidate();
    return result;
  }
  async review(id: string, moderatorId: string, dto: ReviewReportDto) {
    if (!dto.note || dto.note.trim().length < 5) throw new BadRequestException('Informe a justificativa da decisão.');
    return this.reports.manager.transaction(async manager => {
      const repository = manager.getRepository(Report);
      const result = await repository.update({ id, status: In([ReportStatus.PENDING, ReportStatus.IN_REVIEW]) }, { status: dto.status, moderatorId, moderationNote: dto.note?.trim() || null, reviewedAt: new Date() });
      if (!result.affected) {
        if (!(await repository.exists({ where: { id } }))) throw new NotFoundException('Denúncia não encontrada.');
        throw new ConflictException('Denúncia já analisada.');
      }
      await this.audit.record(manager, moderatorId, 'report.review', 'report', id, { status: dto.status, note: dto.note?.trim() || null });
      return repository.findOneByOrFail({ id });
    });
  }
}
