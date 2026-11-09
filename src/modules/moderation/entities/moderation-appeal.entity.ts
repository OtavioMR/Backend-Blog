import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum AppealStatus {
  PENDING = 'PENDING',
  UNDER_REVIEW = 'UNDER_REVIEW',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}

export enum AppealTargetType {
  POST = 'POST',
  COMMENT = 'COMMENT',
  ACCOUNT = 'ACCOUNT',
}

@Entity('moderation_appeals')
export class ModerationAppeal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 40, unique: true })
  protocol: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'target_type', type: 'varchar', length: 20 })
  targetType: AppealTargetType;

  @Column({ name: 'target_id', type: 'uuid' })
  targetId: string;

  @Column({ type: 'varchar', length: 2000 })
  reason: string;

  @Column({ type: 'varchar', length: 20, default: AppealStatus.PENDING })
  status: AppealStatus;

  @Column({ name: 'moderator_id', type: 'uuid', nullable: true })
  moderatorId: string | null;

  @Column({ name: 'moderator_note', type: 'varchar', length: 1000, nullable: true })
  moderatorNote: string | null;

  @Column({ name: 'deadline_at', type: 'timestamptz' })
  deadlineAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;
}
