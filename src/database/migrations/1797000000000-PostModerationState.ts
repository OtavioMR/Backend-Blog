import { MigrationInterface, QueryRunner } from 'typeorm';

export class PostModerationState1797000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE posts ADD COLUMN moderation_hidden boolean NOT NULL DEFAULT false');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE posts DROP COLUMN moderation_hidden');
  }
}
