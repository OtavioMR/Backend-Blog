import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReportProfilesAndWorkflow1796800000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE reports ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE RESTRICT`);
    await queryRunner.query(`DO $$ DECLARE c record; BEGIN
      FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'reports'::regclass AND contype = 'c'
        AND (pg_get_constraintdef(oid) LIKE '%post_id%comment_id%' OR pg_get_constraintdef(oid) LIKE '%status%')
      LOOP EXECUTE format('ALTER TABLE reports DROP CONSTRAINT %I', c.conname); END LOOP;
    END $$`);
    await queryRunner.query(`ALTER TABLE reports ADD CONSTRAINT reports_one_target CHECK (num_nonnulls(post_id, comment_id, user_id) = 1), ADD CONSTRAINT reports_valid_status CHECK (status IN ('PENDING', 'IN_REVIEW', 'RESOLVED', 'DISMISSED'))`);
    await queryRunner.query(`DROP INDEX "UQ_reports_pending_post"`);
    await queryRunner.query(`DROP INDEX "UQ_reports_pending_comment"`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_reports_open_post" ON reports (reporter_id, post_id) WHERE status IN ('PENDING', 'IN_REVIEW') AND post_id IS NOT NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_reports_open_comment" ON reports (reporter_id, comment_id) WHERE status IN ('PENDING', 'IN_REVIEW') AND comment_id IS NOT NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_reports_open_user" ON reports (reporter_id, user_id) WHERE status IN ('PENDING', 'IN_REVIEW') AND user_id IS NOT NULL`);
  }
  async down(): Promise<void> {
    // Reverse migration would discard profile reports and in-progress workflow state.
    throw new Error('Esta migration não pode ser revertida sem um plano de preservação dos dados de denúncias.');
  }
}
