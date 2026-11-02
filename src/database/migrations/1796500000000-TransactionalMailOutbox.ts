import { MigrationInterface, QueryRunner } from 'typeorm';

export class TransactionalMailOutbox1796500000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE mail_outbox (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), payload text NOT NULL,
      expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
    await q.query('CREATE INDEX idx_mail_outbox_created ON mail_outbox(created_at, id)');
  }
  async down(q: QueryRunner): Promise<void> { await q.query('DROP TABLE mail_outbox'); }
}
