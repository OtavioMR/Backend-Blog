import { paginationMeta } from '../../common/utils/pagination.js';
import { sanitizePlainText } from '../../common/utils/sanitize-content.js';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Comment } from './entities/comment.entity.js';
import { Post } from '../posts/entities/post.entity.js';
import { UserRole } from '../users/enums/user.enum.js';
import type { AuthenticatedUser } from '../auth/interfaces/request-with-user.interface.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment) private readonly comments: Repository<Comment>,
    @InjectRepository(Post) private readonly posts: Repository<Post>,
  ) {}

  private async availablePost(id: string, requireComments = true): Promise<Post> {
    const post = await this.posts.findOne({
      where: { id, isActive: true, published: true },
    });
    if (!post) throw new NotFoundException('Post não encontrado.');
    if (requireComments && !post.commentsEnabled)
      throw new ForbiddenException('Comentários desativados neste post.');
    return post;
  }

  private present(comment: Comment) {
    return {
      id: comment.id,
      postId: comment.postId,
      rootId: comment.rootId,
      replyToId: comment.replyToId,
      replyToAuthor: comment.replyTo?.author
        ? { id: comment.replyTo.author.id, name: comment.replyTo.author.name }
        : null,
      author: {
        id: comment.author.id,
        name: comment.author.name,
        profilePhoto: comment.author.profilePhoto,
      },
      content: comment.isActive ? sanitizePlainText(comment.content) : 'Comentário excluído',
      isActive: comment.isActive,
      editedAt: comment.editedAt,
      createdAt: comment.createdAt,
    };
  }

  private async getComment(id: string): Promise<Comment> {
    const comment = await this.comments.findOne({
      where: { id },
      relations: { author: true, replyTo: { author: true } },
      withDeleted: true,
    });
    if (!comment) throw new NotFoundException('Comentário não encontrado.');
    return comment;
  }

  async create(postId: string, dto: CreateCommentDto, user: AuthenticatedUser) {
    await this.availablePost(postId);
    if (!sanitizePlainText(dto.content)) throw new BadRequestException('Conte\u00fado inv\u00e1lido.');
    let target: Comment | null = null;
    if (dto.replyToId) {
      target = await this.getComment(dto.replyToId);
      if (target.postId !== postId || !target.isActive)
        throw new BadRequestException('Comentário respondido indisponível.');
    }
    const saved = await this.comments.save(
      this.comments.create({
        postId,
        authorId: user.userId,
        content: sanitizePlainText(dto.content),
        rootId: target ? (target.rootId ?? target.id) : null,
        replyToId: target?.id ?? null,
        isActive: true,
      }),
    );
    return this.present(await this.getComment(saved.id));
  }

  async list(postId: string, page = 1, limit = 20) {
    await this.availablePost(postId);
    const [items, total] = await this.comments.findAndCount({
      where: { postId, rootId: IsNull() },
      relations: { author: true },
      withDeleted: true,
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const rootIds = items.map((item) => item.id);
    const rows: { id: string; root_id: string; total: string }[] = rootIds.length
      ? await this.comments.query(`SELECT id, root_id, total FROM (
          SELECT id, root_id, count(*) OVER (PARTITION BY root_id) AS total,
            row_number() OVER (PARTITION BY root_id ORDER BY created_at ASC, id ASC) AS position
          FROM comments WHERE post_id = $1 AND root_id = ANY($2::uuid[])
        ) ranked WHERE position <= 5 ORDER BY root_id, position`, [postId, rootIds])
      : [];
    const replies = rows.length ? await this.comments.find({
      where: { id: In(rows.map((row) => row.id)) },
      relations: { author: true, replyTo: { author: true } },
      withDeleted: true,
    }) : [];
    const byId = new Map(replies.map((reply) => [reply.id, reply]));
    const data = items.map((item) => {
      const related = rows.filter((row) => row.root_id === item.id);
      return {
        ...this.present(item),
        replies: {
          data: related.map((row) => byId.get(row.id)).filter((reply): reply is Comment => !!reply).map((reply) => this.present(reply)),
          meta: paginationMeta(1, 5, Number(related[0]?.total ?? 0)),
        },
      };
    });
    return {
      data,
      meta: paginationMeta(page, limit, total),
    };
  }

  private async listRepliesUnchecked(
    postId: string,
    rootId: string,
    page: number,
    limit: number,
  ) {
    const [items, total] = await this.comments.findAndCount({
      where: { postId, rootId },
      relations: { author: true, replyTo: { author: true } },
      withDeleted: true,
      order: { createdAt: 'ASC', id: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      data: items.map((item) => this.present(item)),
      meta: paginationMeta(page, limit, total),
    };
  }

  async listReplies(postId: string, rootId: string, page = 1, limit = 5) {
    await this.availablePost(postId);
    const root = await this.getComment(rootId);
    if (root.postId !== postId || root.rootId !== null)
      throw new NotFoundException('Conversa não encontrada.');
    return this.listRepliesUnchecked(postId, rootId, page, limit);
  }

  async update(id: string, content: string, user: AuthenticatedUser) {
    const comment = await this.getComment(id);
    await this.availablePost(comment.postId);
    if (!comment.isActive)
      throw new BadRequestException('Comentário desativado.');
    if (comment.authorId !== user.userId && user.role !== UserRole.ADMIN)
      throw new ForbiddenException('Sem permissão para editar.');
    const safeContent = sanitizePlainText(content);
    if (!safeContent) throw new BadRequestException('Conte\u00fado inv\u00e1lido.');
    comment.content = safeContent;
    comment.editedAt = new Date();
    await this.comments.save(comment);
    return this.present(comment);
  }

  async remove(id: string, user: AuthenticatedUser) {
    const comment = await this.getComment(id);
    const post = await this.availablePost(comment.postId, false);
    if (!comment.isActive)
      throw new BadRequestException('Comentário já desativado.');
    if (
      comment.authorId !== user.userId &&
      post.authorId !== user.userId &&
      user.role !== UserRole.ADMIN
    )
      throw new ForbiddenException('Sem permissão para desativar.');
    comment.isActive = false;
    await this.comments.save(comment);
  }
}
