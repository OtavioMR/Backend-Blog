import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuthorAccessRequest1797800000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE users ADD COLUMN author_access_requested_at timestamptz');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE users DROP COLUMN author_access_requested_at');
  }
}
