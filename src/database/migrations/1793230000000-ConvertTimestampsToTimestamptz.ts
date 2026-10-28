import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Converte as colunas de data para TIMESTAMPTZ (timestamp with time zone).
 * Os valores existentes foram gravados em UTC, por isso a conversão usa AT TIME ZONE 'UTC'.
 * Também define o fuso padrão do banco como America/Sao_Paulo, para que consultas
 * diretas no banco exibam o horário local.
 */
export class ConvertTimestampsToTimestamptz1793230000000 implements MigrationInterface {
  name = 'ConvertTimestampsToTimestamptz1793230000000';

  private readonly columns: Array<[string, string]> = [
    ['users', 'created_at'],
    ['users', 'updated_at'],
    ['posts', 'created_at'],
    ['posts', 'updated_at'],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, column] of this.columns) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE TIMESTAMP WITH TIME ZONE USING "${column}" AT TIME ZONE 'UTC'`,
      );
    }

    await queryRunner.query(
      `DO $$ BEGIN EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'America/Sao_Paulo'); END $$`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN EXECUTE format('ALTER DATABASE %I RESET timezone', current_database()); END $$`,
    );

    for (const [table, column] of this.columns) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE TIMESTAMP WITHOUT TIME ZONE USING "${column}" AT TIME ZONE 'UTC'`,
      );
    }
  }
}
