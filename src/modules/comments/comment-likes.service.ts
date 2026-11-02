import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from './entities/comment.entity.js';

@Injectable()
export class CommentLikesService {
  constructor(@InjectRepository(Comment) private readonly comments: Repository<Comment>) {}

  private async requireAvailable(id: string): Promise<void> {
    const rows: { id: string }[] = await this.comments.query(`SELECT c.id FROM comments c JOIN posts p ON p.id = c.post_id
      WHERE c.id = $1 AND c.is_active = true AND p.published = true AND p.is_active = true AND p.deleted_at IS NULL AND p.comments_enabled = true`, [id]);
    if (!rows.length) throw new NotFoundException('Comentário indisponível.');
  }
  async set(id: string, userId: string, liked: boolean): Promise<void> {
    await this.requireAvailable(id);
    if (liked) await this.comments.query('INSERT INTO comment_likes (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, userId]);
    else await this.comments.query('DELETE FROM comment_likes WHERE comment_id = $1 AND user_id = $2', [id, userId]);
  }
  async status(id: string, userId: string) {
    await this.requireAvailable(id);
    const rows: { likes: string; liked: boolean }[] = await this.comments.query(`SELECT COUNT(*)::int AS likes, COALESCE(BOOL_OR(user_id = $2), false) AS liked FROM comment_likes WHERE comment_id = $1`, [id, userId]);
    return { likes: Number(rows[0].likes), liked: rows[0].liked };
  }
}
