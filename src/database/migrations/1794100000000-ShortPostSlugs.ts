import { MigrationInterface, QueryRunner } from 'typeorm';
import { shortPostSlug } from '../../modules/posts/post-slug.js';

export class ShortPostSlugs1794100000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE posts ADD COLUMN legacy_slug varchar(150) UNIQUE');
    const posts: { id: string; title: string; slug: string }[] = await queryRunner.query('SELECT id, title, slug FROM posts ORDER BY created_at, id');
    await queryRunner.query("UPDATE posts SET legacy_slug = slug, slug = 'temporary-' || id");
    const used = new Set(posts.map(post => `temporary-${post.id}`));
    // Avoid assigning a previous long URL to another post.
    for (const post of posts) used.add(post.slug);
    for (const post of posts) {
      const base = shortPostSlug(post.title);
      let slug = base;
      let suffix = 2;
      while (used.has(slug)) slug = `${base}-${suffix++}`;
      used.add(slug);
      await queryRunner.query('UPDATE posts SET slug = $1 WHERE id = $2', [slug, post.id]);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("UPDATE posts SET slug = 'temporary-' || id");
    await queryRunner.query('UPDATE posts SET slug = COALESCE(legacy_slug, slug)');
    await queryRunner.query('ALTER TABLE posts DROP COLUMN legacy_slug');
  }
}
