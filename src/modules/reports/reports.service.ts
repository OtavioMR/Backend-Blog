import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { paginationMeta } from '../../common/utils/pagination.js';
import { Post } from '../posts/entities/post.entity.js';
import { Comment } from '../comments/entities/comment.entity.js';
import { AuditService } from '../audit/audit.service.js';
import { CreateReportDto, ListReportsDto, ReviewReportDto } from './reports.dto.js';
import { Report, ReportStatus, ReportTarget } from './reports.entity.js';

@Injectable()
export class ReportsService {
  constructor(@InjectRepository(Report) private readonly reports: Repository<Report>,
    @InjectRepository(Post) private readonly posts: Repository<Post>,
    @InjectRepository(Comment) private readonly comments: Repository<Comment>, private readonly audit: AuditService) {}

  async create(reporterId: string, dto: CreateReportDto) {
    const reason = dto.reason.trim();
    if (reason.length < 5) throw new BadRequestException('Informe o motivo da denúncia.');
    const post = dto.target === ReportTarget.POST
      ? await this.posts.findOne({ where: { id: dto.targetId, published: true, isActive: true, author: { isActive: true } } })
      : null;
    const comment = dto.target === ReportTarget.COMMENT
      ? await this.comments.findOne({ where: { id: dto.targetId, isActive: true, post: { published: true, isActive: true, author: { isActive: true } } } })
      : null;
    if (!post && !comment) throw new NotFoundException('Conteúdo não encontrado.');
    try {
      return await this.reports.save(this.reports.create({ reporterId, postId: post?.id ?? null, commentId: comment?.id ?? null, reason, status: ReportStatus.PENDING }));
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException('Já existe uma denúncia pendente para este conteúdo.');
      throw error;
    }
  }
  async list(query: ListReportsDto) {
    const page = query.page ?? 1, limit = query.limit ?? 20;
    const [items, total] = await this.reports.findAndCount({ where: query.status ? { status: query.status } : {}, order: { createdAt: 'DESC', id: 'DESC' }, skip: (page - 1) * limit, take: limit });
    return { data: items, meta: paginationMeta(page, limit, total) };
  }
  async review(id: string, moderatorId: string, dto: ReviewReportDto) {
    return this.reports.manager.transaction(async manager => {
      const repository = manager.getRepository(Report);
      const result = await repository.update({ id, status: ReportStatus.PENDING }, { status: dto.status, moderatorId, moderationNote: dto.note?.trim() || null, reviewedAt: new Date() });
      if (!result.affected) {
        if (!(await repository.exists({ where: { id } }))) throw new NotFoundException('Denúncia não encontrada.');
        throw new ConflictException('Denúncia já analisada.');
      }
      await this.audit.record(manager, moderatorId, 'report.review', 'report', id, { status: dto.status });
      return repository.findOneByOrFail({ id });
    });
  }
}
