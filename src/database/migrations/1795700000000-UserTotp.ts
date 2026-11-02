import { MigrationInterface, QueryRunner } from 'typeorm';
export class UserTotp1795700000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "totp_enabled" boolean NOT NULL DEFAULT false, ADD COLUMN "totp_secret" text, ADD COLUMN "totp_pending_secret" text, ADD COLUMN "totp_pending_expires_at" timestamptz, ADD COLUMN "totp_last_counter" bigint`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "totp_enabled", DROP COLUMN "totp_secret", DROP COLUMN "totp_pending_secret", DROP COLUMN "totp_pending_expires_at", DROP COLUMN "totp_last_counter"`);
  }
}
