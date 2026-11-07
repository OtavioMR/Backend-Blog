import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommentModerationState1796900000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE comments ADD COLUMN moderation_hidden boolean NOT NULL DEFAULT false');
    await queryRunner.query('CREATE INDEX "IDX_comments_admin_created" ON comments (created_at DESC, id DESC)');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_comments_admin_created"');
    await queryRunner.query('ALTER TABLE comments DROP COLUMN moderation_hidden');
  }
}
