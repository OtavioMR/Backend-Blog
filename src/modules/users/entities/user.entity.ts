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
