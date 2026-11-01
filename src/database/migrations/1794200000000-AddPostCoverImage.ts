import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPostCoverImage1794200000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE posts ADD COLUMN cover_image varchar NULL');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE posts DROP COLUMN cover_image');
  }
}
