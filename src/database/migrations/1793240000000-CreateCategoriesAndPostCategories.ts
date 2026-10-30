import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCategoriesAndPostCategories1793240000000 implements MigrationInterface {
  name = 'CreateCategoriesAndPostCategories1793240000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "categories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(100) NOT NULL,
        "slug" character varying(120) NOT NULL,
        "description" character varying(255),
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_categories_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_categories_name" UNIQUE ("name"),
        CONSTRAINT "UQ_categories_slug" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "post_categories" (
        "post_id" uuid NOT NULL,
        "category_id" uuid NOT NULL,
        CONSTRAINT "PK_post_categories" PRIMARY KEY ("post_id", "category_id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "post_categories"
      ADD CONSTRAINT "FK_post_categories_post_id"
      FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "post_categories"
      ADD CONSTRAINT "FK_post_categories_category_id"
      FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_post_categories_post_id" ON "post_categories" ("post_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_post_categories_category_id" ON "post_categories" ("category_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_post_categories_category_id"`);
    await queryRunner.query(`DROP INDEX "IDX_post_categories_post_id"`);
    await queryRunner.query(
      `ALTER TABLE "post_categories" DROP CONSTRAINT "FK_post_categories_category_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "post_categories" DROP CONSTRAINT "FK_post_categories_post_id"`,
    );
    await queryRunner.query(`DROP TABLE "post_categories"`);
    await queryRunner.query(`DROP TABLE "categories"`);
  }
}
