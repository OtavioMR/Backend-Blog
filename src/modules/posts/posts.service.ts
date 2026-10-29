import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';

import { Post } from './entities/post.entity.js';
import { Category } from '../categories/entities/category.entity.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';
import { FindPostsQueryDto } from './dto/find-posts-query.dto.js';
import type { PaginatedResult } from '../../common/interfaces/paginated-result.interface.js';
import { UserRole } from '../users/enums/user.enum.js';
import type { AuthenticatedUser } from '../auth/interfaces/request-with-user.interface.js';

@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post)
    private readonly postsRepository: Repository<Post>,
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
  ) {}

  async findAll(
    query?: FindPostsQueryDto,
  ): Promise<PaginatedResult<Post>> {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 10;
    const skip = (page - 1) * limit;

    const categoryId = query?.categoryId?.trim();
    const categorySlug = query?.categorySlug?.trim();

    const where: FindOptionsWhere<Post> = {
      published: true,
      isActive: true,
    };

    // Aplica o filtro de categoria apenas se um ID ou slug foi explicitamente informado
    if (categoryId) {
      where.categories = { id: categoryId, isActive: true };
    } else if (categorySlug) {
      where.categories = { slug: categorySlug, isActive: true };
    }

    const [data, total] = await this.postsRepository.findAndCount({
      where,
      relations: {
        author: true,
        categories: true,
      },
      select: {
        id: true,
        title: true,
        content: true,
        published: true,
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
      },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    // Garante que posts sem categoria retornem array vazio e remove categorias desativadas
    const formattedData = data.map((post) => ({
      ...post,
      categories: (post.categories || []).filter((cat) => cat.isActive),
    }));

    const totalPages = Math.ceil(total / limit);

    return {
      data: formattedData,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async findById(id: string): Promise<Post> {
    const post = await this.postsRepository.findOne({
      where: {
        id,
        published: true,
        isActive: true,
      },
      relations: {
        author: true,
        categories: true,
      },
      select: {
        id: true,
        title: true,
        content: true,
        published: true,
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
      },
    });

    if (!post) {
      throw new NotFoundException('Artigo não encontrado.');
    }

    post.categories = (post.categories || []).filter((cat) => cat.isActive);

    return post;
  }

  async create(
    createPostDto: CreatePostDto,
    authorId: string,
  ): Promise<Post> {
    const { categoryIds, ...postData } = createPostDto;

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

    const post = this.postsRepository.create({
      ...postData,
      authorId,
      isActive: true,
      categories,
    });

    const savedPost = await this.postsRepository.save(post);
    return savedPost;
  }

  async update(
    id: string,
    updatePostDto: UpdatePostDto,
    user: AuthenticatedUser,
  ): Promise<Post> {
    const post = await this.postsRepository.findOne({
      where: { id, isActive: true },
      relations: { categories: true },
    });

    if (!post) {
      throw new NotFoundException('Artigo não encontrado.');
    }

    if (post.authorId !== user.userId && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Você não tem permissão para editar este artigo.',
      );
    }

    const { categoryIds, ...postData } = updatePostDto;

    if (postData.isActive === false) {
      post.published = false;
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

    Object.assign(post, postData);
    return this.postsRepository.save(post);
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
  }
}
