import { MigrationInterface, QueryRunner } from 'typeorm';
export class AuthorRules1795300000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "author_rules_accepted_at" timestamptz, ADD COLUMN "author_rules_version" varchar(20), ADD COLUMN "author_promotion_blocked" boolean NOT NULL DEFAULT false`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "author_rules_accepted_at", DROP COLUMN "author_rules_version", DROP COLUMN "author_promotion_blocked"`);
  }
}
