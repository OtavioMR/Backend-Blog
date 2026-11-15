import { MigrationInterface, QueryRunner } from 'typeorm';

export class CoordinationIndexes1798400000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query("CREATE INDEX idx_mail_outbox_queue_ready ON mail_outbox(queue_name,next_attempt_at,created_at,id) WHERE status IN ('pending','processing')");
    await q.query("CREATE INDEX idx_mail_outbox_queue_active ON mail_outbox(queue_name,lease_until) WHERE status='processing'");
    await q.query('ALTER TABLE mail_outbox ADD CONSTRAINT chk_mail_outbox_attempts CHECK (attempts >= 0 AND max_attempts > 0)');
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE mail_outbox DROP CONSTRAINT chk_mail_outbox_attempts');
    await q.query('DROP INDEX idx_mail_outbox_queue_active');
    await q.query('DROP INDEX idx_mail_outbox_queue_ready');
  }
}
