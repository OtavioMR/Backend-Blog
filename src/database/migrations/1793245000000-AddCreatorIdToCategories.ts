import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCreatorIdToCategories1793245000000 implements MigrationInterface {
  name = 'AddCreatorIdToCategories1793245000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "categories" ADD COLUMN "creator_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" ADD CONSTRAINT "FK_categories_creator_id" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_categories_creator_id" ON "categories" ("creator_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_categories_creator_id"`);
    await queryRunner.query(
      `ALTER TABLE "categories" DROP CONSTRAINT "FK_categories_creator_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" DROP COLUMN "creator_id"`,
    );
  }
}
