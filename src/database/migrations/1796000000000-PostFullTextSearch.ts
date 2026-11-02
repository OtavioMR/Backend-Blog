import { MigrationInterface, QueryRunner } from 'typeorm';

export class PostFullTextSearch1796000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TEXT SEARCH CONFIGURATION blog_portuguese (COPY = pg_catalog.portuguese)`);
    await queryRunner.query(`ALTER TEXT SEARCH CONFIGURATION blog_portuguese ALTER MAPPING FOR hword, hword_part, word WITH unaccent, portuguese_stem`);
    await queryRunner.query(`CREATE INDEX idx_posts_full_text ON posts USING GIN (to_tsvector('blog_portuguese'::regconfig, coalesce(title, '') || ' ' || coalesce(content, '')))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_posts_full_text');
    await queryRunner.query('DROP TEXT SEARCH CONFIGURATION IF EXISTS blog_portuguese');
  }
}
