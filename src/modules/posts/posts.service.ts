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

@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post)
    private readonly postsRepository: Repository<Post>,
  ) {}

  async findAll(): Promise<Post[]> {
    return this.postsRepository.find({
      where: { published: true },
      relations: { author: true },
      select: {
        id: true,
        title: true,
        content: true,
        published: true,
        authorId: false,
        createdAt: true,
        updatedAt: true,
        author: {
          id: true,
          name: true,
        },
      },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<Post> {
    const post = await this.postsRepository.findOne({
      where: {
        id,
        published: true,
      },
      relations: { author: true },
      select: {
        id: true,
        title: true,
        content: true,
        published: true,
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
    });

    const savedPost = await this.postsRepository.save(post);

    return savedPost;
  }

  async update(
    id: string,
    updatePostDto: UpdatePostDto,
    userId: string,
  ): Promise<Post> {
    const post = await this.postsRepository.findOneBy({ id });

    if (!post) {
      throw new NotFoundException('Artigo não encontrado.');
    }

    if (post.authorId !== userId) {
      throw new ForbiddenException(
        'Você não tem permissão para editar este artigo.',
      );
    }

    Object.assign(post, updatePostDto);

    return this.postsRepository.save(post);
  }

  async remove(id: string, userId: string): Promise<void> {
    const post = await this.postsRepository.findOneBy({ id });

    if (!post) {
      throw new NotFoundException('Artigo não encontrado.');
    }

    if (post.authorId !== userId) {
      throw new ForbiddenException(
        'Você não tem permissão para excluir este artigo.',
      );
    }

    await this.postsRepository.remove(post);
  }
}