import { Exclude } from 'class-transformer';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

import { UserRole } from '../enums/user.enum.js';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ name: 'profile_photo', type: 'varchar', nullable: true })
  profilePhoto: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  bio: string | null;

  @Column({ name: 'website_url', type: 'varchar', length: 500, nullable: true })
  websiteUrl: string | null;

  @Column({ name: 'social_url', type: 'varchar', length: 500, nullable: true })
  socialUrl: string | null;

  @Column({ unique: true, length: 255 })
  email: string;

  @Column({ name: 'password_hash', select: false })
  @Exclude()
  passwordHash: string;

  @Column({
    name: 'refresh_token_hash',
    type: 'varchar',
    length: 255,
    nullable: true,
    select: false,
  })
  @Exclude()
  refreshTokenHash: string | null;

  @Column({
    name: 'reset_password_token_hash',
    type: 'varchar',
    length: 255,
    nullable: true,
    select: false,
  })
  @Exclude()
  resetPasswordTokenHash: string | null;

  @Column({
    name: 'reset_password_expires_at',
    type: 'timestamptz',
    nullable: true,
    select: false,
  })
  @Exclude()
  resetPasswordExpiresAt: Date | null;

  @Column({ name: 'pending_email', type: 'varchar', length: 255, nullable: true, select: false })
  @Exclude()
  pendingEmail: string | null;

  @Column({ name: 'email_change_token_hash', type: 'varchar', length: 64, nullable: true, select: false })
  @Exclude()
  emailChangeTokenHash: string | null;

  @Column({ name: 'email_change_expires_at', type: 'timestamptz', nullable: true, select: false })
  @Exclude()
  emailChangeExpiresAt: Date | null;

  @Column({ name: 'failed_login_attempts', type: 'integer', default: 0 })
  failedLoginAttempts: number;

  @Column({ name: 'login_locked_until', type: 'timestamptz', nullable: true })
  loginLockedUntil: Date | null;

  @Column({ name: 'email_verified', default: false })
  emailVerified: boolean;

  @Column({ name: 'email_verification_token_hash', type: 'varchar', length: 64, nullable: true, select: false })
  @Exclude()
  emailVerificationTokenHash: string | null;

  @Column({ name: 'email_verification_expires_at', type: 'timestamptz', nullable: true, select: false })
  @Exclude()
  emailVerificationExpiresAt: Date | null;

  @Column({ name: 'totp_enabled', default: false })
  totpEnabled: boolean;

  @Column({ name: 'totp_secret', type: 'text', nullable: true, select: false })
  @Exclude()
  totpSecret: string | null;

  @Column({ name: 'totp_pending_secret', type: 'text', nullable: true, select: false })
  @Exclude()
  totpPendingSecret: string | null;

  @Column({ name: 'totp_pending_expires_at', type: 'timestamptz', nullable: true, select: false })
  @Exclude()
  totpPendingExpiresAt: Date | null;

  @Column({ name: 'totp_last_counter', type: 'bigint', nullable: true, select: false })
  @Exclude()
  totpLastCounter: string | null;

  @Column({ name: 'moderation_suspended', default: false })
  moderationSuspended: boolean;

  @Column({ name: 'suspension_ends_at', type: 'timestamptz', nullable: true })
  suspensionEndsAt: Date | null;

  @Column({ name: 'first_post_approved', default: false })
  firstPostApproved: boolean;

  @Column({ name: 'author_rules_accepted_at', type: 'timestamptz', nullable: true })
  authorRulesAcceptedAt: Date | null;

  @Column({ name: 'author_rules_version', type: 'varchar', length: 20, nullable: true })
  authorRulesVersion: string | null;

  @Column({ name: 'author_promotion_blocked', default: false })
  authorPromotionBlocked: boolean;

  @Column({ name: 'auth_version', type: 'integer', default: 0 })
  authVersion: number;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.READER,
  })
  role: UserRole;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
