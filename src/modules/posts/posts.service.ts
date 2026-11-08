import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { isUUID } from 'class-validator';
import { shortPostSlug } from './post-slug.js';
import { paginationMeta } from '../../common/utils/pagination.js';
import { decodeCursor, encodeCursor } from '../../common/utils/cursor.js';
import { sanitizePostContent, sanitizePlainText } from '../../common/utils/sanitize-content.js';
import { likePattern } from '../../common/utils/like-pattern.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindManyOptions, FindOptionsWhere, In, Raw, Repository } from 'typeorm';

import { Post } from './entities/post.entity.js';
import { Category } from '../categories/entities/category.entity.js';
import { TagsService } from '../tags/tags.service.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';
import { FindPostsQueryDto } from './dto/find-posts-query.dto.js';
import type { PaginatedResult } from '../../common/interfaces/paginated-result.interface.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { isAdministrator, UserRole } from '../users/enums/user.enum.js';
import type { AuthenticatedUser } from '../auth/interfaces/request-with-user.interface.js';

function readingTimeMinutes(content: string): number {
  const text = sanitizePlainText(content.replace(/<[^>]*>/g, ' '));
  return Math.max(1, Math.ceil((text ? text.split(/\s+/u).length : 0) / 200));
}

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  constructor(
    @InjectRepository(Post)
    private readonly postsRepository: Repository<Post>,
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
    private readonly tagsService: TagsService,
  ) {}

  private validateSchedule(value: string | null | undefined, published?: boolean): Date | null {
    if (value == null) return null;
    const date = new Date(value);
    if (published || !Number.isFinite(date.getTime()) || date.getTime() <= Date.now() || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
      throw new BadRequestException('O agendamento exige um rascunho e uma data futura com fuso horário.');
    }
    return date;
  }

  async findAll(query?: FindPostsQueryDto): Promise<PaginatedResult<Post> | { data: Post[]; meta: { nextCursor: string | null; hasMore: boolean } }> {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 10;
    const skip = (page - 1) * limit;

    const authorId = query?.authorId?.trim();
    const categoryId = query?.categoryId?.trim();
    const categorySlug = query?.categorySlug?.trim();
    const tagSlug = query?.tagSlug?.trim();

    const base: FindOptionsWhere<Post> = { published: true, isActive: true };

    const search = query?.search?.trim();
    const author = query?.author?.trim();
    const categoryName = query?.categoryName?.trim();
    // Escape LIKE metacharacters so the input is always interpreted literally.
    const matches = (value: string, key: string) => Raw(
      (column) => `unaccent(${column}) ILIKE unaccent(:${key}) ESCAPE '\\'`,
      { [key]: likePattern(value) },
    );

    if (authorId) base.authorId = authorId;
    if (author) base.author = { name: matches(author, 'authorTerm') };
    if (categoryName || categoryId || categorySlug) {
      base.categories = {
        isActive: true,
        ...(categoryName ? { name: matches(categoryName, 'categoryNameTerm') } : {}),
        ...(categoryId ? { id: categoryId } : categorySlug ? { slug: categorySlug } : {}),
      };
    }
    if (tagSlug) base.tags = { slug: tagSlug };
    const cursorMode = query?.cursor !== undefined;
    const cursor = cursorMode && query.cursor !== 'start' ? decodeCursor(query.cursor!) : null;
    if (search || cursor) base.id = Raw(
      (column) => [
        search ? `${column} IN (SELECT id FROM posts WHERE search_vector @@ websearch_to_tsquery('blog_portuguese'::regconfig, :searchTerm) OR search_text LIKE blog_search_text(:partialTerm) ESCAPE '\\')` : '',
        cursor ? `(${column.replace(/\.id$/, '.publishedAt')}, ${column}) < (CAST(:cursorTime AS timestamptz), CAST(:cursorId AS uuid))` : '',
      ].filter(Boolean).join(' AND '),
      { ...(search ? { searchTerm: search, partialTerm: likePattern(search) } : {}), ...(cursor ? { cursorTime: cursor.timestamp, cursorId: cursor.id } : {}) },
    );
    const where = base;

    const options: FindManyOptions<Post> = {
      where,
      relationLoadStrategy: 'query',
      relations: {
        author: true,
        categories: true,
        tags: true,
      },
      select: {
        id: true,
        slug: true,
        title: true,
        content: true,
        excerpt: true,
        coverImage: true,
        publishedAt: true,
        published: true,
        reviewStatus: true,
        commentsEnabled: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        author: {
          id: true,
          name: true,
        },
        categories: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
        },
        tags: { id: true, name: true, slug: true },
      },
      order: { publishedAt: 'DESC', id: 'DESC' },
      ...(cursorMode ? {} : { skip }),
      take: cursorMode ? limit + 1 : limit,
    };
    const [data, total] = search && !cursorMode
      ? await this.postsRepository.createQueryBuilder('post').setFindOptions(options)
        .addSelect(`ts_rank(post.search_vector, websearch_to_tsquery('blog_portuguese'::regconfig, :searchTerm))`, 'search_rank')
        .setParameter('searchTerm', search)
        .orderBy('search_rank', 'DESC').addOrderBy('post.publishedAt', 'DESC').addOrderBy('post.id', 'DESC')
        .getManyAndCount()
      : cursorMode ? [await this.postsRepository.find(options), 0] as const : await this.postsRepository.findAndCount(options);

    const hasMore = cursorMode && data.length > limit;
    if (hasMore) data.pop();

    // Garante que posts sem categoria retornem array vazio e remove categorias desativadas
    const formattedData = data.map((post) => {
      Object.assign(post, { readingTimeMinutes: readingTimeMinutes(post.content ?? '') });
      delete (post as Partial<Post>).content;
      post.title = sanitizePlainText(post.title);
      post.excerpt = sanitizePlainText(post.excerpt ?? '');
      post.categories = (post.categories || []).filter((cat) => cat.isActive);
      post.tags = post.tags || [];
      return post;
    });


    if (cursorMode) {
      let nextCursor: string | null = null;
      if (hasMore && data.length) {
        const rows: { timestamp: string }[] = await this.postsRepository.query(`SELECT to_char(published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS timestamp FROM posts WHERE id = $1`, [data[data.length - 1].id]);
        const last = data[data.length - 1];
        if (!rows[0]?.timestamp || !last.publishedAt || Date.parse(rows[0].timestamp) !== last.publishedAt.getTime()) {
          throw new ConflictException('A lista mudou durante a consulta; tente novamente.');
        }
        nextCursor = encodeCursor({ timestamp: rows[0].timestamp, id: last.id });
      }
      return { data: formattedData, meta: { nextCursor, hasMore } };
    }
    return {
      data: formattedData,
      meta: paginationMeta(page, limit, total),
    };
  }

  async authorProfile(id: string) {
    const user = await this.postsRepository.manager.getRepository('User').findOne({ where: { id, isActive: true } });
    if (!user || !(user.role === UserRole.AUTHOR || isAdministrator(user.role))) throw new NotFoundException('Autor não encontrado.');
    const publicationCount = await this.postsRepository.count({ where: { authorId: id, published: true, isActive: true } });
    return { id: user.id, name: user.name, profilePhoto: user.profilePhoto, bio: user.bio, websiteUrl: user.websiteUrl, socialUrl: user.socialUrl, publicationCount };
  }

  async findRelated(id: string): Promise<Post[]> {
    const target = await this.postsRepository.findOne({
      where: isUUID(id) ? { id, published: true, isActive: true } : [{ slug: id, published: true, isActive: true }, { legacySlug: id, published: true, isActive: true }],
      relations: { tags: true, categories: true },
    });
    if (!target) throw new NotFoundException('Artigo não encontrado.');
    const tagIds = (target.tags ?? []).map(tag => tag.id);
    const categoryIds = (target.categories ?? []).filter(category => category.isActive).map(category => category.id);
    if (!tagIds.length && !categoryIds.length) return [];
    const where: FindOptionsWhere<Post>[] = [];
    if (tagIds.length) where.push({ published: true, isActive: true, tags: { id: In(tagIds) } });
    if (categoryIds.length) where.push({ published: true, isActive: true, categories: { id: In(categoryIds), isActive: true } });
    const candidates = await this.postsRepository.find({ where, relations: { tags: true, categories: true } });
    const ranked = candidates.filter(post => post.id !== target.id).map(post => ({ post, score: (post.tags ?? []).filter(tag => tagIds.includes(tag.id)).length + (post.categories ?? []).filter(category => category.isActive && categoryIds.includes(category.id)).length }));
    ranked.sort((a, b) => b.score - a.score || (b.post.publishedAt?.getTime() ?? 0) - (a.post.publishedAt?.getTime() ?? 0) || a.post.id.localeCompare(b.post.id));
    return Promise.all(ranked.slice(0, 4).map(({ post }) => this.findById(post.id)));
  }

  async findMine(authorId: string, query: PaginationQueryDto): Promise<PaginatedResult<Post>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const [data, total] = await this.postsRepository.findAndCount({
      where: { authorId, isActive: true },
      relations: { author: true, categories: true, tags: true },
      select: {
        id: true, slug: true, title: true, content: true, excerpt: true, coverImage: true, publishedAt: true, scheduledAt: true, published: true, reviewStatus: true, commentsEnabled: true,
        isActive: true, createdAt: true, updatedAt: true,
        author: { id: true, name: true },
        categories: { id: true, name: true, slug: true, isActive: true },
        tags: { id: true, name: true, slug: true },
      },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data: data.map(post => {
      Object.assign(post, { readingTimeMinutes: readingTimeMinutes(post.content ?? '') });
      delete (post as Partial<Post>).content;
      post.title = sanitizePlainText(post.title);
      post.excerpt = sanitizePlainText(post.excerpt ?? '');
      post.categories = (post.categories || []).filter(cat => cat.isActive);
      post.tags = post.tags || [];
      return post;
    }), meta: paginationMeta(page, limit, total) };
  }

  async findById(id: string, user?: AuthenticatedUser | null): Promise<Post> {
    const post = await this.postsRepository.findOne({
      where: isUUID(id)
        ? { id, isActive: true }
        : [{ slug: id, isActive: true }, { legacySlug: id, isActive: true }],
      relations: {
        author: true,
        categories: true,
        tags: true,
      },
      select: {
        id: true,
        slug: true,
        publishedAt: true,
        scheduledAt: true,
        excerpt: true,
        coverImage: true,
        authorId: true,
        title: true,
        content: true,
        published: true,
        reviewStatus: true,
        commentsEnabled: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        author: {
          id: true,
          name: true,
        },
        categories: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
        },
        tags: { id: true, name: true, slug: true },
      },
    });

    if (!post || (!post.published && (!user || (!isAdministrator(user.role) && post.authorId !== user.userId)))) {
      throw new NotFoundException('Artigo não encontrado.');
    }

    post.categories = (post.categories || []).filter((cat) => cat.isActive);
    post.tags = post.tags || [];
    post.title = sanitizePlainText(post.title);
    post.content = sanitizePostContent(post.content);
    post.excerpt = sanitizePlainText(post.excerpt ?? '');
    Object.assign(post, { readingTimeMinutes: readingTimeMinutes(post.content ?? '') });

    if (post.published) {
      const rows: { id: string; title: string; postId: string; slug: string }[] = await this.postsRepository.query(`
        SELECT s.id, s.title, p.id AS "postId", p.slug
        FROM post_series_items current_item
        JOIN post_series s ON s.id = current_item.series_id
        JOIN users u ON u.id = s.author_id AND u.is_active = true AND u.deleted_at IS NULL AND u.role IN ('AUTHOR', 'ADMIN', 'SUPER_ADMIN')
        JOIN post_series_items item ON item.series_id = s.id
        JOIN posts p ON p.id = item.post_id AND p.published = true AND p.is_active = true AND p.deleted_at IS NULL
        WHERE current_item.post_id = $1 ORDER BY item.position`, [post.id]);
      const index = rows.findIndex(row => row.postId === post.id);
      const neighbor = (row: typeof rows[number] | undefined) => row ? { id: row.postId, slug: row.slug } : null;
      Object.assign(post, { series: index < 0 ? null : {
        id: rows[index].id, title: rows[index].title, totalParts: rows.length,
        previous: neighbor(rows[index - 1]), next: neighbor(rows[index + 1]),
      } });
    }

    return post;
  }

  async create(createPostDto: CreatePostDto, authorId: string): Promise<Post> {
    const { categoryIds, tagNames, scheduledAt, ...postData } = createPostDto;
    const schedule = this.validateSchedule(scheduledAt, postData.published);
    postData.title = sanitizePlainText(postData.title);
    postData.content = sanitizePostContent(postData.content);
    if (!postData.title || !sanitizePlainText(postData.content)) throw new BadRequestException('Conte\u00fado inv\u00e1lido.');

    let categories: Category[] = [];
    if (categoryIds && categoryIds.length > 0) {
      categories = await this.categoriesRepository.find({
        where: {
          id: In(categoryIds),
          isActive: true,
        },
      });

      if (categories.length !== categoryIds.length) {
        throw new NotFoundException(
          'Uma ou mais categorias informadas não foram encontradas ou estão inativas.',
        );
      }
    }

    const tags = await this.tagsService.resolveNames(tagNames ?? []);

    const id = randomUUID();
    const post = this.postsRepository.create({
      ...postData,
      id,
      scheduledAt: schedule,
      coverImage: null,
      slug: shortPostSlug(postData.title),
      excerpt: postData.excerpt === undefined ? sanitizePlainText(postData.content).slice(0, 200) : sanitizePlainText(postData.excerpt ?? ''),
      publishedAt: postData.published ? new Date() : null,
      authorId,
      isActive: true,
      categories,
      tags,
    });

    const baseSlug = post.slug;
    let savedPost: Post;
    for (let suffix = 1; ; suffix++) {
      post.slug = suffix === 1 ? baseSlug : `${baseSlug}-${suffix}`;
      if (await this.postsRepository.findOne({ where: { legacySlug: post.slug }, withDeleted: true, select: { id: true } })) continue;
      try {
        savedPost = await this.postsRepository.save(post);
        break;
      } catch (error) {
        const dbError = error as { driverError?: { code?: string; constraint?: string } };
        if (dbError.driverError?.code !== '23505' || dbError.driverError.constraint !== 'uq_posts_slug') throw error;
      }
    }
    this.logger.log(`Artigo ${savedPost.id} criado pelo usuário ${authorId}`);
    return Object.assign(savedPost, { readingTimeMinutes: readingTimeMinutes(savedPost.content ?? '') });
  }

  async update(
    id: string,
    updatePostDto: UpdatePostDto,
    user: AuthenticatedUser,
  ): Promise<Post> {
    const post = await this.postsRepository.findOne({
      where: { id, isActive: true },
      relations: { categories: true, tags: true },
    });

    if (!post) {
      throw new NotFoundException('Artigo não encontrado.');
    }

    if (!isAdministrator(user.role) && (post.authorId !== user.userId || user.role !== UserRole.AUTHOR)) {
      throw new ForbiddenException(
        'Você não tem permissão para editar este artigo.',
      );
    }

    const { categoryIds, tagNames, scheduledAt, ...postData } = updatePostDto;
    const schedule = scheduledAt === undefined ? undefined : this.validateSchedule(scheduledAt, postData.published ?? post.published);
    if (scheduledAt !== undefined) post.scheduledAt = schedule ?? null;
    if (postData.published === true || postData.isActive === false) post.scheduledAt = null;
    if (postData.title !== undefined) postData.title = sanitizePlainText(postData.title);
    if (postData.content !== undefined) postData.content = sanitizePostContent(postData.content);
    if (postData.title === '' || (postData.content !== undefined && !sanitizePlainText(postData.content))) throw new BadRequestException('Conte\u00fado inv\u00e1lido.');

    if (postData.isActive === false) {
      postData.published = false;
    }

    if (categoryIds !== undefined) {
      if (categoryIds.length === 0) {
        post.categories = [];
      } else {
        const categories = await this.categoriesRepository.find({
          where: {
            id: In(categoryIds),
            isActive: true,
          },
        });

        if (categories.length !== categoryIds.length) {
          throw new NotFoundException(
            'Uma ou mais categorias informadas não foram encontradas ou estão inativas.',
          );
        }

        post.categories = categories;
      }
    }

    if (tagNames !== undefined) {
      post.tags = await this.tagsService.resolveNames(tagNames);
    }

    if (postData.excerpt !== undefined) postData.excerpt = sanitizePlainText(postData.excerpt ?? '');
    if (postData.published === true && !post.published) post.publishedAt = new Date();
    if (postData.published === false || postData.isActive === false) post.publishedAt = null;
    Object.assign(post, postData);
    const savedPost = isAdministrator(user.role) && post.authorId !== user.userId
      ? await this.postsRepository.manager.transaction(async manager => {
          const saved = await manager.getRepository(Post).save(post);
          await manager.query(`INSERT INTO audit_logs (actor_id, action, target_type, target_id, details) VALUES ($1, 'post.admin_updated', 'post', $2, $3::jsonb)`, [user.userId, id, JSON.stringify({ fields: Object.keys(updatePostDto) })]);
          return saved;
        })
      : await this.postsRepository.save(post);
    this.logger.log(`Artigo ${id} atualizado pelo usuário ${user.userId}`);
    return Object.assign(savedPost, { readingTimeMinutes: readingTimeMinutes(savedPost.content ?? '') });
  }

  private async changeCover(id: string, user: AuthenticatedUser, buffer?: Buffer): Promise<{ coverImage: string | null }> {
    const post = await this.postsRepository.findOne({ where: { id, isActive: true } });
    if (!post) throw new NotFoundException('Artigo não encontrado.');
    if (!isAdministrator(user.role) && (post.authorId !== user.userId || user.role !== UserRole.AUTHOR)) throw new ForbiddenException('Sem permissão para editar este artigo.');
    if (post.reviewStatus === 'PENDING') throw new ConflictException('Artigo aguarda revisão e não pode ser editado.');

    const directory = join(process.cwd(), 'uploads', 'post-covers');
    let path: string | undefined;
    let coverImage: string | null = null;
    if (buffer) {
      let image: Buffer;
      try {
        const input = sharp(buffer, { limitInputPixels: 40_000_000, failOn: 'error' });
        const metadata = await input.metadata();
        if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) > 1) throw new Error('Invalid image');
        image = await input.rotate().resize(1920, 1080, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
      } catch {
        throw new BadRequestException('A imagem deve ser JPEG, PNG ou WebP válida.');
      }
      await mkdir(directory, { recursive: true });
      const filename = `${randomUUID()}.webp`;
      path = join(directory, filename);
      await writeFile(path, image, { flag: 'wx' });
      coverImage = `/uploads/post-covers/${filename}`;
    }
    try {
      const updateCover = (repository: Repository<Post>) => repository.createQueryBuilder().update(Post)
        .set({ coverImage })
        .where("id = :id AND is_active = true AND deleted_at IS NULL AND review_status <> 'PENDING'", { id })
        .andWhere(post.coverImage == null ? 'cover_image IS NULL' : 'cover_image = :oldCover', { oldCover: post.coverImage })
        .execute();
      const result = isAdministrator(user.role) && post.authorId !== user.userId
        ? await this.postsRepository.manager.transaction(async manager => {
            const updated = await updateCover(manager.getRepository(Post));
            if (updated.affected) await manager.query(`INSERT INTO audit_logs (actor_id, action, target_type, target_id) VALUES ($1, 'post.admin_cover_changed', 'post', $2)`, [user.userId, id]);
            return updated;
          })
        : await updateCover(this.postsRepository);
      if (!result.affected) throw new ConflictException('A capa foi alterada simultaneamente. Tente novamente.');
    } catch (error) {
      if (path) await unlink(path).catch(() => undefined);
      throw error;
    }
    const oldName = post.coverImage?.match(/^\/uploads\/post-covers\/([0-9a-f-]+\.webp)$/i)?.[1];
    if (oldName) await unlink(join(directory, oldName)).catch(() => undefined);
    return { coverImage };
  }

  uploadCover(id: string, buffer: Buffer, user: AuthenticatedUser) {
    return this.changeCover(id, user, buffer);
  }

  removeCover(id: string, user: AuthenticatedUser) {
    return this.changeCover(id, user);
  }

  async remove(id: string, user: AuthenticatedUser): Promise<void> {
    const post = await this.postsRepository.findOne({
      where: { id, isActive: true },
    });

    if (!post) {
      throw new NotFoundException('Artigo não encontrado.');
    }

    if (!isAdministrator(user.role) && (post.authorId !== user.userId || user.role !== UserRole.AUTHOR)) {
      throw new ForbiddenException(
        'Você não tem permissão para desativar este artigo.',
      );
    }

    post.published = false;
    post.scheduledAt = null;
    post.isActive = false;
    await this.postsRepository.manager.transaction(async manager => {
      const repository = manager.getRepository(Post);
      await repository.save(post);
      await repository.softRemove(post);
      await manager.query(`INSERT INTO audit_logs (actor_id, action, target_type, target_id) VALUES ($1, 'post.deleted', 'post', $2)`, [user.userId, id]);
    });
    this.logger.log(`Artigo ${id} desativado pelo usuário ${user.userId}`);
  }
}
