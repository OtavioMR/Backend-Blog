import { MigrationInterface, QueryRunner } from 'typeorm';
export class OAuthLinkSession1795900000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE oauth_states ADD COLUMN link_session_id uuid`);
    await queryRunner.query(`DELETE FROM oauth_states WHERE link_user_id IS NOT NULL`);
  }
  async down(queryRunner: QueryRunner): Promise<void> { await queryRunner.query(`ALTER TABLE oauth_states DROP COLUMN link_session_id`); }
}
