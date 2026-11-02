import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('auth_sessions')
export class AuthSession {
  @PrimaryColumn('uuid') id: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId: string;
  @Column({ name: 'token_hash', type: 'varchar', length: 64, select: false }) tokenHash: string;
  @Column({ name: 'auth_version', type: 'integer' }) authVersion: number;
  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true }) userAgent: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @Column({ name: 'last_used_at', type: 'timestamptz' }) lastUsedAt: Date;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date;
}
