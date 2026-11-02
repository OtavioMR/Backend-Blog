import { MigrationInterface, QueryRunner } from 'typeorm';
export class CreateSavedCollections1794800000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE saved_collections (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name varchar(100) NOT NULL, created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, name), UNIQUE (id, user_id)
    )`);
    await q.query(`CREATE TABLE saved_collection_posts (
      collection_id uuid NOT NULL, user_id uuid NOT NULL, post_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (collection_id, post_id),
      FOREIGN KEY (collection_id, user_id) REFERENCES saved_collections(id, user_id) ON DELETE CASCADE,
      FOREIGN KEY (post_id, user_id) REFERENCES post_interactions(post_id, user_id) ON DELETE CASCADE
    )`);
  }
  async down(q: QueryRunner): Promise<void> { await q.query('DROP TABLE saved_collection_posts'); await q.query('DROP TABLE saved_collections'); }
}
