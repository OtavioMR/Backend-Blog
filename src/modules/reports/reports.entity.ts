import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum ReportStatus { PENDING = 'PENDING', IN_REVIEW = 'IN_REVIEW', DISMISSED = 'DISMISSED', RESOLVED = 'RESOLVED' }
export enum ReportTarget { POST = 'POST', COMMENT = 'COMMENT', USER = 'USER' }
export enum ReportReason { SPAM = 'SPAM', HARASSMENT = 'HARASSMENT', HATE_SPEECH = 'HATE_SPEECH', INAPPROPRIATE = 'INAPPROPRIATE', COPYRIGHT = 'COPYRIGHT', MISINFORMATION = 'MISINFORMATION', OTHER = 'OTHER' }

@Entity('reports')
export class Report {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'reporter_id', type: 'uuid' }) reporterId: string;
  @Column({ name: 'post_id', type: 'uuid', nullable: true }) postId: string | null;
  @Column({ name: 'comment_id', type: 'uuid', nullable: true }) commentId: string | null;
  @Column({ name: 'user_id', type: 'uuid', nullable: true }) userId: string | null;
  @Column({ type: 'varchar', length: 1000 }) reason: string;
  @Column({ name: 'reason_category', type: 'varchar', length: 30, nullable: true }) reasonCategory: ReportReason | null;
  @Column({ type: 'varchar', length: 2000, nullable: true }) description: string | null;
  @Column({ type: 'varchar', length: 20, default: ReportStatus.PENDING }) status: ReportStatus;
  @Column({ name: 'moderator_id', type: 'uuid', nullable: true }) moderatorId: string | null;
  @Column({ name: 'moderation_note', type: 'varchar', length: 1000, nullable: true }) moderationNote: string | null;
  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true }) reviewedAt: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
