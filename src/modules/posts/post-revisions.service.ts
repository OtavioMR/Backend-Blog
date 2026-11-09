import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { paginationMeta } from '../../common/utils/pagination.js';
import type { AuthenticatedUser } from '../auth/interfaces/request-with-user.interface.js';
import { isAdministrator, UserRole } from '../users/enums/user.enum.js';
import { Post } from './entities/post.entity.js';
import { PostsService } from './posts.service.js';

type Revision = { id: string; title: string; content: string; createdAt: Date };

@Injectable()
export class PostRevisionsService {
  constructor(@InjectRepository(Post) private readonly posts: Repository<Post>, private readonly postService: PostsService) {}

  private async authorize(postId: string, user: AuthenticatedUser): Promise<Post> {
    const post = await this.posts.findOne({ where: { id: postId, isActive: true } });
    if (!post) throw new NotFoundException('Artigo nao encontrado.');
    if (!isAdministrator(user.role) && (user.role !== UserRole.AUTHOR || post.authorId !== user.userId)) {
      throw new ForbiddenException('Sem permissao para acessar o historico.');
    }
    return post;
  }

  async list(postId: string, user: AuthenticatedUser, query: PaginationQueryDto) {
    await this.authorize(postId, user);
    const page = query.page ?? 1, limit = query.limit ?? 10;
    const data: Omit<Revision, 'content'>[] = await this.posts.query(
      'SELECT id, title, created_at AS "createdAt" FROM post_revisions WHERE post_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3',
      [postId, limit, (page - 1) * limit],
    );
    const [{ total }]: { total: string }[] = await this.posts.query('SELECT count(*) AS total FROM post_revisions WHERE post_id = $1', [postId]);
    return { data, meta: paginationMeta(page, limit, Number(total)) };
  }

  private async revision(postId: string, revisionId: string): Promise<Revision> {
    const rows: Revision[] = await this.posts.query('SELECT id, title, content, created_at AS "createdAt" FROM post_revisions WHERE post_id = $1 AND id = $2', [postId, revisionId]);
    if (!rows.length) throw new NotFoundException('Revisao nao encontrada.');
    return rows[0];
  }

  async detail(postId: string, revisionId: string, user: AuthenticatedUser) {
    await this.authorize(postId, user);
    return this.revision(postId, revisionId);
  }

  async restore(postId: string, revisionId: string, user: AuthenticatedUser) {
    const post = await this.authorize(postId, user);
    if (post.authorId !== user.userId) {
      throw new ForbiddenException('Apenas o autor pode restaurar versões anteriores deste artigo.');
    }
    if (post.reviewStatus === 'PENDING') throw new ConflictException('Artigo aguarda revisao e nao pode ser editado.');
    const revision = await this.revision(postId, revisionId);
    return this.postService.update(postId, { title: revision.title, content: revision.content }, user);
  }
}
