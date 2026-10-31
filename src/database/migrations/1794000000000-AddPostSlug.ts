import { MigrationInterface, QueryRunner } from 'typeorm';
import { postSlug } from '../../modules/posts/post-slug.js';

export class AddPostSlug1794000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE posts ADD COLUMN slug varchar(150)');
    const posts: { id: string; title: string }[] = await queryRunner.query('SELECT id, title FROM posts');
    for (const post of posts) {
      await queryRunner.query('UPDATE posts SET slug = $1 WHERE id = $2', [postSlug(post.title, post.id), post.id]);
    }
    await queryRunner.query('ALTER TABLE posts ALTER COLUMN slug SET NOT NULL, ADD CONSTRAINT uq_posts_slug UNIQUE (slug)');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE posts DROP COLUMN slug');
  }
}
