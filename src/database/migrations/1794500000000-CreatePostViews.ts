import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePostViews1794500000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE post_views (
      post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      visitor_hash varchar(64) NOT NULL,
      viewed_on date NOT NULL,
      PRIMARY KEY (post_id, visitor_hash, viewed_on)
    )`);
    await queryRunner.query('CREATE INDEX idx_post_views_date ON post_views (viewed_on, post_id)');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE post_views');
  }
}
