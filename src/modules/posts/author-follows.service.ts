import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { paginationMeta } from '../../common/utils/pagination.js';
import { sanitizePlainText } from '../../common/utils/sanitize-content.js';
import { Post } from './entities/post.entity.js';

@Injectable()
export class AuthorFollowsService {
  constructor(@InjectRepository(Post) private readonly posts: Repository<Post>) {}
  async follow(authorId: string, userId: string) {
    if (authorId === userId) throw new BadRequestException('Você não pode seguir a si mesmo.');
    const result: { author_id: string }[] = await this.posts.query(`INSERT INTO author_follows (follower_id, author_id)
      SELECT $1, id FROM users WHERE id = $2 AND is_active = true AND deleted_at IS NULL AND role IN ('AUTHOR', 'ADMIN')
      ON CONFLICT DO NOTHING RETURNING author_id`, [userId, authorId]);
    if (!result.length) {
      const author: { id: string }[] = await this.posts.query("SELECT id FROM users WHERE id = $1 AND is_active = true AND deleted_at IS NULL AND role IN ('AUTHOR', 'ADMIN')", [authorId]);
      if (!author.length) throw new NotFoundException('Autor não encontrado.');
    }
  }
  async unfollow(authorId: string, userId: string) {
    await this.posts.query('DELETE FROM author_follows WHERE follower_id = $1 AND author_id = $2', [userId, authorId]);
  }
  async status(authorId: string, userId: string) {
    const rows: { following: boolean }[] = await this.posts.query('SELECT EXISTS(SELECT 1 FROM author_follows WHERE follower_id = $1 AND author_id = $2) AS following', [userId, authorId]);
    return rows[0];
  }
  async feed(userId: string, query: PaginationQueryDto) {
    const page = query.page ?? 1, limit = query.limit ?? 10;
    const where = `FROM posts p JOIN author_follows f ON f.author_id = p.author_id JOIN users u ON u.id = p.author_id
      WHERE f.follower_id = $1 AND p.published = true AND p.is_active = true AND p.deleted_at IS NULL
      AND u.is_active = true AND u.deleted_at IS NULL AND u.role IN ('AUTHOR', 'ADMIN')`;
    const rows: { id: string; slug: string; title: string; excerpt: string; coverImage: string | null; publishedAt: Date; authorId: string; authorName: string }[] = await this.posts.query(
      `SELECT p.id, p.slug, p.title, p.excerpt, p.cover_image AS "coverImage", p.published_at AS "publishedAt", u.id AS "authorId", u.name AS "authorName" ${where}
       ORDER BY p.published_at DESC NULLS LAST, p.id DESC LIMIT $2 OFFSET $3`, [userId, limit, (page - 1) * limit]);
    const totals: { total: string }[] = await this.posts.query(`SELECT COUNT(*)::int AS total ${where}`, [userId]);
    return { data: rows.map(({ authorId, authorName, ...p }) => ({ ...p, title: sanitizePlainText(p.title), excerpt: sanitizePlainText(p.excerpt), author: { id: authorId, name: authorName } })), meta: paginationMeta(page, limit, Number(totals[0].total)) };
  }
}
