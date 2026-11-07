import { MigrationInterface, QueryRunner } from 'typeorm';

export class PostReviewReason1796700000000 implements MigrationInterface {
  name = 'PostReviewReason1796700000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE posts ADD COLUMN review_note varchar(1000)');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE posts DROP COLUMN review_note');
  }
}
