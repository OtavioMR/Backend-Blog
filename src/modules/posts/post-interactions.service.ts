import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from './entities/post.entity.js';
import { PostInteraction } from './entities/post-interaction.entity.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

@Injectable()
export class PostInteractionsService {
  constructor(
    @InjectRepository(Post) private readonly posts: Repository<Post>,
    @InjectRepository(PostInteraction)
    private readonly interactions: Repository<PostInteraction>,
  ) {}

  private async requirePost(postId: string): Promise<void> {
    if (
      !(await this.posts.exists({
        where: { id: postId, published: true, isActive: true },
      }))
    ) {
      throw new NotFoundException('Artigo não encontrado.');
    }
  }

  async set(
    postId: string,
    userId: string,
    field: 'liked' | 'saved',
    value: boolean,
  ): Promise<void> {
    await this.requirePost(postId);
    // Atomic upsert preserves the other flag even when requests arrive concurrently.
    await this.interactions
      .createQueryBuilder()
      .insert()
      .values({ postId, userId, [field]: value })
      .orUpdate([field], ['post_id', 'user_id'])
      .execute();
  }

  async status(postId: string, userId: string) {
    await this.requirePost(postId);
    const [interaction, likes] = await Promise.all([
      this.interactions.findOneBy({ postId, userId }),
      this.interactions.countBy({ postId, liked: true }),
    ]);
    return {
      liked: interaction?.liked ?? false,
      saved: interaction?.saved ?? false,
      likes,
    };
  }

  async saved(userId: string, query: PaginationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const [data, total] = await this.posts
      .createQueryBuilder('post')
      .innerJoin(
        PostInteraction,
        'interaction',
        'interaction.post_id = post.id AND interaction.user_id = :userId AND interaction.saved = true',
        { userId },
      )
      .where('post.published = true AND post.is_active = true')
      .select([
        'post.id',
        'post.title',
        'post.content',
        'post.published',
        'post.commentsEnabled',
        'post.isActive',
        'post.createdAt',
        'post.updatedAt',
      ])
      .orderBy('post.createdAt', 'DESC')
      .addOrderBy('post.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
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
}
