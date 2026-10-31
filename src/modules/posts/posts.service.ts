import { paginationMeta } from '../../common/utils/pagination.js';
import { sanitizePostContent, sanitizePlainText } from '../../common/utils/sanitize-content.js';
import { likePattern } from '../../common/utils/like-pattern.js';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Raw, Repository } from 'typeorm';

import { Post } from './entities/post.entity.js';
import { Category } from '../categories/entities/category.entity.js';
import { TagsService } from '../tags/tags.service.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';
import { FindPostsQueryDto } from './dto/find-posts-query.dto.js';
import type { PaginatedResult } from '../../common/interfaces/paginated-result.interface.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { UserRole } from '../users/enums/user.enum.js';
import type { AuthenticatedUser } from '../auth/interfaces/request-with-user.interface.js';

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

  async findAll(query?: FindPostsQueryDto): Promise<PaginatedResult<Post>> {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 10;
    const skip = (page - 1) * limit;

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

    if (author) base.author = { name: matches(author, 'authorTerm') };
    if (categoryName || categoryId || categorySlug) {
      base.categories = {
        isActive: true,
        ...(categoryName ? { name: matches(categoryName, 'categoryNameTerm') } : {}),
        ...(categoryId ? { id: categoryId } : categorySlug ? { slug: categorySlug } : {}),
      };
    }
    if (tagSlug) base.tags = { slug: tagSlug };
    const where = search
      ? [{ ...base, title: matches(search, 'searchTerm') }, { ...base, content: matches(search, 'searchTerm') }]
      : base;

    const [data, total] = await this.postsRepository.findAndCount({
      where,
      relationLoadStrategy: 'query',
      relations: {
        author: true,
        categories: true,
        tags: true,
      },
      select: {
        id: true,
        title: true,
        excerpt: true,
        publishedAt: true,
        published: true,
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
      skip,
      take: limit,
    });

    // Garante que posts sem categoria retornem array vazio e remove categorias desativadas
    const formattedData = data.map((post) => {
      post.title = sanitizePlainText(post.title);
      post.excerpt = sanitizePlainText(post.excerpt ?? '');
      post.categories = (post.categories || []).filter((cat) => cat.isActive);
      post.tags = post.tags || [];
      return post;
    });


    return {
      data: formattedData,
      meta: paginationMeta(page, limit, total),
    };
  }

  async findMine(authorId: string, query: PaginationQueryDto): Promise<PaginatedResult<Post>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const [data, total] = await this.postsRepository.findAndCount({
      where: { authorId, isActive: true },
      relations: { author: true, categories: true, tags: true },
      select: {
        id: true, title: true, excerpt: true, publishedAt: true, published: true, commentsEnabled: true,
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
      post.title = sanitizePlainText(post.title);
      post.excerpt = sanitizePlainText(post.excerpt ?? '');
      post.categories = (post.categories || []).filter(cat => cat.isActive);
      post.tags = post.tags || [];
      return post;
    }), meta: paginationMeta(page, limit, total) };
  }

  async findById(id: string, user?: AuthenticatedUser | null): Promise<Post> {
    const post = await this.postsRepository.findOne({
      where: {
        id,
        isActive: true,
      },
      relations: {
        author: true,
        categories: true,
        tags: true,
      },
      select: {
        id: true,
        publishedAt: true,
        excerpt: true,
        authorId: true,
        title: true,
        content: true,
        published: true,
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

    if (!post || (!post.published && (!user || (user.role !== UserRole.ADMIN && post.authorId !== user.userId)))) {
      throw new NotFoundException('Artigo não encontrado.');
    }

    post.categories = (post.categories || []).filter((cat) => cat.isActive);
    post.tags = post.tags || [];
    post.title = sanitizePlainText(post.title);
    post.content = sanitizePostContent(post.content);

    return post;
  }

  async create(createPostDto: CreatePostDto, authorId: string): Promise<Post> {
    const { categoryIds, tagNames, ...postData } = createPostDto;
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

    const post = this.postsRepository.create({
      ...postData,
      excerpt: sanitizePlainText(postData.content).slice(0, 200),
      publishedAt: postData.published ? new Date() : null,
      authorId,
      isActive: true,
      categories,
      tags,
    });

    const savedPost = await this.postsRepository.save(post);
    this.logger.log(`Artigo ${savedPost.id} criado pelo usuário ${authorId}`);
    return savedPost;
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

    if (post.authorId !== user.userId && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Você não tem permissão para editar este artigo.',
      );
    }

    const { categoryIds, tagNames, ...postData } = updatePostDto;
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

    if (postData.content !== undefined) post.excerpt = sanitizePlainText(postData.content).slice(0, 200);
    if (postData.published === true && !post.published) post.publishedAt = new Date();
    if (postData.published === false || postData.isActive === false) post.publishedAt = null;
    Object.assign(post, postData);
    const savedPost = await this.postsRepository.save(post);
    this.logger.log(`Artigo ${id} atualizado pelo usuário ${user.userId}`);
    return savedPost;
  }

  async remove(id: string, user: AuthenticatedUser): Promise<void> {
    const post = await this.postsRepository.findOne({
      where: { id, isActive: true },
    });

    if (!post) {
      throw new NotFoundException('Artigo não encontrado.');
    }

    if (post.authorId !== user.userId && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Você não tem permissão para desativar este artigo.',
      );
    }

    post.published = false;
    post.isActive = false;
    await this.postsRepository.save(post);
    await this.postsRepository.softRemove(post);
    this.logger.log(`Artigo ${id} desativado pelo usuário ${user.userId}`);
  }
}
