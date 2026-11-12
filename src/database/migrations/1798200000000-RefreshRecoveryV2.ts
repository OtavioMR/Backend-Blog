import { MigrationInterface, QueryRunner } from 'typeorm';

// Additive: legacy sessions keep protocol 1 and their current behaviour.
// Protocol 2 sessions record each rotation with AES-256-GCM encrypted result
// so a lost response can be replayed (same tokens, same deadlines) instead of
// looking like refresh-token reuse.
export class RefreshRecoveryV21798200000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "auth_sessions"
      ADD COLUMN "refresh_protocol" smallint NOT NULL DEFAULT 1,
      ADD COLUMN "refresh_generation" bigint NOT NULL DEFAULT 0,
      ADD COLUMN "recovery_proof_hash" varchar(64),
      ADD CONSTRAINT "CHK_auth_sessions_refresh_protocol" CHECK ("refresh_protocol" IN (1, 2)),
      ADD CONSTRAINT "CHK_auth_sessions_refresh_generation" CHECK ("refresh_generation" >= 0),
      ADD CONSTRAINT "CHK_auth_sessions_v2_proof" CHECK ("refresh_protocol" = 1 OR "recovery_proof_hash" IS NOT NULL)`);
    await queryRunner.query(`CREATE TABLE "auth_refresh_operations" (
      "session_id" uuid NOT NULL REFERENCES "auth_sessions"("id") ON DELETE CASCADE,
      "operation_hash" varchar(64) NOT NULL,
      "input_generation" bigint NOT NULL,
      "output_generation" bigint NOT NULL,
      "input_hash" varchar(64) NOT NULL,
      "output_hash" varchar(64) NOT NULL,
      "auth_version" integer NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "input_expires_at" timestamptz NOT NULL,
      "output_refresh_expires_at" timestamptz NOT NULL,
      "output_access_expires_at" timestamptz NOT NULL,
      "result_expires_at" timestamptz NOT NULL,
      "metadata_expires_at" timestamptz NOT NULL,
      "result_ciphertext" text,
      "key_id" varchar(32),
      "nonce" varchar(32),
      "tag" varchar(32),
      CONSTRAINT "PK_auth_refresh_operations" PRIMARY KEY ("session_id", "operation_hash"),
      CONSTRAINT "UQ_auth_refresh_operations_input_generation" UNIQUE ("session_id", "input_generation"),
      CONSTRAINT "UQ_auth_refresh_operations_input_hash" UNIQUE ("session_id", "input_hash"),
      CONSTRAINT "CHK_auth_refresh_operations_generation" CHECK ("input_generation" >= 0 AND "output_generation" = "input_generation" + 1),
      CONSTRAINT "CHK_auth_refresh_operations_deadlines" CHECK ("metadata_expires_at" >= "result_expires_at")
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_auth_refresh_operations_session_id" ON "auth_refresh_operations" ("session_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_auth_refresh_operations_result_expires_at" ON "auth_refresh_operations" ("result_expires_at") WHERE "result_ciphertext" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_auth_refresh_operations_metadata_expires_at" ON "auth_refresh_operations" ("metadata_expires_at")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "auth_refresh_operations"`);
    // Protocol 2 sessions cannot be served by the legacy cookie; end them.
    await queryRunner.query(`DELETE FROM "auth_sessions" WHERE "refresh_protocol" = 2`);
    await queryRunner.query(`ALTER TABLE "auth_sessions"
      DROP CONSTRAINT "CHK_auth_sessions_v2_proof",
      DROP CONSTRAINT "CHK_auth_sessions_refresh_generation",
      DROP CONSTRAINT "CHK_auth_sessions_refresh_protocol",
      DROP COLUMN "recovery_proof_hash",
      DROP COLUMN "refresh_generation",
      DROP COLUMN "refresh_protocol"`);
  }
}
