import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { paginationMeta } from '../../common/utils/pagination.js';
import { sanitizePlainText } from '../../common/utils/sanitize-content.js';
import { Post } from './entities/post.entity.js';

@Injectable()
export class SavedCollectionsService {
  constructor(@InjectRepository(Post) private readonly posts: Repository<Post>) {}
  private async requireCollection(id: string, userId: string) {
    const found: unknown[] = await this.posts.query('SELECT id FROM saved_collections WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!found.length) throw new NotFoundException('Coleção não encontrada.');
  }
  async create(userId: string, name: string) {
    const rows: unknown[] = await this.posts.query(`INSERT INTO saved_collections (user_id, name) VALUES ($1, $2)
      ON CONFLICT (user_id, name) DO NOTHING RETURNING id, name, created_at AS "createdAt"`, [userId, name.trim()]);
    if (!rows.length) throw new ConflictException('Já existe uma coleção com esse nome.');
    return rows[0];
  }
  async list(userId: string) {
    return this.posts.query('SELECT id, name, created_at AS "createdAt" FROM saved_collections WHERE user_id = $1 ORDER BY created_at DESC, id DESC', [userId]);
  }
  async rename(id: string, userId: string, name: string) {
    try {
      const rows: unknown[] = await this.posts.query('WITH changed AS (UPDATE saved_collections SET name = $3 WHERE id = $1 AND user_id = $2 RETURNING id, name, created_at) SELECT id, name, created_at AS "createdAt" FROM changed', [id, userId, name.trim()]);
      if (!rows.length) throw new NotFoundException('Coleção não encontrada.');
      return rows[0];
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException('Já existe uma coleção com esse nome.');
      throw error;
    }
  }
  async remove(id: string, userId: string) {
    const rows: unknown[] = await this.posts.query('WITH deleted AS (DELETE FROM saved_collections WHERE id = $1 AND user_id = $2 RETURNING id) SELECT id FROM deleted', [id, userId]);
    if (!rows.length) throw new NotFoundException('Coleção não encontrada.');
  }
  async add(id: string, postId: string, userId: string) {
    await this.requireCollection(id, userId);
    const rows: unknown[] = await this.posts.query(`SELECT p.id FROM posts p JOIN post_interactions i ON i.post_id = p.id
      WHERE p.id = $1 AND i.user_id = $2 AND i.saved = true AND p.published = true AND p.is_active = true AND p.deleted_at IS NULL`, [postId, userId]);
    if (!rows.length) throw new NotFoundException('Artigo salvo não encontrado.');
    await this.posts.query('INSERT INTO saved_collection_posts (collection_id, user_id, post_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [id, userId, postId]);
  }
  async removePost(id: string, postId: string, userId: string) {
    await this.requireCollection(id, userId);
    await this.posts.query('DELETE FROM saved_collection_posts WHERE collection_id = $1 AND user_id = $2 AND post_id = $3', [id, userId, postId]);
  }
  async listPosts(id: string, userId: string, query: PaginationQueryDto) {
    await this.requireCollection(id, userId);
    const page = query.page ?? 1, limit = query.limit ?? 10;
    const where = `FROM saved_collection_posts cp JOIN post_interactions i ON i.post_id = cp.post_id AND i.user_id = cp.user_id
      JOIN posts p ON p.id = cp.post_id WHERE cp.collection_id = $1 AND cp.user_id = $2 AND i.saved = true
      AND p.published = true AND p.is_active = true AND p.deleted_at IS NULL`;
    const rows: { id: string; slug: string; title: string; excerpt: string }[] = await this.posts.query(`SELECT p.id, p.slug, p.title, p.excerpt ${where} ORDER BY cp.created_at DESC, p.id DESC LIMIT $3 OFFSET $4`, [id, userId, limit, (page - 1) * limit]);
    const total: { total: string }[] = await this.posts.query(`SELECT COUNT(*)::int AS total ${where}`, [id, userId]);
    return { data: rows.map(p => ({ ...p, title: sanitizePlainText(p.title), excerpt: sanitizePlainText(p.excerpt) })), meta: paginationMeta(page, limit, Number(total[0].total)) };
  }
}
