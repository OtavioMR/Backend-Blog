import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum DeletionRequestStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity('account_deletion_requests')
export class AccountDeletionRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 40, unique: true })
  protocol: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'user_email_hash', type: 'varchar', length: 64 })
  userEmailHash: string;

  @Column({ type: 'varchar', length: 20, default: DeletionRequestStatus.COMPLETED })
  status: DeletionRequestStatus;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'requested_at', type: 'timestamptz' })
  requestedAt: Date;

  @Column({ name: 'scheduled_for', type: 'timestamptz' })
  scheduledFor: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}
