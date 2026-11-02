import { MigrationInterface, QueryRunner } from 'typeorm';

export class PublicCacheVersion1796300000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query('CREATE TABLE public_cache_version (id boolean PRIMARY KEY DEFAULT true CHECK (id), version bigint NOT NULL DEFAULT 0)');
    await q.query('INSERT INTO public_cache_version(id) VALUES (true)');
    await q.query(`CREATE FUNCTION bump_public_cache_version() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN UPDATE public_cache_version SET version = version + 1 WHERE id = true; RETURN NULL; END $$`);
    for (const table of ['posts', 'users', 'categories', 'tags', 'post_categories', 'post_tags']) {
      await q.query(`CREATE CONSTRAINT TRIGGER invalidate_public_cache AFTER INSERT OR UPDATE OR DELETE ON ${table} DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION bump_public_cache_version()`);
      await q.query(`CREATE TRIGGER invalidate_public_cache_truncate AFTER TRUNCATE ON ${table} FOR EACH STATEMENT EXECUTE FUNCTION bump_public_cache_version()`);
    }
  }
  async down(q: QueryRunner): Promise<void> {
    for (const table of ['posts', 'users', 'categories', 'tags', 'post_categories', 'post_tags']) {
      await q.query(`DROP TRIGGER invalidate_public_cache ON ${table}`);
      await q.query(`DROP TRIGGER invalidate_public_cache_truncate ON ${table}`);
    }
    await q.query('DROP FUNCTION bump_public_cache_version()');
    await q.query('DROP TABLE public_cache_version');
  }
}
