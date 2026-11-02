import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum ReportStatus { PENDING = 'PENDING', DISMISSED = 'DISMISSED', RESOLVED = 'RESOLVED' }
export enum ReportTarget { POST = 'POST', COMMENT = 'COMMENT' }

@Entity('reports')
export class Report {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'reporter_id', type: 'uuid' }) reporterId: string;
  @Column({ name: 'post_id', type: 'uuid', nullable: true }) postId: string | null;
  @Column({ name: 'comment_id', type: 'uuid', nullable: true }) commentId: string | null;
  @Column({ type: 'varchar', length: 1000 }) reason: string;
  @Column({ type: 'varchar', length: 20, default: ReportStatus.PENDING }) status: ReportStatus;
  @Column({ name: 'moderator_id', type: 'uuid', nullable: true }) moderatorId: string | null;
  @Column({ name: 'moderation_note', type: 'varchar', length: 1000, nullable: true }) moderationNote: string | null;
  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true }) reviewedAt: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
