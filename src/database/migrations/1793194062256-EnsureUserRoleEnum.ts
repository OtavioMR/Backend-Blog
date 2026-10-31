import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnsureUserRoleEnum1793194062256 implements MigrationInterface {
  name = 'EnsureUserRoleEnum1793194062256';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DO $$ BEGIN
      CREATE TYPE "public"."users_role_enum" AS ENUM ('ADMIN', 'AUTHOR', 'READER');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$`);
  }

  async down(): Promise<void> {
    // The type may have existed before this migration and may still be in use.
  }
}
