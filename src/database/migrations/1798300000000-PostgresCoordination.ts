import { MigrationInterface, QueryRunner } from 'typeorm';

export class PostgresCoordination1798300000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE admin_bff_sessions (
      key text PRIMARY KEY, payload text NOT NULL, expires_at timestamptz NOT NULL,
      version bigint NOT NULL DEFAULT 0, lease_owner varchar(43), lease_until timestamptz,
      CHECK ((lease_owner IS NULL) = (lease_until IS NULL)))`);
    await q.query('CREATE INDEX idx_admin_bff_sessions_expiry ON admin_bff_sessions(expires_at)');
    await q.query(`CREATE TABLE security_attempts (
      key varchar(128) PRIMARY KEY, attempts integer NOT NULL CHECK(attempts > 0), expires_at timestamptz NOT NULL)`);
    await q.query('CREATE INDEX idx_security_attempts_expiry ON security_attempts(expires_at)');
    await q.query(`CREATE TABLE http_rate_limits (
      key varchar(128) PRIMARY KEY, hits bigint[] NOT NULL DEFAULT '{}',
      expires_at bigint NOT NULL, blocked_until bigint NOT NULL DEFAULT 0)`);
    await q.query('CREATE INDEX idx_http_rate_limits_expiry ON http_rate_limits(expires_at)');
    await q.query(`ALTER TABLE mail_outbox
      ADD COLUMN kind varchar(16) NOT NULL DEFAULT 'mail' CHECK(kind IN ('mail','newsletter')),
      ADD COLUMN status varchar(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','delivered','expired','failed')),
      ADD COLUMN attempts integer NOT NULL DEFAULT 0,
      ADD COLUMN max_attempts integer NOT NULL DEFAULT 300,
      ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN lease_owner uuid, ADD COLUMN lease_until timestamptz,
      ADD COLUMN version bigint NOT NULL DEFAULT 0,
      ADD COLUMN completed_at timestamptz,
      ADD COLUMN last_error varchar(64), ADD COLUMN queue_name varchar(128) NOT NULL DEFAULT 'default',
      ADD COLUMN deduplication_key text, ADD CONSTRAINT uq_mail_outbox_dedup UNIQUE(queue_name,deduplication_key),
      ADD CONSTRAINT chk_mail_outbox_lease CHECK ((lease_owner IS NULL) = (lease_until IS NULL))`);
    await q.query("CREATE INDEX idx_mail_outbox_ready ON mail_outbox(next_attempt_at, created_at, id) WHERE status IN ('pending','processing')");
    // The old global version has no consumer after removal of public response caching.
    for (const table of ['posts', 'users', 'categories', 'tags', 'post_categories', 'post_tags']) {
      await q.query(`DROP TRIGGER IF EXISTS invalidate_public_cache ON ${table}`);
      await q.query(`DROP TRIGGER IF EXISTS invalidate_public_cache_truncate ON ${table}`);
    }
    await q.query('DROP FUNCTION IF EXISTS bump_public_cache_version()');
    await q.query('DROP TABLE IF EXISTS public_cache_version');
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('CREATE TABLE public_cache_version (id boolean PRIMARY KEY DEFAULT true CHECK (id), version bigint NOT NULL DEFAULT 0)');
    await q.query('INSERT INTO public_cache_version(id) VALUES (true)');
    await q.query(`CREATE FUNCTION bump_public_cache_version() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN UPDATE public_cache_version SET version = version + 1 WHERE id = true; RETURN NULL; END $$`);
    for (const table of ['posts', 'users', 'categories', 'tags', 'post_categories', 'post_tags']) {
      await q.query(`CREATE CONSTRAINT TRIGGER invalidate_public_cache AFTER INSERT OR UPDATE OR DELETE ON ${table} DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION bump_public_cache_version()`);
      await q.query(`CREATE TRIGGER invalidate_public_cache_truncate AFTER TRUNCATE ON ${table} FOR EACH STATEMENT EXECUTE FUNCTION bump_public_cache_version()`);
    }
    await q.query(`ALTER TABLE mail_outbox DROP CONSTRAINT chk_mail_outbox_lease,
      DROP COLUMN kind, DROP COLUMN status, DROP COLUMN attempts, DROP COLUMN max_attempts,
      DROP COLUMN next_attempt_at, DROP COLUMN lease_owner, DROP COLUMN lease_until, DROP COLUMN version,
      DROP COLUMN completed_at, DROP COLUMN last_error, DROP COLUMN deduplication_key, DROP COLUMN queue_name`);
    await q.query('DROP TABLE http_rate_limits');
    await q.query('DROP TABLE security_attempts');
    await q.query('DROP TABLE admin_bff_sessions');
  }
}
