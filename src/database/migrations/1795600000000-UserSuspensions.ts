import { MigrationInterface, QueryRunner } from 'typeorm';
export class UserSuspensions1795600000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "moderation_suspended" boolean NOT NULL DEFAULT false, ADD COLUMN "suspension_ends_at" timestamptz`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "moderation_suspended", DROP COLUMN "suspension_ends_at"`);
  }
}
