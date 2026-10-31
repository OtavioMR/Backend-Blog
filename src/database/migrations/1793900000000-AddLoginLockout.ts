import { MigrationInterface, QueryRunner } from 'typeorm';
export class AddLoginLockout1793900000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE users ADD failed_login_attempts integer NOT NULL DEFAULT 0, ADD login_locked_until timestamptz');
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE users DROP COLUMN login_locked_until, DROP COLUMN failed_login_attempts');
  }
}
