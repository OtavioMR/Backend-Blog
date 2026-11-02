import { MigrationInterface, QueryRunner } from 'typeorm';
export class PostSeries1796200000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE post_series (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title varchar(150) NOT NULL, description text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`CREATE TABLE post_series_items (
      series_id uuid NOT NULL REFERENCES post_series(id) ON DELETE CASCADE,
      post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      position int NOT NULL CHECK (position > 0),
      PRIMARY KEY (series_id, post_id), UNIQUE (series_id, position), UNIQUE (post_id)
    )`);
    await queryRunner.query('CREATE INDEX idx_post_series_author ON post_series (author_id, created_at DESC, id DESC)');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE post_series_items');
    await queryRunner.query('DROP TABLE post_series');
  }
}
