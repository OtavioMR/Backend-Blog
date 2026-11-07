import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSuperAdminRole1796600000000 implements MigrationInterface {
  name = 'AddSuperAdminRole1796600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "public"."users_role_enum" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN'`);
  }

  async down(): Promise<void> {
    // PostgreSQL cannot remove an enum value safely without rebuilding the type.
  }
}
