import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailChangeConfirmation1793600000000 implements MigrationInterface {
  name = 'AddEmailChangeConfirmation1793600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "users" ADD "pending_email" varchar(255), ADD "email_change_token_hash" varchar(64), ADD "email_change_expires_at" timestamptz, ADD "auth_version" integer NOT NULL DEFAULT 0');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN "auth_version", DROP COLUMN "email_change_expires_at", DROP COLUMN "email_change_token_hash", DROP COLUMN "pending_email"');
  }
}
