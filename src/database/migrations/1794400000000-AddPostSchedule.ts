import { MigrationInterface, QueryRunner } from 'typeorm';
export class AddPostSchedule1794400000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE posts ADD COLUMN scheduled_at timestamptz NULL');
    await queryRunner.query('CREATE INDEX idx_posts_scheduled_at ON posts (scheduled_at) WHERE scheduled_at IS NOT NULL AND published = false AND is_active = true AND deleted_at IS NULL');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX idx_posts_scheduled_at');
    await queryRunner.query('ALTER TABLE posts DROP COLUMN scheduled_at');
  }
}
