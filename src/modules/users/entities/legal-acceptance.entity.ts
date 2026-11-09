import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum LegalDocumentType {
  TERMS_OF_USE = 'TERMS_OF_USE',
  PRIVACY_POLICY = 'PRIVACY_POLICY',
  COMMUNITY_GUIDELINES = 'COMMUNITY_GUIDELINES',
  AI_POLICY = 'AI_POLICY',
  AGE_RATING_POLICY = 'AGE_RATING_POLICY',
  AUTHOR_TERMS = 'AUTHOR_TERMS',
}

@Entity('legal_documents')
export class LegalDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'document_type', type: 'varchar', length: 40 })
  documentType: LegalDocumentType;

  @Column({ type: 'varchar', length: 20 })
  version: string;

  @Column({ name: 'content_sha256', type: 'varchar', length: 64 })
  contentSha256: string;

  @CreateDateColumn({ name: 'published_at', type: 'timestamptz' })
  publishedAt: Date;

  @Column({ name: 'requires_reacceptance', type: 'boolean', default: true })
  requiresReacceptance: boolean;

  @Column({ name: 'summary_of_changes', type: 'text', nullable: true })
  summaryOfChanges: string | null;
}

@Entity('user_legal_acceptances')
export class UserLegalAcceptance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'document_type', type: 'varchar', length: 40 })
  documentType: string;

  @Column({ name: 'document_version', type: 'varchar', length: 20 })
  documentVersion: string;

  @Column({ name: 'content_sha256', type: 'varchar', length: 64 })
  contentSha256: string;

  @CreateDateColumn({ name: 'accepted_at', type: 'timestamptz' })
  acceptedAt: Date;

  @Column({ name: 'acceptance_context', type: 'varchar', length: 40 })
  acceptanceContext: string;
}
