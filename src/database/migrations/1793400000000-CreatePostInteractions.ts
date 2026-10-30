import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePostInteractions1793400000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "post_interactions" (
      "post_id" uuid NOT NULL REFERENCES "posts"("id") ON DELETE CASCADE,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "liked" boolean NOT NULL DEFAULT false,
      "saved" boolean NOT NULL DEFAULT false,
      PRIMARY KEY ("post_id", "user_id")
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_post_interactions_user_saved" ON "post_interactions" ("user_id", "saved")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "post_interactions"`);
  }
}
