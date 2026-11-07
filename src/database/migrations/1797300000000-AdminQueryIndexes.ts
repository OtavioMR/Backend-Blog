import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdminQueryIndexes1797300000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE INDEX "IDX_admin_users_created" ON users (created_at DESC, id DESC) WHERE deleted_at IS NULL');
    await queryRunner.query('CREATE INDEX "IDX_admin_posts_created" ON posts (created_at DESC, id DESC) WHERE deleted_at IS NULL');
    await queryRunner.query('CREATE INDEX "IDX_admin_posts_author" ON posts (author_id, created_at DESC) WHERE deleted_at IS NULL');
    await queryRunner.query('CREATE INDEX "IDX_admin_comments_author" ON comments (author_id, created_at DESC)');
    await queryRunner.query('CREATE INDEX "IDX_admin_reports_created" ON reports (created_at DESC, id DESC)');
    await queryRunner.query('CREATE INDEX "IDX_admin_reports_user" ON reports (user_id, created_at DESC) WHERE user_id IS NOT NULL');
    await queryRunner.query('CREATE INDEX "IDX_admin_audit_target" ON audit_logs (target_type, target_id, created_at DESC, id DESC)');
    await queryRunner.query('CREATE INDEX "IDX_admin_audit_actor" ON audit_logs (actor_id, created_at DESC, id DESC) WHERE actor_id IS NOT NULL');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    for (const name of ['IDX_admin_audit_actor', 'IDX_admin_audit_target', 'IDX_admin_reports_user', 'IDX_admin_reports_created', 'IDX_admin_comments_author', 'IDX_admin_posts_author', 'IDX_admin_posts_created', 'IDX_admin_users_created']) await queryRunner.query(`DROP INDEX "${name}"`);
  }
}
