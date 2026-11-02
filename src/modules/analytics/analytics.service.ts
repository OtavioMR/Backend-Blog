import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class AnalyticsService {
  constructor(private readonly dataSource: DataSource) {}
  async overview() {
    const [users, posts, comments, reports] = await Promise.all([
      this.dataSource.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_active AND deleted_at IS NULL)::int AS active, COUNT(*) FILTER (WHERE email_verified AND deleted_at IS NULL)::int AS verified FROM users WHERE deleted_at IS NULL`),
      this.dataSource.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE published AND is_active)::int AS published, COUNT(*) FILTER (WHERE NOT published AND is_active)::int AS drafts FROM posts WHERE deleted_at IS NULL`),
      this.dataSource.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_active)::int AS active FROM comments`),
      this.dataSource.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending FROM reports`),
    ]);
    return { users: users[0], posts: posts[0], comments: comments[0], reports: reports[0], generatedAt: new Date().toISOString() };
  }
}
