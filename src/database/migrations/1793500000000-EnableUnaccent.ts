import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnableUnaccent1793500000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS unaccent');
  }

  async down(): Promise<void> {
    // The extension may also be used by other database objects.
  }
}
