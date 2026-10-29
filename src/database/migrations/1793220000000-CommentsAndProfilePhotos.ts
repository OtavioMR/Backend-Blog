import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommentsAndProfilePhotos1793220000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "profile_photo" varchar NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "posts" ADD "comments_enabled" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(`CREATE TABLE "comments" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "post_id" uuid NOT NULL REFERENCES "posts"("id") ON DELETE RESTRICT,
      "author_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
      "root_id" uuid NULL REFERENCES "comments"("id") ON DELETE RESTRICT,
      "reply_to_id" uuid NULL REFERENCES "comments"("id") ON DELETE RESTRICT,
      "content" varchar(1000) NOT NULL,
      "is_active" boolean NOT NULL DEFAULT true,
      "edited_at" timestamptz NULL,
      "created_at" timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_comments_post_root_created_id" ON "comments" ("post_id", "root_id", "created_at", "id")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "comments"`);
    await queryRunner.query(
      `ALTER TABLE "posts" DROP COLUMN "comments_enabled"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "profile_photo"`);
  }
}
