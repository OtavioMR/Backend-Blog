import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from './entities/post.entity.js';

@Injectable()
export class PostSchedulerService {
  private readonly logger = new Logger(PostSchedulerService.name);
  constructor(@InjectRepository(Post) private readonly posts: Repository<Post>) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async publishDue(): Promise<void> {
    try {
      await this.posts.createQueryBuilder().update(Post)
        .set({ published: true, publishedAt: () => 'CURRENT_TIMESTAMP', scheduledAt: null })
        .where("scheduled_at <= CURRENT_TIMESTAMP AND published = false AND is_active = true AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM users WHERE users.id = author_id AND users.first_post_approved = true AND users.is_active = true AND users.role IN ('AUTHOR', 'ADMIN'))")
        .execute();
    } catch (error) {
      this.logger.error('Falha ao publicar artigos agendados', error instanceof Error ? error.stack : String(error));
    }
  }
}
