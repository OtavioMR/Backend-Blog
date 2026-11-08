import { MigrationInterface, QueryRunner } from 'typeorm';

export class RepairAdministratorPublication1797900000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE users SET first_post_approved = true WHERE role IN ('ADMIN', 'SUPER_ADMIN') AND first_post_approved = false`);
  }

  async down(): Promise<void> {
    // Approval may have existed independently of this repair, so it cannot be safely reversed.
  }
}
