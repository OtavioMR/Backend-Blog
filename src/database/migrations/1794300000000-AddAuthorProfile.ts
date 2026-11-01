import { MigrationInterface, QueryRunner } from 'typeorm';
export class AddAuthorProfile1794300000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE users ADD COLUMN bio varchar(500), ADD COLUMN website_url varchar(500), ADD COLUMN social_url varchar(500)');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE users DROP COLUMN bio, DROP COLUMN website_url, DROP COLUMN social_url');
  }
}
