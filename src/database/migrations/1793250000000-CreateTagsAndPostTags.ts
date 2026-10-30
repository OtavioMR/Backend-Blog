import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTagsAndPostTags1793250000000 implements MigrationInterface {
  name = 'CreateTagsAndPostTags1793250000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tags" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(50) NOT NULL,
        "slug" character varying(60) NOT NULL,
        CONSTRAINT "PK_tags_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_tags_slug" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "post_tags" (
        "post_id" uuid NOT NULL,
        "tag_id" uuid NOT NULL,
        CONSTRAINT "PK_post_tags" PRIMARY KEY ("post_id", "tag_id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "post_tags" ADD CONSTRAINT "FK_post_tags_post_id"
      FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "post_tags" ADD CONSTRAINT "FK_post_tags_tag_id"
      FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_post_tags_post_id" ON "post_tags" ("post_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_post_tags_tag_id" ON "post_tags" ("tag_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_post_tags_tag_id"`);
    await queryRunner.query(`DROP INDEX "IDX_post_tags_post_id"`);
    await queryRunner.query(
      `ALTER TABLE "post_tags" DROP CONSTRAINT "FK_post_tags_tag_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "post_tags" DROP CONSTRAINT "FK_post_tags_post_id"`,
    );
    await queryRunner.query(`DROP TABLE "post_tags"`);
    await queryRunner.query(`DROP TABLE "tags"`);
  }
}
