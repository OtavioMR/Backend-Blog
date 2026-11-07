import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationReportReference1797200000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE notifications ADD COLUMN report_id uuid REFERENCES reports(id) ON DELETE SET NULL');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE notifications DROP COLUMN report_id');
  }
}
