import { Injectable, Logger, Optional } from '@nestjs/common';
import { PublicCacheService } from '../../common/public-cache.service.js';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from './entities/post.entity.js';

@Injectable()
export class PostSchedulerService {
  private readonly logger = new Logger(PostSchedulerService.name);
  constructor(@InjectRepository(Post) private readonly posts: Repository<Post>, @Optional() private readonly cache?: PublicCacheService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async publishDue(): Promise<void> {
    try {
      const result = await this.posts.createQueryBuilder().update(Post)
        .set({ published: true, publishedAt: () => 'CURRENT_TIMESTAMP', scheduledAt: null })
        .where("scheduled_at <= CURRENT_TIMESTAMP AND published = false AND is_active = true AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM users WHERE users.id = author_id AND users.first_post_approved = true AND users.is_active = true AND users.role IN ('AUTHOR', 'ADMIN', 'SUPER_ADMIN'))")
        .execute();
      if (result.affected) await this.cache?.invalidate();
    } catch (error) {
      this.logger.error('Falha ao publicar artigos agendados', error instanceof Error ? error.stack : String(error));
    }
  }
}
