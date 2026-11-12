import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeriesCover1798100000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE post_series
      ADD COLUMN cover_image text,
      ADD COLUMN ai_cover_declaration varchar(30) NOT NULL DEFAULT 'NONE'
        CHECK (ai_cover_declaration IN ('NONE', 'HUMAN_OR_PHOTO', 'AI_GENERATED', 'HYBRID'))`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE post_series DROP COLUMN cover_image, DROP COLUMN ai_cover_declaration');
  }
}
