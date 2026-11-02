import { MigrationInterface, QueryRunner } from 'typeorm';

export class PostRevisions1796100000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE post_revisions (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      title varchar(150) NOT NULL,
      content text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp()
    )`);
    await queryRunner.query(`CREATE INDEX idx_post_revisions_post_created ON post_revisions (post_id, created_at DESC, id DESC)`);
    await queryRunner.query(`INSERT INTO post_revisions (post_id, title, content) SELECT id, title, content FROM posts`);
    await queryRunner.query(`CREATE FUNCTION record_post_revision() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'INSERT' OR (OLD.title, OLD.content) IS DISTINCT FROM (NEW.title, NEW.content) THEN
          INSERT INTO post_revisions (post_id, title, content) VALUES (NEW.id, NEW.title, NEW.content);
        END IF;
        RETURN NEW;
      END;
    $$ LANGUAGE plpgsql`);
    await queryRunner.query(`CREATE TRIGGER trg_record_post_revision AFTER INSERT OR UPDATE OF title, content ON posts FOR EACH ROW EXECUTE FUNCTION record_post_revision()`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_record_post_revision ON posts');
    await queryRunner.query('DROP FUNCTION IF EXISTS record_post_revision()');
    await queryRunner.query('DROP TABLE post_revisions');
  }
}
