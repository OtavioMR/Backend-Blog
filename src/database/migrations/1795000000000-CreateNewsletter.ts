import { MigrationInterface, QueryRunner } from 'typeorm';
export class CreateNewsletter1795000000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE newsletter_subscribers (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), email varchar(255) NOT NULL UNIQUE,
      confirmed boolean NOT NULL DEFAULT false, confirmation_hash varchar(64), confirmation_expires_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, confirmed_at timestamptz
    )`);
    await q.query(`CREATE TABLE newsletter_deliveries (
      post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      subscriber_id uuid NOT NULL REFERENCES newsletter_subscribers(id) ON DELETE CASCADE,
      sent_at timestamptz, attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (post_id, subscriber_id)
    )`);
    await q.query('CREATE INDEX idx_newsletter_pending ON newsletter_deliveries(next_attempt_at) WHERE sent_at IS NULL');
    await q.query(`CREATE FUNCTION enqueue_newsletter_publication() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.published AND NEW.is_active AND NEW.deleted_at IS NULL AND (TG_OP = 'INSERT' OR NOT OLD.published) THEN
          INSERT INTO newsletter_deliveries(post_id, subscriber_id)
          SELECT NEW.id, id FROM newsletter_subscribers WHERE confirmed = true ON CONFLICT DO NOTHING;
        END IF;
        RETURN NEW;
      END $$`);
    await q.query('CREATE TRIGGER trg_newsletter_publication AFTER INSERT OR UPDATE OF published ON posts FOR EACH ROW EXECUTE FUNCTION enqueue_newsletter_publication()');
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TRIGGER trg_newsletter_publication ON posts'); await q.query('DROP FUNCTION enqueue_newsletter_publication()');
    await q.query('DROP TABLE newsletter_deliveries'); await q.query('DROP TABLE newsletter_subscribers');
  }
}
