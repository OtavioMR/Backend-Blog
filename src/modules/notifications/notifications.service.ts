import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { paginationMeta } from '../../common/utils/pagination.js';

@Injectable()
export class NotificationsService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}
  async list(userId: string, query: PaginationQueryDto) {
    const page = query.page ?? 1, limit = query.limit ?? 10;
    const data: unknown[] = await this.users.query(`SELECT n.id, n.type, n.post_id AS "postId", n.comment_id AS "commentId", n.report_id AS "reportId", n.details, n.read_at AS "readAt", n.created_at AS "createdAt",
      CASE 
        WHEN n.type IN ('post_hidden', 'post_restored', 'comment_hidden', 'comment_restored', 'content_rating_changed', 'appeal_decision')
        THEN json_build_object('id', NULL, 'name', 'Moderação do Grifório')
        ELSE json_build_object('id', u.id, 'name', u.name)
      END AS actor
      FROM notifications n LEFT JOIN users u ON u.id = n.actor_id
      WHERE n.recipient_id = $1 ORDER BY n.created_at DESC, n.id DESC LIMIT $2 OFFSET $3`, [userId, limit, (page - 1) * limit]);
    const counts: { total: string; unread: string }[] = await this.users.query('SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE read_at IS NULL)::int AS unread FROM notifications WHERE recipient_id = $1', [userId]);
    return { data, meta: paginationMeta(page, limit, Number(counts[0].total)), unread: Number(counts[0].unread) };
  }
  async read(id: string, userId: string) {
    const rows: unknown[] = await this.users.query(`WITH updated AS (UPDATE notifications SET read_at = COALESCE(read_at, now())
      WHERE id = $1 AND recipient_id = $2 RETURNING id) SELECT id FROM updated`, [id, userId]);
    if (!rows.length) throw new NotFoundException('Notificação não encontrada.');
  }
  async readAll(userId: string) { await this.users.query('UPDATE notifications SET read_at = now() WHERE recipient_id = $1 AND read_at IS NULL', [userId]); }
}
