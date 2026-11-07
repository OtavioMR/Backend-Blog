import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReportClassification1797100000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE reports ADD COLUMN reason_category varchar(30), ADD COLUMN description varchar(2000)');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE reports DROP COLUMN description, DROP COLUMN reason_category');
  }
}
