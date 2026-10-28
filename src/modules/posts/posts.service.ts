import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Post } from './entities/post.entity.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import type { PaginatedResult } from '../../common/interfaces/paginated-result.interface.js';
import { UserRole } from '../users/enums/user.enum.js';
import type { AuthenticatedUser } from '../auth/interfaces/request-with-user.interface.js';

@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post)
    private readonly postsRepository: Repository<Post>,
  ) {}

  async findAll(
    paginationQuery?: PaginationQueryDto,
  ): Promise<PaginatedResult<Post>> {
    const page = paginationQuery?.page ?? 1;
    const limit = paginationQuery?.limit ?? 10;
    const skip = (page - 1) * limit;

    const [data, total] = await this.postsRepository.findAndCount({
      where: { published: true, isActive: true },
      relations: { author: true },
      select: {
        id: true,
        title: true,
        content: true,
        published: true,
        isActive: true,
        authorId: false,
        createdAt: true,
        updatedAt: true,
        author: {
          id: true,
          name: true,
        },
      },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data,
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
      relations: { author: true },
      select: {
        id: true,
        title: true,
        content: true,
        published: true,
        isActive: true,
        authorId: false,
        createdAt: true,
        updatedAt: true,
        author: {
          id: true,
          name: true,
        },
      },
    });

    if (!post) {
      throw new NotFoundException('Artigo não encontrado.');
    }

    return post;
  }

  async create(
    createPostDto: CreatePostDto,
    authorId: string,
  ): Promise<Post> {
    const post = this.postsRepository.create({
      ...createPostDto,
      authorId,
      isActive: true,
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
    });

    if (!post) {
      throw new NotFoundException('Artigo não encontrado.');
    }

    if (post.authorId !== user.userId && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Você não tem permissão para editar este artigo.',
      );
    }

    if (updatePostDto.isActive === false) {
      post.published = false;
    }

    Object.assign(post, updatePostDto);

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
