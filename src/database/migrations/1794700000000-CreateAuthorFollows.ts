import { MigrationInterface, QueryRunner } from 'typeorm';
export class CreateAuthorFollows1794700000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE author_follows (
      follower_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (follower_id, author_id), CHECK (follower_id <> author_id)
    )`);
    await q.query('CREATE INDEX idx_author_follows_author ON author_follows(author_id)');
  }
  async down(q: QueryRunner): Promise<void> { await q.query('DROP TABLE author_follows'); }
}
