import { MigrationInterface, QueryRunner } from 'typeorm';

export class TotpRecoveryGrants1797600000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE totp_recovery_grants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash varchar(64) NOT NULL UNIQUE,
      cancel_hash varchar(64) NOT NULL UNIQUE,
      auth_version integer NOT NULL,
      email varchar(255) NOT NULL,
      role varchar(20) NOT NULL,
      available_at timestamptz NOT NULL,
      expires_at timestamptz NOT NULL,
      attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
      pending_secret text,
      pending_expires_at timestamptz,
      consumed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (expires_at > available_at)
    )`);
    await queryRunner.query('CREATE INDEX IDX_totp_recovery_user ON totp_recovery_grants(user_id)');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE totp_recovery_grants');
  }
}
