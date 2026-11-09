import { MigrationInterface, QueryRunner } from 'typeorm';

export class GovernanceAgeAiAppeals1798000000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    // 1. Users: birth date and legal acceptances
    await q.query(`ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS birth_date date NULL,
      ADD COLUMN IF NOT EXISTS accepted_terms_at timestamptz NULL,
      ADD COLUMN IF NOT EXISTS accepted_terms_version varchar(20) NULL`);

    // 2. Posts: content rating and AI transparency declarations
    await q.query(`ALTER TABLE posts 
      ADD COLUMN IF NOT EXISTS content_rating varchar(10) NULL,
      ADD COLUMN IF NOT EXISTS ai_text_declaration varchar(30) NULL,
      ADD COLUMN IF NOT EXISTS ai_cover_declaration varchar(30) NULL`);

    await q.query(`CREATE INDEX IF NOT EXISTS idx_posts_content_rating ON posts(content_rating) WHERE published = true AND is_active = true`);

    // 3. Notifications: details payload for moderation notes and appeals
    await q.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS details jsonb NULL`);

    // 4. Account Deletion Requests
    await q.query(`CREATE TABLE IF NOT EXISTS account_deletion_requests (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      protocol varchar(40) NOT NULL UNIQUE,
      user_id uuid NOT NULL,
      user_email_hash varchar(64) NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'COMPLETED',
      reason varchar(500) NULL,
      requested_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      scheduled_for timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP + interval '30 days'),
      completed_at timestamptz NULL
    )`);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_deletion_requests_protocol ON account_deletion_requests(protocol)`);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_deletion_requests_user ON account_deletion_requests(user_id)`);

    // 5. Moderation Appeals
    await q.query(`CREATE TABLE IF NOT EXISTS moderation_appeals (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      protocol varchar(40) NOT NULL UNIQUE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_type varchar(20) NOT NULL,
      target_id uuid NOT NULL,
      reason varchar(2000) NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'PENDING',
      moderator_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
      moderator_note varchar(1000) NULL,
      deadline_at timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP + interval '15 days'),
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at timestamptz NULL
    )`);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_moderation_appeals_status ON moderation_appeals(status, deadline_at ASC)`);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_moderation_appeals_user ON moderation_appeals(user_id, created_at DESC)`);

    // 6. Legal Documents & User Legal Acceptances
    await q.query(`CREATE TABLE IF NOT EXISTS legal_documents (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      document_type varchar(40) NOT NULL,
      version varchar(20) NOT NULL,
      content_sha256 char(64) NOT NULL,
      published_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      requires_reacceptance boolean NOT NULL DEFAULT true,
      summary_of_changes text NULL,
      CONSTRAINT uq_legal_document_type_version UNIQUE (document_type, version)
    )`);

    await q.query(`CREATE TABLE IF NOT EXISTS user_legal_acceptances (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      document_type varchar(40) NOT NULL,
      document_version varchar(20) NOT NULL,
      content_sha256 char(64) NOT NULL,
      accepted_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      acceptance_context varchar(40) NOT NULL
    )`);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_user_legal_acceptances_user ON user_legal_acceptances(user_id, accepted_at DESC)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS user_legal_acceptances`);
    await q.query(`DROP TABLE IF EXISTS legal_documents`);
    await q.query(`DROP TABLE IF EXISTS moderation_appeals`);
    await q.query(`DROP TABLE IF EXISTS account_deletion_requests`);
    await q.query(`ALTER TABLE notifications DROP COLUMN IF EXISTS details`);
    await q.query(`DROP INDEX IF EXISTS idx_posts_content_rating`);
    await q.query(`ALTER TABLE posts 
      DROP COLUMN IF EXISTS content_rating,
      DROP COLUMN IF EXISTS ai_text_declaration,
      DROP COLUMN IF EXISTS ai_cover_declaration`);
    await q.query(`ALTER TABLE users 
      DROP COLUMN IF EXISTS birth_date,
      DROP COLUMN IF EXISTS accepted_terms_at,
      DROP COLUMN IF EXISTS accepted_terms_version`);
  }
}
