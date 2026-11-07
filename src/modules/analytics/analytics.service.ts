import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class AnalyticsService {
  constructor(private readonly dataSource: DataSource) {}
  async overview(from?: string, to?: string) {
    if (from && to && new Date(from) > new Date(to)) throw new BadRequestException('Intervalo de datas inválido.');
    const dates = [from ?? null, to ?? null];
    const [users, posts, comments, reports] = await Promise.all([
      this.dataSource.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_active)::int AS active, COUNT(*) FILTER (WHERE email_verified)::int AS verified, COUNT(*) FILTER (WHERE role = 'AUTHOR')::int AS authors, COUNT(*) FILTER (WHERE moderation_suspended)::int AS suspended, COUNT(*) FILTER (WHERE ($1::timestamptz IS NULL OR created_at >= $1) AND ($2::timestamptz IS NULL OR created_at <= $2))::int AS "createdInPeriod" FROM users WHERE deleted_at IS NULL`, dates),
      this.dataSource.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE published AND is_active)::int AS published, COUNT(*) FILTER (WHERE NOT published AND is_active)::int AS drafts, COUNT(*) FILTER (WHERE review_status = 'PENDING' AND is_active)::int AS pending, COUNT(*) FILTER (WHERE review_status = 'REJECTED' AND is_active)::int AS rejected, COUNT(*) FILTER (WHERE moderation_hidden)::int AS hidden, COUNT(*) FILTER (WHERE ($1::timestamptz IS NULL OR created_at >= $1) AND ($2::timestamptz IS NULL OR created_at <= $2))::int AS "createdInPeriod" FROM posts WHERE deleted_at IS NULL`, dates),
      this.dataSource.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_active)::int AS active, COUNT(*) FILTER (WHERE moderation_hidden)::int AS moderated FROM comments`),
      this.dataSource.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending, COUNT(*) FILTER (WHERE status = 'IN_REVIEW')::int AS "inReview", COUNT(*) FILTER (WHERE status = 'RESOLVED')::int AS resolved, COUNT(*) FILTER (WHERE status = 'DISMISSED')::int AS dismissed FROM reports`),
    ]);
    return { users: users[0], posts: posts[0], comments: comments[0], reports: reports[0], generatedAt: new Date().toISOString() };
  }
  async newsletter() {
    const [subscribers, deliveries] = await Promise.all([
      this.dataSource.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE confirmed)::int AS active, COUNT(*) FILTER (WHERE NOT confirmed AND confirmation_expires_at > now())::int AS pending, COUNT(*) FILTER (WHERE NOT confirmed AND confirmation_expires_at <= now())::int AS expired, COUNT(*) FILTER (WHERE NOT confirmed AND confirmation_expires_at IS NULL)::int AS "inactiveWithoutConfirmation" FROM newsletter_subscribers`),
      this.dataSource.query(`SELECT COUNT(*) FILTER (WHERE sent_at IS NULL)::int AS pending, COUNT(*) FILTER (WHERE sent_at IS NULL AND attempts > 0)::int AS retrying, COUNT(*) FILTER (WHERE sent_at IS NOT NULL)::int AS sent FROM newsletter_deliveries`),
    ]);
    return { subscribers: subscribers[0], deliveries: deliveries[0], generatedAt: new Date().toISOString() };
  }
  async activity(from?: string, to?: string) {
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - 30 * 86_400_000);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end || end.getTime() - start.getTime() > 366 * 86_400_000) throw new BadRequestException('Informe um intervalo válido de até 366 dias.');
    const [series, recentPosts, recentActions] = await Promise.all([
      this.dataSource.query(`WITH events AS (
        SELECT created_at, 'user' AS kind FROM users WHERE deleted_at IS NULL AND created_at >= $1 AND created_at <= $2
        UNION ALL SELECT created_at, 'post' FROM posts WHERE deleted_at IS NULL AND created_at >= $1 AND created_at <= $2
        UNION ALL SELECT created_at, 'report' FROM reports WHERE created_at >= $1 AND created_at <= $2
        UNION ALL SELECT created_at, 'subscriber' FROM newsletter_subscribers WHERE created_at >= $1 AND created_at <= $2
      ), totals AS (SELECT date_trunc('day', created_at) AS day, count(*) FILTER (WHERE kind = 'user')::int AS users,
        count(*) FILTER (WHERE kind = 'post')::int AS posts, count(*) FILTER (WHERE kind = 'report')::int AS reports,
        count(*) FILTER (WHERE kind = 'subscriber')::int AS subscribers FROM events GROUP BY 1)
      SELECT days.day::date AS day, coalesce(totals.users, 0) AS users, coalesce(totals.posts, 0) AS posts, coalesce(totals.reports, 0) AS reports, coalesce(totals.subscribers, 0) AS subscribers
      FROM generate_series(date_trunc('day', $1::timestamptz), date_trunc('day', $2::timestamptz), interval '1 day') AS days(day) LEFT JOIN totals ON totals.day = days.day ORDER BY days.day`, [start, end]),
      this.dataSource.query(`SELECT id, title, slug, author_id AS "authorId", published_at AS "publishedAt" FROM posts WHERE published = true AND is_active = true AND deleted_at IS NULL ORDER BY published_at DESC NULLS LAST, id DESC LIMIT 10`),
      this.dataSource.query(`SELECT id, actor_id AS "actorId", action, target_type AS "targetType", target_id AS "targetId", created_at AS "createdAt" FROM audit_logs WHERE actor_id IS NOT NULL ORDER BY created_at DESC, id DESC LIMIT 10`),
    ]);
    return { from: start.toISOString(), to: end.toISOString(), series, recentPosts, recentActions };
  }
}
