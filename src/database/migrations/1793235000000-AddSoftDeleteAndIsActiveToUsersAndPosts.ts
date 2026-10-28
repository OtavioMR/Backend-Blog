import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSoftDeleteAndIsActiveToUsersAndPosts1793235000000 implements MigrationInterface {
  name = 'AddSoftDeleteAndIsActiveToUsersAndPosts1793235000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "is_active" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "deleted_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "posts" ADD COLUMN "is_active" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "posts" ADD COLUMN "deleted_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "posts" DROP COLUMN "deleted_at"`);
    await queryRunner.query(`ALTER TABLE "posts" DROP COLUMN "is_active"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deleted_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "is_active"`);
  }
}

