import { MigrationInterface, QueryRunner } from 'typeorm';
export class CreateNotifications1794900000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE notifications (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      actor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type varchar(30) NOT NULL, post_id uuid NULL REFERENCES posts(id) ON DELETE CASCADE,
      comment_id uuid NULL REFERENCES comments(id) ON DELETE CASCADE,
      read_at timestamptz NULL, created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await q.query('CREATE INDEX idx_notifications_recipient_created ON notifications(recipient_id, created_at DESC, id DESC)');
    await q.query(`CREATE FUNCTION notify_post_like() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE target uuid;
      BEGIN
        IF NEW.liked AND (TG_OP = 'INSERT' OR NOT OLD.liked) THEN
          SELECT author_id INTO target FROM posts WHERE id = NEW.post_id;
          IF target IS NOT NULL AND target <> NEW.user_id THEN
            INSERT INTO notifications(recipient_id, actor_id, type, post_id) VALUES(target, NEW.user_id, 'post_like', NEW.post_id);
          END IF;
        END IF;
        RETURN NEW;
      END $$`);
    await q.query('CREATE TRIGGER trg_notify_post_like AFTER INSERT OR UPDATE OF liked ON post_interactions FOR EACH ROW EXECUTE FUNCTION notify_post_like()');
    await q.query(`CREATE FUNCTION notify_comment() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        INSERT INTO notifications(recipient_id, actor_id, type, post_id, comment_id)
        SELECT DISTINCT target, NEW.author_id, CASE WHEN NEW.reply_to_id IS NULL THEN 'comment' ELSE 'reply' END, NEW.post_id, NEW.id
        FROM (SELECT author_id AS target FROM posts WHERE id = NEW.post_id
              UNION SELECT author_id AS target FROM comments WHERE id = NEW.reply_to_id) recipients
        WHERE target <> NEW.author_id;
        RETURN NEW;
      END $$`);
    await q.query('CREATE TRIGGER trg_notify_comment AFTER INSERT ON comments FOR EACH ROW EXECUTE FUNCTION notify_comment()');
    await q.query(`CREATE FUNCTION notify_comment_like() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE target uuid; target_post uuid;
      BEGIN
        SELECT author_id, post_id INTO target, target_post FROM comments WHERE id = NEW.comment_id;
        IF target IS NOT NULL AND target <> NEW.user_id THEN
          INSERT INTO notifications(recipient_id, actor_id, type, post_id, comment_id) VALUES(target, NEW.user_id, 'comment_like', target_post, NEW.comment_id);
        END IF;
        RETURN NEW;
      END $$`);
    await q.query('CREATE TRIGGER trg_notify_comment_like AFTER INSERT ON comment_likes FOR EACH ROW EXECUTE FUNCTION notify_comment_like()');
    await q.query(`CREATE FUNCTION notify_follow() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        INSERT INTO notifications(recipient_id, actor_id, type) VALUES(NEW.author_id, NEW.follower_id, 'follow');
        RETURN NEW;
      END $$`);
    await q.query('CREATE TRIGGER trg_notify_follow AFTER INSERT ON author_follows FOR EACH ROW EXECUTE FUNCTION notify_follow()');
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TRIGGER trg_notify_follow ON author_follows'); await q.query('DROP FUNCTION notify_follow()');
    await q.query('DROP TRIGGER trg_notify_comment_like ON comment_likes'); await q.query('DROP FUNCTION notify_comment_like()');
    await q.query('DROP TRIGGER trg_notify_comment ON comments'); await q.query('DROP FUNCTION notify_comment()');
    await q.query('DROP TRIGGER trg_notify_post_like ON post_interactions'); await q.query('DROP FUNCTION notify_post_like()');
    await q.query('DROP TABLE notifications');
  }
}
