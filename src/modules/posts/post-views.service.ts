import { createHmac } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { paginationMeta } from '../../common/utils/pagination.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { Post } from './entities/post.entity.js';
import { sanitizePlainText } from '../../common/utils/sanitize-content.js';

@Injectable()
export class PostViewsService {
  constructor(@InjectRepository(Post) private readonly posts: Repository<Post>, private readonly config: ConfigService) {}

  async record(postId: string, ip: string) {
    const day = new Date().toISOString().slice(0, 10);
    const hash = createHmac('sha256', this.config.getOrThrow<string>('JWT_SECRET')).update(`${day}:${ip}`).digest('hex');
    const inserted: { post_id: string }[] = await this.posts.manager.query(
      `INSERT INTO post_views (post_id, visitor_hash, viewed_on)
       SELECT id, $2, $3::date FROM posts WHERE id = $1 AND published = true AND is_active = true AND deleted_at IS NULL
       ON CONFLICT DO NOTHING RETURNING post_id`, [postId, hash, day],
    );
    if (!inserted.length && !(await this.posts.exists({ where: { id: postId, published: true, isActive: true } }))) {
      throw new NotFoundException('Artigo não encontrado.');
    }
    const totals: { total: string }[] = await this.posts.manager.query('SELECT COUNT(*)::int AS total FROM post_views WHERE post_id = $1', [postId]);
    return { counted: inserted.length > 0, total: Number(totals[0].total) };
  }

  async trending(query: PaginationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const rows: { id: string; slug: string; title: string; excerpt: string; views: string; total: string }[] = await this.posts.manager.query(
      `SELECT p.id, p.slug, p.title, p.excerpt, COUNT(*)::int AS views, COUNT(*) OVER()::int AS total
       FROM posts p JOIN post_views v ON v.post_id = p.id
       WHERE p.published = true AND p.is_active = true AND p.deleted_at IS NULL
         AND v.viewed_on >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date - 6
         AND v.viewed_on <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
       GROUP BY p.id ORDER BY views DESC, p.published_at DESC NULLS LAST, p.id DESC
       LIMIT $1 OFFSET $2`, [limit, (page - 1) * limit],
    );
    // A separate count is needed for pages beyond the last one.
    const totals: { total: string }[] = await this.posts.manager.query(
      `SELECT COUNT(DISTINCT p.id)::int AS total FROM posts p JOIN post_views v ON v.post_id = p.id
       WHERE p.published = true AND p.is_active = true AND p.deleted_at IS NULL
       AND v.viewed_on BETWEEN (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date - 6 AND (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date`,
    );
    return { data: rows.map(({ total: _total, ...post }) => ({ ...post, title: sanitizePlainText(post.title), excerpt: sanitizePlainText(post.excerpt), views: Number(post.views) })), meta: paginationMeta(page, limit, Number(totals[0].total)) };
  }
}
