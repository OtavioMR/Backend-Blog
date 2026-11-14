import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { sanitizePlainText } from '../../common/utils/sanitize-content.js';
import { likePattern } from '../../common/utils/like-pattern.js';
import { paginationMeta } from '../../common/utils/pagination.js';
import { StorageService } from '../../common/storage/storage.service.js';
import type { AuthenticatedUser } from '../auth/interfaces/request-with-user.interface.js';
import { CreateSeriesDto, FindSeriesQueryDto, UpdateSeriesDto } from './dto/series.dto.js';

type Series = { id: string; authorId: string; title: string; description: string; coverImage: string | null; aiCoverDeclaration: string; createdAt: Date; updatedAt: Date };
const fields = `s.id, s.author_id AS "authorId", s.title, s.description, s.cover_image AS "coverImage", s.ai_cover_declaration AS "aiCoverDeclaration", s.created_at AS "createdAt", s.updated_at AS "updatedAt"`;
const visible = `p.published = true AND p.is_active = true AND p.deleted_at IS NULL AND p.moderation_hidden = false`;
const activeAuthor = `u.is_active = true AND u.deleted_at IS NULL AND u.role IN ('AUTHOR', 'ADMIN', 'SUPER_ADMIN')`;
const rating = `CASE max(CASE p.content_rating WHEN '18+' THEN 18 WHEN '16+' THEN 16 WHEN '14+' THEN 14 WHEN '12+' THEN 12 WHEN '10+' THEN 10 ELSE 0 END) WHEN 18 THEN '18+' WHEN 16 THEN '16+' WHEN 14 THEN '14+' WHEN 12 THEN '12+' WHEN 10 THEN '10+' ELSE 'LIVRE' END`;

@Injectable()
export class PostSeriesService {
  constructor(private readonly db: DataSource, private readonly storage?: StorageService) {}

  private async owned(manager: EntityManager, id: string, user: AuthenticatedUser): Promise<Series> {
    const rows: Series[] = await manager.query(`SELECT ${fields} FROM post_series s WHERE s.id = $1 FOR UPDATE`, [id]);
    if (!rows.length) throw new NotFoundException('Série não encontrada.');
    if (rows[0].authorId !== user.userId) throw new ForbiddenException('Apenas o autor pode editar a série.');
    return rows[0];
  }
  private title(value: string): string {
    const title = sanitizePlainText(value);
    if (!title) throw new BadRequestException('Título inválido.');
    return title;
  }
  private checkVersion(series: Series, expected?: string) {
    if (expected && new Date(series.updatedAt).getTime() !== Date.parse(expected)) throw new ConflictException('A série mudou em outra sessão. Atualize antes de continuar.');
  }
  async create(dto: CreateSeriesDto, user: AuthenticatedUser) {
    const [series] = await this.db.query(`INSERT INTO post_series AS s(author_id, title, description, ai_cover_declaration) VALUES ($1, $2, $3, $4) RETURNING ${fields}`, [user.userId, this.title(dto.title), sanitizePlainText(dto.description ?? ''), dto.aiCoverDeclaration ?? 'NONE']);
    return series;
  }
  async update(id: string, dto: UpdateSeriesDto, user: AuthenticatedUser) {
    return this.db.transaction(async manager => {
      const series = await this.owned(manager, id, user);
      this.checkVersion(series, dto.expectedUpdatedAt);
      const [saved] = await manager.query(`UPDATE post_series AS s SET title = $2, description = $3, ai_cover_declaration = $4, updated_at = clock_timestamp() WHERE id = $1 RETURNING ${fields}`, [id, dto.title === undefined ? series.title : this.title(dto.title), dto.description === undefined ? series.description : sanitizePlainText(dto.description), dto.aiCoverDeclaration ?? series.aiCoverDeclaration]);
      // TypeORM's PostgreSQL driver returns [rows, affected] for UPDATE RETURNING.
      return Array.isArray(saved) ? saved[0] : saved;
    });
  }
  async remove(id: string, user: AuthenticatedUser) {
    const cover = await this.db.transaction(async manager => {
      const series = await this.owned(manager, id, user);
      await manager.query('DELETE FROM post_series WHERE id = $1', [id]);
      return series.coverImage;
    });
    await this.storage?.delete(cover);
  }
  async changeCover(id: string, user: AuthenticatedUser, buffer?: Buffer) {
    await this.mineDetail(id, user);
    if (!this.storage) throw new BadRequestException('Armazenamento indisponível.');
    const next = buffer ? await this.storage.processAndStorePostCover(buffer) : null;
    let old: string | null;
    try {
      old = await this.db.transaction(async manager => {
        const series = await this.owned(manager, id, user);
        await manager.query(`UPDATE post_series SET cover_image = $2,
          ai_cover_declaration = CASE WHEN $2::text IS NULL THEN 'NONE' WHEN ai_cover_declaration = 'NONE' THEN 'HUMAN_OR_PHOTO' ELSE ai_cover_declaration END,
          updated_at = clock_timestamp() WHERE id = $1`, [id, next]);
        return series.coverImage;
      });
    } catch (error) { await this.storage.delete(next); throw error; }
    await this.storage.delete(old);
    return { coverImage: next };
  }
  async setItems(id: string, postIds: string[], user: AuthenticatedUser, expectedUpdatedAt?: string) {
    try {
      return await this.db.transaction(async manager => {
        const series = await this.owned(manager, id, user);
        this.checkVersion(series, expectedUpdatedAt);
        if (postIds.length > 100 || new Set(postIds).size !== postIds.length) throw new BadRequestException('Lista de capítulos inválida.');
        const posts: { id: string }[] = postIds.length ? await manager.query('SELECT id FROM posts WHERE id = ANY($1::uuid[]) AND author_id = $2 AND is_active = true AND deleted_at IS NULL FOR UPDATE', [postIds, series.authorId]) : [];
        if (posts.length !== postIds.length) throw new BadRequestException('Todos os artigos devem estar ativos e pertencer ao autor da série.');
        await manager.query('DELETE FROM post_series_items WHERE series_id = $1', [id]);
        if (postIds.length) await manager.query('INSERT INTO post_series_items(series_id, post_id, position) SELECT $1, item.id, item.position FROM unnest($2::uuid[]) WITH ORDINALITY AS item(id, position)', [id, postIds]);
        await manager.query('UPDATE post_series SET updated_at = clock_timestamp() WHERE id = $1', [id]);
        return { postIds };
      });
    } catch (error) {
      const dbError = error as { code?: string; driverError?: { code?: string } };
      if (dbError.code === '23505' || dbError.driverError?.code === '23505') throw new ConflictException('Um artigo já pertence a outra série.');
      throw error;
    }
  }
  async publicList(query: FindSeriesQueryDto) {
    const page = query.page ?? 1, limit = query.limit ?? 10;
    const params = [query.search?.trim() ? likePattern(query.search.trim()) : null, query.authorId ?? null];
    const filter = `${activeAuthor} AND ($1::text IS NULL OR unaccent(s.title || ' ' || s.description) ILIKE unaccent($1) ESCAPE '\\') AND ($2::uuid IS NULL OR s.author_id = $2) AND EXISTS (SELECT 1 FROM post_series_items si JOIN posts p ON p.id=si.post_id WHERE si.series_id=s.id AND ${visible})`;
    const [count] = await this.db.query(`SELECT count(*)::int AS total FROM post_series s JOIN users u ON u.id=s.author_id WHERE ${filter}`, params);
    const data = await this.db.query(`SELECT ${fields}, json_build_object('id', u.id, 'name', u.name) AS author,
      stats."publishedCount", stats."contentRating", stats."aiTextCount"
      FROM post_series s JOIN users u ON u.id=s.author_id
      CROSS JOIN LATERAL (SELECT count(*)::int AS "publishedCount", ${rating} AS "contentRating",
        count(*) FILTER (WHERE p.ai_text_declaration IN ('HUMAN_WITH_AI','PARTIAL_AI','FULL_AI'))::int AS "aiTextCount",
        max(p.published_at) AS latest FROM post_series_items si JOIN posts p ON p.id=si.post_id WHERE si.series_id=s.id AND ${visible}) stats
      WHERE ${filter} ORDER BY stats.latest DESC, s.id DESC LIMIT $3 OFFSET $4`, [...params, limit, (page - 1) * limit]);
    return { data, meta: paginationMeta(page, limit, count.total) };
  }
  async detail(id: string) {
    const rows = await this.db.query(`SELECT ${fields}, json_build_object('id', u.id, 'name', u.name) AS author
      FROM post_series s JOIN users u ON u.id=s.author_id WHERE s.id=$1 AND ${activeAuthor}
      AND EXISTS (SELECT 1 FROM post_series_items si JOIN posts p ON p.id=si.post_id WHERE si.series_id=s.id AND ${visible})`, [id]);
    if (!rows.length) throw new NotFoundException('Série não encontrada.');
    const posts = await this.db.query(`SELECT p.id, p.slug, p.title,
      p.excerpt AS excerpt,
      p.cover_image AS "coverImage",
      p.content_rating AS "contentRating", p.ai_text_declaration AS "aiTextDeclaration", p.ai_cover_declaration AS "aiCoverDeclaration", p.published_at AS "publishedAt", si.position
      FROM post_series_items si JOIN posts p ON p.id=si.post_id WHERE si.series_id=$1 AND ${visible} ORDER BY si.position`, [id]);
    const ratings = ['LIVRE', '10+', '12+', '14+', '16+', '18+'];
    const contentRating = ratings[Math.max(0, ...posts.map((post: { contentRating: string }) => ratings.indexOf(post.contentRating)))];
    const aiTextCount = posts.filter((post: { aiTextDeclaration: string }) => ['HUMAN_WITH_AI', 'PARTIAL_AI', 'FULL_AI'].includes(post.aiTextDeclaration)).length;
    return { ...rows[0], posts, publishedCount: posts.length, contentRating, aiTextCount };
  }
  async forPost(postId: string) {
    const rows = await this.db.query(`SELECT si.series_id AS "seriesId" FROM post_series_items si JOIN posts p ON p.id=si.post_id WHERE p.id=$1 AND ${visible}`, [postId]);
    if (!rows.length) throw new NotFoundException('Série não encontrada para o artigo.');
    return this.detail(rows[0].seriesId);
  }
  async mine(user: AuthenticatedUser) {
    return this.db.query(`SELECT ${fields},
      (SELECT count(*)::int FROM post_series_items si JOIN posts p ON p.id=si.post_id WHERE si.series_id=s.id AND p.is_active AND p.deleted_at IS NULL) AS "chapterCount",
      (SELECT count(*)::int FROM post_series_items si JOIN posts p ON p.id=si.post_id WHERE si.series_id=s.id AND ${visible}) AS "publishedCount"
      FROM post_series s WHERE s.author_id=$1 ORDER BY s.created_at DESC, s.id DESC LIMIT 100`, [user.userId]);
  }
  async mineDetail(id: string, user: AuthenticatedUser) {
    return this.db.transaction(async manager => {
      const series = await this.owned(manager, id, user);
      const posts = await manager.query(`SELECT p.id, p.slug, p.title, p.published, p.review_status AS "reviewStatus", p.scheduled_at AS "scheduledAt", p.is_active AS "isActive", si.position
        FROM post_series_items si JOIN posts p ON p.id=si.post_id WHERE si.series_id=$1 ORDER BY si.position`, [id]);
      return { ...series, posts };
    });
  }
}
