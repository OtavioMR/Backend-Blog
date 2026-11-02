import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'actor_id', type: 'uuid', nullable: true }) actorId: string | null;
  @Column({ type: 'varchar', length: 80 }) action: string;
  @Column({ name: 'target_type', type: 'varchar', length: 40 }) targetType: string;
  @Column({ name: 'target_id', type: 'uuid' }) targetId: string;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) details: Record<string, unknown>;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
