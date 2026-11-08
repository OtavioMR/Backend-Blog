import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandPostExcerpt1797500000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE posts ALTER COLUMN excerpt TYPE varchar(500)');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE posts ALTER COLUMN excerpt TYPE varchar(200)');
  }
}
