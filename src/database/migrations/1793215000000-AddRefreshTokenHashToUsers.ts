import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefreshTokenHashToUsers1793215000000 implements MigrationInterface {
  name = 'AddRefreshTokenHashToUsers1793215000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "refresh_token_hash" character varying(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "refresh_token_hash"`,
    );
  }
}
