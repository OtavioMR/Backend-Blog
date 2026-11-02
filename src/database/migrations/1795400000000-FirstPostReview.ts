import { MigrationInterface, QueryRunner } from 'typeorm';
export class FirstPostReview1795400000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "first_post_approved" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`UPDATE "users" SET "first_post_approved" = true WHERE "role" IN ('AUTHOR', 'ADMIN') OR EXISTS (SELECT 1 FROM "posts" WHERE "posts"."author_id" = "users"."id" AND "posts"."published_at" IS NOT NULL)`);
    await queryRunner.query(`ALTER TABLE "posts" ADD COLUMN "review_status" varchar(20) NOT NULL DEFAULT 'DRAFT' CHECK ("review_status" IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED'))`);
    await queryRunner.query(`CREATE OR REPLACE FUNCTION check_post_review() RETURNS trigger AS $$
      DECLARE approved boolean;
      BEGIN
        IF TG_OP = 'UPDATE' AND OLD.review_status = 'PENDING' THEN
          IF NEW.review_status NOT IN ('APPROVED', 'REJECTED') OR
             (NEW.title, NEW.content, NEW.slug, NEW.excerpt, NEW.cover_image, NEW.author_id, NEW.is_active, NEW.scheduled_at)
             IS DISTINCT FROM (OLD.title, OLD.content, OLD.slug, OLD.excerpt, OLD.cover_image, OLD.author_id, OLD.is_active, OLD.scheduled_at) THEN
            RAISE EXCEPTION 'Post awaiting review cannot be edited' USING ERRCODE = '23514';
          END IF;
        END IF;
        IF NEW.published OR NEW.scheduled_at IS NOT NULL THEN
          SELECT first_post_approved INTO approved FROM users WHERE id = NEW.author_id FOR UPDATE;
          IF NOT COALESCE(approved, false) THEN RAISE EXCEPTION 'First post requires approval' USING ERRCODE = '23514'; END IF;
        END IF;
        RETURN NEW;
      END;
    $$ LANGUAGE plpgsql`);
    await queryRunner.query(`CREATE TRIGGER "TRG_post_review" BEFORE INSERT OR UPDATE ON "posts" FOR EACH ROW EXECUTE FUNCTION check_post_review()`);
    await queryRunner.query(`CREATE FUNCTION check_pending_post_relation() RETURNS trigger AS $$
      DECLARE state varchar; target uuid;
      BEGIN
        target := CASE WHEN TG_OP = 'DELETE' THEN OLD.post_id ELSE NEW.post_id END;
        SELECT review_status INTO state FROM posts WHERE id = target FOR UPDATE;
        IF state = 'PENDING' THEN RAISE EXCEPTION 'Post awaiting review cannot be edited' USING ERRCODE = '23514'; END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
      END;
    $$ LANGUAGE plpgsql`);
    await queryRunner.query(`CREATE TRIGGER "TRG_post_categories_review" BEFORE INSERT OR UPDATE OR DELETE ON "post_categories" FOR EACH ROW EXECUTE FUNCTION check_pending_post_relation()`);
    await queryRunner.query(`CREATE TRIGGER "TRG_post_tags_review" BEFORE INSERT OR UPDATE OR DELETE ON "post_tags" FOR EACH ROW EXECUTE FUNCTION check_pending_post_relation()`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER "TRG_post_categories_review" ON "post_categories"`);
    await queryRunner.query(`DROP TRIGGER "TRG_post_tags_review" ON "post_tags"`);
    await queryRunner.query(`DROP FUNCTION check_pending_post_relation()`);
    await queryRunner.query(`DROP TRIGGER "TRG_post_review" ON "posts"`);
    await queryRunner.query(`DROP FUNCTION check_post_review()`);
    await queryRunner.query(`ALTER TABLE "posts" DROP COLUMN "review_status"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "first_post_approved"`);
  }
}
