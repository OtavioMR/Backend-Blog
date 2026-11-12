import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

const bigintNumber = { to: (v?: number) => v, from: (v: string) => Number(v) };

// One row per committed v2 rotation. Stores AES-256-GCM encrypted result with AAD
// within result_expires_at, and preserves operation metadata until metadata_expires_at.
@Entity('auth_refresh_operations')
export class AuthRefreshOperation {
  @PrimaryColumn({ name: 'session_id', type: 'uuid' }) sessionId: string;
  @PrimaryColumn({ name: 'operation_hash', type: 'varchar', length: 64 }) operationHash: string;
  @Column({ name: 'input_generation', type: 'bigint', transformer: bigintNumber }) inputGeneration: number;
  @Column({ name: 'output_generation', type: 'bigint', transformer: bigintNumber }) outputGeneration: number;
  @Column({ name: 'input_hash', type: 'varchar', length: 64 }) inputHash: string;
  @Column({ name: 'output_hash', type: 'varchar', length: 64 }) outputHash: string;
  @Column({ name: 'auth_version', type: 'integer' }) authVersion: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @Column({ name: 'input_expires_at', type: 'timestamptz' }) inputExpiresAt: Date;
  @Column({ name: 'output_refresh_expires_at', type: 'timestamptz' }) outputRefreshExpiresAt: Date;
  @Column({ name: 'output_access_expires_at', type: 'timestamptz' }) outputAccessExpiresAt: Date;
  @Column({ name: 'result_expires_at', type: 'timestamptz' }) resultExpiresAt: Date;
  @Column({ name: 'metadata_expires_at', type: 'timestamptz' }) metadataExpiresAt: Date;
  @Column({ name: 'result_ciphertext', type: 'text', nullable: true }) resultCiphertext: string | null;
  @Column({ name: 'key_id', type: 'varchar', length: 32, nullable: true }) keyId: string | null;
  @Column({ name: 'nonce', type: 'varchar', length: 32, nullable: true }) nonce: string | null;
  @Column({ name: 'tag', type: 'varchar', length: 32, nullable: true }) tag: string | null;
}
