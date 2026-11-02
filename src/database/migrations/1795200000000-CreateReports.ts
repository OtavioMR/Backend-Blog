import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReports1795200000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "reports" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "reporter_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
      "post_id" uuid REFERENCES "posts"("id") ON DELETE RESTRICT,
      "comment_id" uuid REFERENCES "comments"("id") ON DELETE RESTRICT,
      "reason" varchar(1000) NOT NULL,
      "status" varchar(20) NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'RESOLVED', 'DISMISSED')),
      "moderator_id" uuid REFERENCES "users"("id") ON DELETE RESTRICT,
      "moderation_note" varchar(1000), "reviewed_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      CHECK (("post_id" IS NULL) <> ("comment_id" IS NULL))
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_reports_pending_post" ON "reports" ("reporter_id", "post_id") WHERE "status" = 'PENDING' AND "post_id" IS NOT NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_reports_pending_comment" ON "reports" ("reporter_id", "comment_id") WHERE "status" = 'PENDING' AND "comment_id" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_reports_status_created" ON "reports" ("status", "created_at" DESC)`);
  }
  async down(queryRunner: QueryRunner): Promise<void> { await queryRunner.query(`DROP TABLE "reports"`); }
}
