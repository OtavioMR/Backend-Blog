import { MigrationInterface, QueryRunner } from 'typeorm';
export class AddEmailVerification1793800000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE users ADD email_verified boolean NOT NULL DEFAULT true, ADD email_verification_token_hash varchar(64), ADD email_verification_expires_at timestamptz');
    await q.query('ALTER TABLE users ALTER COLUMN email_verified SET DEFAULT false');
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE users DROP COLUMN email_verification_expires_at, DROP COLUMN email_verification_token_hash, DROP COLUMN email_verified');
  }
}
