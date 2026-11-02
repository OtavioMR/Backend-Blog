import { MigrationInterface, QueryRunner } from 'typeorm';

export class OptimizePublicSearch1796400000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    await q.query(`CREATE FUNCTION blog_search_text(value text) RETURNS text
      LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT lower(public.unaccent('public.unaccent', value)) $$`);
    await q.query(`ALTER TABLE posts ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
      setweight(to_tsvector('blog_portuguese'::regconfig, coalesce(title, '')), 'A') ||
      setweight(to_tsvector('blog_portuguese'::regconfig, coalesce(content, '')), 'D')) STORED`);
    await q.query(`ALTER TABLE posts ADD COLUMN search_text text GENERATED ALWAYS AS (blog_search_text(coalesce(title, '') || ' ' || coalesce(content, ''))) STORED`);
    await q.query('CREATE INDEX idx_posts_search_vector ON posts USING GIN (search_vector)');
    await q.query('CREATE INDEX idx_posts_search_text ON posts USING GIN (search_text gin_trgm_ops)');
    await q.query('CREATE INDEX idx_posts_public_cursor ON posts (published_at DESC, id DESC) WHERE published = true AND is_active = true AND deleted_at IS NULL');
    await q.query('CREATE INDEX idx_comments_root_cursor ON comments (post_id, created_at DESC, id DESC) WHERE root_id IS NULL');
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP INDEX idx_comments_root_cursor');
    await q.query('DROP INDEX idx_posts_public_cursor');
    await q.query('ALTER TABLE posts DROP COLUMN search_text, DROP COLUMN search_vector');
    await q.query('DROP FUNCTION blog_search_text(text)');
  }
}
