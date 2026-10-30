import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPasswordResetToUsers1793410000000 implements MigrationInterface {
  name = 'AddPasswordResetToUsers1793410000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "reset_password_token_hash" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "reset_password_expires_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "reset_password_expires_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "reset_password_token_hash"`,
    );
  }
}
