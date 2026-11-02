import { commentListQuery } from './comment-list.query.js';
import { paginationMeta } from '../../common/utils/pagination.js';
import { decodeCursor, encodeCursor } from '../../common/utils/cursor.js';
import { sanitizePlainText } from '../../common/utils/sanitize-content.js';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  async list(postId: string, page = 1, limit = 20, cursorValue?: string) {
    await this.availablePost(postId);
    const cursorMode = cursorValue !== undefined;
    const cursor = cursorMode && cursorValue !== 'start' ? decodeCursor(cursorValue) : null;
    type Presented = ReturnType<CommentsService['present']>;
    type Item = { comment: Presented; timestamp: string; replies: Presented[]; replyCount: number };
    const parameters: unknown[] = [postId, cursorMode ? limit + 1 : limit, cursorMode ? 0 : (page - 1) * limit];
    if (cursor) parameters.push(cursor.timestamp, cursor.id);
    const [result]: { items: Item[]; total: number }[] = await this.comments.query(commentListQuery(cursorMode, !!cursor), parameters);
    const hasMore = cursorMode && result.items.length > limit;
    if (hasMore) result.items.pop();
    const present = (comment: Presented): Presented => ({ ...comment,
      content: comment.isActive ? sanitizePlainText(comment.content) : 'Comentário excluído',
      createdAt: new Date(comment.createdAt), editedAt: comment.editedAt ? new Date(comment.editedAt) : null,
    });
    const data = result.items.map(item => ({ ...present(item.comment), replies: {
      data: item.replies.map(present), meta: paginationMeta(1, 5, item.replyCount),
    } }));
    if (cursorMode) {
      const last = result.items.at(-1);
      return { data, meta: { nextCursor: hasMore && last ? encodeCursor({ timestamp: last.timestamp, id: last.comment.id }) : null, hasMore } };
    }
    return { data, meta: paginationMeta(page, limit, result.total) };
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
    if (comment.authorId !== user.userId) {
      await this.comments.manager.transaction(async manager => {
        await manager.getRepository(Comment).save(comment);
        await manager.query(`INSERT INTO audit_logs (actor_id, action, target_type, target_id) VALUES ($1, 'comment.admin_updated', 'comment', $2)`, [user.userId, id]);
      });
    } else {
      await this.comments.save(comment);
    }
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
    if (comment.authorId !== user.userId) {
      await this.comments.manager.transaction(async manager => {
        await manager.getRepository(Comment).save(comment);
        await manager.query(`INSERT INTO audit_logs (actor_id, action, target_type, target_id, details) VALUES ($1, 'comment.moderated', 'comment', $2, $3::jsonb)`, [user.userId, id, JSON.stringify({ postId: comment.postId })]);
      });
    } else {
      await this.comments.save(comment);
    }
  }
}
