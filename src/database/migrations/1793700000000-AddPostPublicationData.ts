import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPostPublicationData1793700000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE posts ADD COLUMN published_at timestamptz, ADD COLUMN excerpt varchar(200) NOT NULL DEFAULT ''`);
    await queryRunner.query(`UPDATE posts SET published_at = created_at WHERE published = true`);
    await queryRunner.query(`UPDATE posts SET excerpt = left(regexp_replace(content, '<[^>]*>', '', 'g'), 200)`);
    await queryRunner.query(`CREATE INDEX idx_posts_published_at ON posts (published_at DESC, id DESC) WHERE published = true AND is_active = true`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX idx_posts_published_at');
    await queryRunner.query('ALTER TABLE posts DROP COLUMN excerpt, DROP COLUMN published_at');
  }
}
