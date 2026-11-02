import { MigrationInterface, QueryRunner } from 'typeorm';
export class SocialAuth1795800000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE social_identities (provider varchar(16) NOT NULL, subject varchar(255) NOT NULL, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (provider, subject), UNIQUE (provider, user_id))`);
    await queryRunner.query(`CREATE TABLE oauth_states (state_hash varchar(64) PRIMARY KEY, provider varchar(16) NOT NULL, verifier varchar(128) NOT NULL, link_user_id uuid REFERENCES users(id) ON DELETE CASCADE, link_auth_version integer, expires_at timestamptz NOT NULL)`);
    await queryRunner.query(`CREATE TABLE oauth_challenges (token_hash varchar(64) PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, auth_version integer NOT NULL, expires_at timestamptz NOT NULL)`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE oauth_challenges`); await queryRunner.query(`DROP TABLE oauth_states`); await queryRunner.query(`DROP TABLE social_identities`);
  }
}
