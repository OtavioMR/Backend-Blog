import { MigrationInterface, QueryRunner } from 'typeorm';
export class CreateAuditLogs1795500000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "audit_logs" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "actor_id" uuid REFERENCES "users"("id") ON DELETE SET NULL, "action" varchar(80) NOT NULL, "target_type" varchar(40) NOT NULL, "target_id" uuid NOT NULL, "details" jsonb NOT NULL DEFAULT '{}'::jsonb, "created_at" timestamptz NOT NULL DEFAULT now())`);
    await queryRunner.query(`CREATE INDEX "IDX_audit_logs_created" ON "audit_logs" ("created_at" DESC, "id" DESC)`);
  }
  async down(queryRunner: QueryRunner): Promise<void> { await queryRunner.query(`DROP TABLE "audit_logs"`); }
}
