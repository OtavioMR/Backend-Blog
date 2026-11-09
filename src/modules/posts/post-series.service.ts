import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { sanitizePlainText } from '../../common/utils/sanitize-content.js';
import type { AuthenticatedUser } from '../auth/interfaces/request-with-user.interface.js';
import { isAdministrator, UserRole } from '../users/enums/user.enum.js';
import { CreateSeriesDto, UpdateSeriesDto } from './dto/series.dto.js';

type Series = { id: string; authorId: string; title: string; description: string; createdAt: Date; updatedAt: Date };
@Injectable()
export class PostSeriesService {
  constructor(private readonly db: DataSource) {}
  private async owned(manager: EntityManager, id: string, user: AuthenticatedUser): Promise<Series> {
    const rows: Series[] = await manager.query('SELECT id, author_id AS "authorId", title, description, created_at AS "createdAt", updated_at AS "updatedAt" FROM post_series WHERE id = $1 FOR UPDATE', [id]);
    if (!rows.length) throw new NotFoundException('Serie nao encontrada.');
    if (rows[0].authorId !== user.userId) throw new ForbiddenException('Apenas o autor pode editar a série.');
    return rows[0];
  }
  private title(value: string): string {
    const title = sanitizePlainText(value);
    if (!title) throw new BadRequestException('Titulo invalido.');
    return title;
  }
  async create(dto: CreateSeriesDto, user: AuthenticatedUser) {
    const rows: Series[] = await this.db.query('INSERT INTO post_series(author_id, title, description) VALUES ($1, $2, $3) RETURNING id, author_id AS "authorId", title, description, created_at AS "createdAt", updated_at AS "updatedAt"', [user.userId, this.title(dto.title), sanitizePlainText(dto.description ?? '')]);
    return rows[0];
  }
  async update(id: string, dto: UpdateSeriesDto, user: AuthenticatedUser) {
    return this.db.transaction(async manager => {
      const series = await this.owned(manager, id, user);
      const rows: Series[] = await manager.query('UPDATE post_series SET title = $2, description = $3, updated_at = now() WHERE id = $1 RETURNING id, author_id AS "authorId", title, description, created_at AS "createdAt", updated_at AS "updatedAt"', [id, dto.title === undefined ? series.title : this.title(dto.title), dto.description === undefined ? series.description : sanitizePlainText(dto.description)]);
      return rows[0];
    });
  }
  async remove(id: string, user: AuthenticatedUser) {
    await this.db.transaction(async manager => { await this.owned(manager, id, user); await manager.query('DELETE FROM post_series WHERE id = $1', [id]); });
  }
  async setItems(id: string, postIds: string[], user: AuthenticatedUser) {
    try {
      return await this.db.transaction(async manager => {
        const series = await this.owned(manager, id, user);
        const posts: { id: string }[] = postIds.length ? await manager.query('SELECT id FROM posts WHERE id = ANY($1::uuid[]) AND author_id = $2 AND is_active = true AND deleted_at IS NULL FOR UPDATE', [postIds, series.authorId]) : [];
        if (posts.length !== postIds.length) throw new BadRequestException('Todos os artigos devem estar ativos e pertencer ao autor da serie.');
        await manager.query('DELETE FROM post_series_items WHERE series_id = $1', [id]);
        if (postIds.length) await manager.query('INSERT INTO post_series_items(series_id, post_id, position) SELECT $1, item.id, item.position FROM unnest($2::uuid[]) WITH ORDINALITY AS item(id, position)', [id, postIds]);
        await manager.query('UPDATE post_series SET updated_at = now() WHERE id = $1', [id]);
        return { postIds };
      });
    } catch (error) {
      const dbError = error as { code?: string; driverError?: { code?: string } };
      if (dbError.code === '23505' || dbError.driverError?.code === '23505') throw new ConflictException('Um artigo ja pertence a outra serie.');
      throw error;
    }
  }
  async detail(id: string) {
    const rows: Series[] = await this.db.query(`SELECT s.id, s.author_id AS "authorId", s.title, s.description, s.created_at AS "createdAt", s.updated_at AS "updatedAt"
      FROM post_series s JOIN users u ON u.id = s.author_id
      WHERE s.id = $1 AND u.is_active = true AND u.deleted_at IS NULL AND u.role IN ('AUTHOR', 'ADMIN', 'SUPER_ADMIN')
      AND EXISTS (SELECT 1 FROM post_series_items si JOIN posts p ON p.id = si.post_id WHERE si.series_id = s.id AND p.published = true AND p.is_active = true AND p.deleted_at IS NULL)`, [id]);
    if (!rows.length) throw new NotFoundException('Serie nao encontrada.');
    const posts = await this.db.query(`SELECT p.id, p.slug, p.title, p.excerpt, p.published_at AS "publishedAt", si.position
      FROM post_series_items si JOIN posts p ON p.id = si.post_id
      WHERE si.series_id = $1 AND p.published = true AND p.is_active = true AND p.deleted_at IS NULL ORDER BY si.position`, [id]);
    return { ...rows[0], posts };
  }
  async forPost(postId: string) {
    const rows: { seriesId: string }[] = await this.db.query(`SELECT si.series_id AS "seriesId"
      FROM post_series_items si JOIN posts p ON p.id = si.post_id
      WHERE p.id = $1 AND p.published = true AND p.is_active = true AND p.deleted_at IS NULL`, [postId]);
    if (!rows.length) throw new NotFoundException('Serie nao encontrada para o artigo.');
    return this.detail(rows[0].seriesId);
  }
  async mine(user: AuthenticatedUser) {
    return this.db.query('SELECT id, author_id AS "authorId", title, description, created_at AS "createdAt", updated_at AS "updatedAt" FROM post_series WHERE author_id = $1 ORDER BY created_at DESC, id DESC LIMIT 100', [user.userId]);
  }
  async mineDetail(id: string, user: AuthenticatedUser) {
    return this.db.transaction(async manager => {
      const series = await this.owned(manager, id, user);
      const posts = await manager.query('SELECT p.id, p.slug, p.title, p.published, p.is_active AS "isActive", si.position FROM post_series_items si JOIN posts p ON p.id = si.post_id WHERE si.series_id = $1 ORDER BY si.position', [id]);
      return { ...series, posts };
    });
  }
}
