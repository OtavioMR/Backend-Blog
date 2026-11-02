import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthSessions1795100000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "auth_sessions" (
      "id" uuid PRIMARY KEY,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "token_hash" varchar(64) NOT NULL,
      "auth_version" integer NOT NULL,
      "user_agent" varchar(500),
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "last_used_at" timestamptz NOT NULL DEFAULT now(),
      "expires_at" timestamptz NOT NULL
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_auth_sessions_user_id" ON "auth_sessions" ("user_id")`);
    await queryRunner.query(`UPDATE "users" SET "refresh_token_hash" = NULL`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "auth_sessions"`);
  }
}
