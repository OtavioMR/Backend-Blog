import { MigrationInterface, QueryRunner } from 'typeorm';

export class RecoveryEmail1797700000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users
      ADD COLUMN recovery_email varchar(255),
      ADD COLUMN recovery_email_verified_at timestamptz,
      ADD COLUMN recovery_email_available_at timestamptz,
      ADD COLUMN pending_recovery_email varchar(255),
      ADD COLUMN recovery_email_token_hash varchar(64),
      ADD COLUMN recovery_email_cancel_hash varchar(64),
      ADD COLUMN recovery_email_expires_at timestamptz,
      ADD COLUMN recovery_email_auth_version integer,
      ADD CONSTRAINT CHK_recovery_email_distinct CHECK (recovery_email IS NULL OR lower(recovery_email) <> lower(email))`);
    await queryRunner.query('CREATE UNIQUE INDEX IDX_recovery_email_token ON users(recovery_email_token_hash) WHERE recovery_email_token_hash IS NOT NULL');
    await queryRunner.query('CREATE UNIQUE INDEX IDX_recovery_email_cancel ON users(recovery_email_cancel_hash) WHERE recovery_email_cancel_hash IS NOT NULL');
    await queryRunner.query('ALTER TABLE totp_recovery_grants ADD COLUMN recovery_email varchar(255)');
    // Earlier grants sent to the primary address cannot remain valid for the new policy.
    await queryRunner.query('UPDATE totp_recovery_grants SET consumed_at = now(), pending_secret = NULL WHERE consumed_at IS NULL');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE totp_recovery_grants DROP COLUMN recovery_email');
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT CHK_recovery_email_distinct,
      DROP COLUMN recovery_email, DROP COLUMN recovery_email_verified_at, DROP COLUMN recovery_email_available_at,
      DROP COLUMN pending_recovery_email, DROP COLUMN recovery_email_token_hash, DROP COLUMN recovery_email_cancel_hash,
      DROP COLUMN recovery_email_expires_at, DROP COLUMN recovery_email_auth_version`);
  }
}
