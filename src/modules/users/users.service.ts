import { paginationMeta } from '../../common/utils/pagination.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import sharp from 'sharp';
import { join } from 'node:path';

import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { User } from './entities/user.entity.js';
import { isAdministrator, UserRole } from './enums/user.enum.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import type { PaginatedResult } from '../../common/interfaces/paginated-result.interface.js';
import { MailService } from '../mail/mail.service.js';
import { StorageService } from '../../common/storage/storage.service.js';
import { calculateAge, isUserAdult as isAgeAdult, parseBirthDateParts } from '../../common/utils/age.util.js';

export interface UserRequester {
  userId: string;
  role: UserRole;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly mailService: MailService,
    @Optional() private readonly storage?: StorageService,
  ) {}

  async becomeAuthor(userId: string) {
    const result = await this.usersRepository.query(`WITH promoted AS (
      UPDATE users SET role = 'AUTHOR', author_rules_version = '1', author_rules_accepted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND role = 'READER' AND email_verified = true AND is_active = true AND deleted_at IS NULL AND author_promotion_blocked = false
      RETURNING id
    ), logged AS (
      INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
      SELECT id, 'user.author_promoted', 'user', id, '{"rulesVersion":"1"}'::jsonb FROM promoted RETURNING target_id
    ) SELECT target_id FROM logged`, [userId]);
    if (!result.length) {
      const requested = await this.usersRepository.query(`UPDATE users SET author_access_requested_at = COALESCE(author_access_requested_at, now())
        WHERE id = $1 AND role = 'READER' AND email_verified = true AND is_active = true AND deleted_at IS NULL AND author_promotion_blocked = true RETURNING id`, [userId]);
      if (requested.length) return { requested: true };
      throw new ForbiddenException('A promoção exige uma conta de leitor ativa, verificada e elegível.');
    }
    return { role: UserRole.AUTHOR, rulesVersion: '1' };
  }

  isUserAdult(birthDate?: string | Date | null): boolean {
    return isAgeAdult(birthDate);
  }

  private toPublic(user: User) {
    return {
      id: user.id,
      name: user.name,
      profilePhoto: user.profilePhoto,
      bio: user.bio,
      websiteUrl: user.websiteUrl,
      socialUrl: user.socialUrl,
      email: user.email,
      role: user.role,
      birthDate: user.birthDate,
      isAdult: this.isUserAdult(user.birthDate),
      acceptedTermsAt: user.acceptedTermsAt,
      acceptedTermsVersion: user.acceptedTermsVersion,
      emailVerified: user.emailVerified,
      totpEnabled: user.totpEnabled,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private toPublicProfile(user: User) {
    return {
      id: user.id,
      name: user.name,
      profilePhoto: user.profilePhoto,
      createdAt: user.createdAt,
    };
  }

  private assertCanManage(id: string, requester: UserRequester) {
    if (requester.userId !== id && !isAdministrator(requester.role)) {
      throw new ForbiddenException(
        'Você não tem permissão para realizar esta ação neste usuário.',
      );
    }
  }

  async updateProfilePhoto(
    id: string,
    buffer: Buffer,
    requester: UserRequester,
  ) {
    this.assertCanManage(id, requester);
    if (requester.userId !== id) throw new ForbiddenException('Apenas o titular pode alterar sua foto de perfil.');
    const user = await this.usersRepository.findOne({
      where: { id, isActive: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    if (requester.userId !== id && isAdministrator(user.role)) {
      throw new ForbiddenException('Não é permitido alterar outro administrador.');
    }
    const oldPhoto = user.profilePhoto;
    if (this.storage) {
      const newPhotoUrl = await this.storage.processAndStoreProfilePhoto(buffer);
      user.profilePhoto = newPhotoUrl;
      try {
        const result = await this.usersRepository.createQueryBuilder().update(User)
          .set({ profilePhoto: user.profilePhoto })
          .where('id = :id AND is_active = true AND deleted_at IS NULL', { id })
          .andWhere(oldPhoto === null ? 'profile_photo IS NULL' : 'profile_photo = :oldPhoto', { oldPhoto })
          .execute();
        if (!result.affected) throw new ConflictException('A foto foi alterada simultaneamente. Tente novamente.');
      } catch (error) {
        await this.storage.delete(newPhotoUrl);
        throw error;
      }
      if (oldPhoto) await this.storage.delete(oldPhoto);
      return this.toPublic(user);
    }

    let image: Buffer;
    try {
      const input = sharp(buffer, { limitInputPixels: 40_000_000, failOn: 'error' });
      const metadata = await input.metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) > 1) throw new Error('Invalid image');
      image = await input.rotate().resize(512, 512, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    } catch {
      throw new BadRequestException('A imagem deve ser JPEG, PNG ou WebP válida.');
    }
    const directory = join(process.cwd(), 'uploads', 'profile-photos');
    await mkdir(directory, { recursive: true });
    const filename = `${randomUUID()}.webp`;
    const path = join(directory, filename);
    await writeFile(path, image, { flag: 'wx' });
    user.profilePhoto = `/uploads/profile-photos/${filename}`;
    try {
      const result = await this.usersRepository.createQueryBuilder().update(User)
        .set({ profilePhoto: user.profilePhoto })
        .where('id = :id AND is_active = true AND deleted_at IS NULL', { id })
        .andWhere(oldPhoto === null ? 'profile_photo IS NULL' : 'profile_photo = :oldPhoto', { oldPhoto })
        .execute();
      if (!result.affected) throw new ConflictException('A foto foi alterada simultaneamente. Tente novamente.');
    } catch (error) {
      await unlink(path).catch(() => undefined);
      throw error;
    }
    const oldName = oldPhoto?.match(/^\/uploads\/profile-photos\/([0-9a-f-]+\.(?:jpg|png|webp))$/i)?.[1];
    if (oldName) await unlink(join(directory, oldName)).catch(() => undefined);
    return this.toPublic(user);
  }

  async removeProfilePhoto(id: string, requester: UserRequester) {
    this.assertCanManage(id, requester);
    if (requester.userId !== id) throw new ForbiddenException('Apenas o titular pode remover sua foto de perfil.');
    const user = await this.usersRepository.findOne({ where: { id, isActive: true } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    const oldPhoto = user.profilePhoto;
    user.profilePhoto = null;
    await this.usersRepository.update(id, { profilePhoto: null });
    if (this.storage) {
      await this.storage.delete(oldPhoto);
    } else if (oldPhoto) {
      const match = oldPhoto.match(/^\/uploads\/profile-photos\/([0-9a-f-]+\.(?:jpg|png|webp))$/i);
      if (match) await unlink(join(process.cwd(), 'uploads', 'profile-photos', match[1])).catch(() => undefined);
    }
    return this.toPublic(user);
  }

  async create(createUserDto: CreateUserDto) {
    const name = createUserDto.name.trim();
    const email = createUserDto.email.trim().toLowerCase();
    const password = createUserDto.password;

    if (name.length < 2) {
      throw new BadRequestException(
        'O nome precisa ter pelo menos 2 caracteres.',
      );
    }

    if (Buffer.byteLength(password, 'utf8') > 72) {
      throw new BadRequestException('A senha é muito longa.');
    }

    if (createUserDto.acceptedTerms !== true) {
      throw new BadRequestException('É necessário aceitar os Termos de Uso e a Política de Privacidade para criar uma conta.');
    }

    if (!createUserDto.birthDate || !parseBirthDateParts(createUserDto.birthDate)) {
      throw new BadRequestException('Data de nascimento deve estar no formato AAAA-MM-DD.');
    }

    const age = calculateAge(createUserDto.birthDate);
    if (age === null || age < 0 || age > 120) {
      throw new BadRequestException('Data de nascimento inválida.');
    }

    if (age < 18) {
      throw new BadRequestException('O cadastro no Grifório é atualmente restrito a maiores de 18 anos.');
    }

    const existingUser = await this.usersRepository.findOne({
      where: { email },
      withDeleted: true,
    });

    if (existingUser) {
      throw new ConflictException(
        'Já existe um usuário cadastrado com este e-mail.',
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const verificationToken = randomBytes(32).toString('hex');
    const termsVersion = createUserDto.termsVersion ?? '1.0.0';
    const user = this.usersRepository.create({
      emailVerified: false,
      emailVerificationTokenHash: createHash('sha256').update(verificationToken).digest('hex'),
      emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      name,
      email,
      passwordHash,
      birthDate: createUserDto.birthDate,
      acceptedTermsAt: new Date(),
      acceptedTermsVersion: termsVersion,
      role: UserRole.READER,
      isActive: true,
    });
    const savedUser = await this.usersRepository.save(user);

    await this.usersRepository.query(
      `INSERT INTO user_legal_acceptances (user_id, document_type, document_version, content_sha256, accepted_at, acceptance_context)
       VALUES ($1, 'TERMS_AND_PRIVACY', $2, $3, now(), 'SIGNUP')`,
      [savedUser.id, termsVersion, createHash('sha256').update(termsVersion).digest('hex')],
    ).catch(() => undefined);

    try {
      await this.mailService.sendEmailVerification(savedUser.email, verificationToken);
    } catch {
      this.logger.error(`Failed to send verification email for user ${savedUser.id}`);
    }
    this.logger.log(`Usuário ${savedUser.id} cadastrado`);
    return this.toPublic(savedUser);
  }

  async confirmEmail(token: string): Promise<{ message: string }> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const result = await this.usersRepository.createQueryBuilder().update(User)
      .set({ emailVerified: true, emailVerificationTokenHash: null, emailVerificationExpiresAt: null })
      .where('email_verification_token_hash = :tokenHash', { tokenHash })
      .andWhere('email_verification_expires_at > CURRENT_TIMESTAMP AND is_active = true AND deleted_at IS NULL AND email_verified = false')
      .execute();
    if (!result.affected) throw new BadRequestException('Token inv\u00e1lido ou expirado.');
    return { message: 'E-mail confirmado com sucesso.' };
  }

  async resendVerification(email: string): Promise<{ message: string }> {
    const user = await this.usersRepository.findOne({ where: { email: email.trim().toLowerCase(), isActive: true, emailVerified: false } });
    if (user) {
      const token = randomBytes(32).toString('hex');
      user.emailVerificationTokenHash = createHash('sha256').update(token).digest('hex');
      user.emailVerificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await this.usersRepository.save(user);
      try { await this.mailService.sendEmailVerification(user.email, token); } catch { this.logger.error(`Failed to send verification email for user ${user.id}`); }
    }
    return { message: 'Se a conta precisar de verifica\u00e7\u00e3o, as instru\u00e7\u00f5es ser\u00e3o enviadas.' };
  }

  async findAll(
    query?: PaginationQueryDto,
  ): Promise<PaginatedResult<ReturnType<typeof this.toPublic>>> {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 10;
    const skip = (page - 1) * limit;

    const [users, total] = await this.usersRepository.findAndCount({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });


    return {
      data: users.map((u) => this.toPublic(u)),
      meta: paginationMeta(page, limit, total),
    };
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { id, isActive: true },
    });
  }

  async findByIdForRequester(id: string, requester: UserRequester) {
    const user = await this.usersRepository.findOne({
      where: { id, isActive: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    if (requester.userId === id) {
      return { ...this.toPublic(user), firstPostApproved: user.firstPostApproved };
    }
    if (isAdministrator(requester.role)) {
      return this.toPublic(user);
    }

    return this.toPublicProfile(user);
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    requester: UserRequester,
  ) {
    this.assertCanManage(id, requester);
    let confirmation: { email: string; token: string } | undefined;

    const user = await this.usersRepository.findOne({
      where: { id, isActive: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    const previousAuthVersion = user.authVersion;

    if (requester.userId === id && updateUserDto.role !== undefined) {
      throw new ForbiddenException('Não é permitido alterar a própria função por esta rota.');
    }
    if (requester.userId !== id && isAdministrator(user.role)) {
      throw new ForbiddenException('Não é permitido alterar outro administrador.');
    }
    if (updateUserDto.role !== undefined && isAdministrator(updateUserDto.role)) {
      throw new ForbiddenException('Não é permitido conceder privilégios administrativos por esta rota.');
    }

    if (updateUserDto.role !== undefined || updateUserDto.isActive !== undefined) {
      throw new ForbiddenException('Use as rotas administrativas para alterar função ou suspensão.');
    }
    if (requester.userId !== id) {
      throw new ForbiddenException('Apenas o titular pode alterar seus dados de perfil.');
    }

    if (updateUserDto.password !== undefined && Buffer.byteLength(updateUserDto.password, 'utf8') > 72) {
      throw new BadRequestException('A senha é muito longa.');
    }

    if (updateUserDto.password !== undefined || updateUserDto.email !== undefined) {
      if (requester.userId !== id) {
        throw new ForbiddenException('Apenas o titular pode alterar suas credenciais.');
      }
      if (!updateUserDto.currentPassword) throw new BadRequestException('Informe a senha atual.');
      if (Buffer.byteLength(updateUserDto.currentPassword, 'utf8') > 72) throw new UnauthorizedException('Senha atual inv\u00e1lida.');
      const authUser = await this.findByEmailForAuth(user.email);
      if (!authUser || !(await bcrypt.compare(updateUserDto.currentPassword, authUser.passwordHash))) {
        throw new UnauthorizedException('Senha atual inválida.');
      }
    }

    if (updateUserDto.bio !== undefined) user.bio = updateUserDto.bio?.trim() || null;
    if (updateUserDto.websiteUrl !== undefined) user.websiteUrl = updateUserDto.websiteUrl;
    if (updateUserDto.socialUrl !== undefined) user.socialUrl = updateUserDto.socialUrl;

    if (updateUserDto.name !== undefined) {
      const name = updateUserDto.name.trim();

      if (name.length < 2) {
        throw new BadRequestException(
          'O nome precisa ter pelo menos 2 caracteres.',
        );
      }

      user.name = name;
    }

    if (updateUserDto.email !== undefined) {
      const email = updateUserDto.email.trim().toLowerCase();

      if (email !== user.email) {
        const existingUser = await this.usersRepository.findOne({
          where: { email },
          withDeleted: true,
        });

        if (existingUser) {
          throw new ConflictException(
            'Já existe um usuário cadastrado com este e-mail.',
          );
        }

        const token = randomBytes(32).toString('hex');
        user.pendingEmail = email;
        user.emailChangeTokenHash = createHash('sha256').update(token).digest('hex');
        user.emailChangeExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
        confirmation = { email, token };
      }
    }

    if (updateUserDto.password !== undefined) {
      if (Buffer.byteLength(updateUserDto.password, 'utf8') > 72) {
        throw new BadRequestException('A senha é muito longa.');
      }

      user.passwordHash = await bcrypt.hash(updateUserDto.password, 12);
      user.authVersion += 1;
      user.refreshTokenHash = null;
      user.resetPasswordTokenHash = null;
      user.resetPasswordExpiresAt = null;
      if (updateUserDto.email === undefined || updateUserDto.email.trim().toLowerCase() === user.email) {
        user.pendingEmail = null;
        user.emailChangeTokenHash = null;
        user.emailChangeExpiresAt = null;
      }
    }

    // Only persist fields owned by this endpoint. A concurrent role change or
    // suspension must never be overwritten by an older copy of the user.
    const changes: Partial<User> = {};
    if (updateUserDto.name !== undefined) changes.name = user.name;
    if (updateUserDto.bio !== undefined) changes.bio = user.bio;
    if (updateUserDto.websiteUrl !== undefined) changes.websiteUrl = user.websiteUrl;
    if (updateUserDto.socialUrl !== undefined) changes.socialUrl = user.socialUrl;
    if (confirmation || updateUserDto.password !== undefined) {
      changes.pendingEmail = user.pendingEmail;
      changes.emailChangeTokenHash = user.emailChangeTokenHash;
      changes.emailChangeExpiresAt = user.emailChangeExpiresAt;
    }
    if (updateUserDto.password !== undefined) {
      changes.passwordHash = user.passwordHash;
      changes.authVersion = user.authVersion;
      changes.refreshTokenHash = null;
      changes.resetPasswordTokenHash = null;
      changes.resetPasswordExpiresAt = null;
    }
    if (updateUserDto.birthDate !== undefined) {
      if (user.birthDate) {
        const existingParts = parseBirthDateParts(user.birthDate);
        const newParts = parseBirthDateParts(updateUserDto.birthDate);
        if (
          !existingParts ||
          !newParts ||
          existingParts.year !== newParts.year ||
          existingParts.month !== newParts.month ||
          existingParts.day !== newParts.day
        ) {
          throw new BadRequestException('A data de nascimento já foi informada e não pode ser alterada diretamente.');
        }
      } else {
        if (!parseBirthDateParts(updateUserDto.birthDate)) {
          throw new BadRequestException('Data de nascimento inválida.');
        }
        const age = calculateAge(updateUserDto.birthDate);
        if (age === null || age < 18 || age > 120) {
          throw new BadRequestException('O acesso e validação são restritos a maiores de 18 anos.');
        }
        user.birthDate = updateUserDto.birthDate;
        changes.birthDate = updateUserDto.birthDate;
      }
    }

    if (Object.keys(changes).length) {
      const result = await this.usersRepository.update({ id, isActive: true, authVersion: previousAuthVersion }, changes);
      if (!result.affected) throw new ConflictException('Conta alterada simultaneamente; autentique-se novamente e tente outra vez.');
    }
    if (confirmation) {
      await this.mailService.sendEmailChangeConfirmation(confirmation.email, confirmation.token);
    }

    this.logger.log(`Usuário ${id} atualizado por ${requester.userId}`);
    return this.toPublic(user);
  }

  async closeAccount(
    id: string,
    requester: UserRequester,
    passwordConfirm?: string,
    totpCode?: string,
    reason?: string,
  ): Promise<{ protocol: string; message: string }> {
    this.assertCanManage(id, requester);

    const user = await this.usersRepository.findOne({
      where: { id, isActive: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    if (isAdministrator(user.role)) {
      throw new ForbiddenException('Não é permitido excluir uma conta administrativa por esta rota.');
    }

    if (passwordConfirm) {
      const authUser = await this.findByEmailForAuth(user.email);
      const match = authUser?.passwordHash ? await bcrypt.compare(passwordConfirm, authUser.passwordHash) : false;
      if (!match) {
        throw new UnauthorizedException('Senha incorreta.');
      }
    }

    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const protocol = `GRIF-DEL-${todayStr}-${randomBytes(3).toString('hex').toUpperCase()}`;
    const emailHash = createHash('sha256').update(user.email.toLowerCase()).digest('hex');

    await this.usersRepository.manager.transaction(async manager => {
      // 1. Unpublish posts to avoid orphaned posts with null author
      await manager.query(
        `UPDATE posts SET published = false, is_active = false, updated_at = now() WHERE author_id = $1`,
        [id],
      );

      // 2. Remove profile photo file
      if (user.profilePhoto) {
        if (this.storage) {
          await this.storage.delete(user.profilePhoto);
        } else {
          const photoName = user.profilePhoto.match(/^\/uploads\/profile-photos\/([0-9a-f-]+\.(?:jpg|png|webp))$/i)?.[1];
          if (photoName) {
            const photoPath = join(process.cwd(), 'uploads', 'profile-photos', photoName);
            await unlink(photoPath).catch(() => undefined);
          }
        }
      }

      // 3. Anonymize user record
      const anonymizedEmail = `deleted-${id}@anon.griforio.invalid`;
      await manager.getRepository(User).update(id, {
        name: 'Conta encerrada',
        email: anonymizedEmail,
        bio: null,
        websiteUrl: null,
        socialUrl: null,
        profilePhoto: null,
        recoveryEmail: null,
        pendingEmail: null,
        totpSecret: null,
        totpPendingSecret: null,
        totpEnabled: false,
        refreshTokenHash: null,
        authVersion: () => 'auth_version + 1',
        isActive: false,
      });

      // 4. Soft remove user
      await manager.getRepository(User).softDelete(id);

      // 5. Invalidate active sessions
      await manager.query(`DELETE FROM auth_sessions WHERE user_id = $1`, [id]);

      // 6. Record deletion request
      await manager.query(
        `INSERT INTO account_deletion_requests (protocol, user_id, user_email_hash, status, reason, requested_at, scheduled_for, completed_at)
         VALUES ($1, $2, $3, 'COMPLETED', $4, now(), now() + interval '30 days', now())`,
        [protocol, id, emailHash, reason ?? null],
      );

      // 7. Audit log
      await manager.query(
        `INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
         VALUES ($1, 'user.deleted', 'user', $1, $2::jsonb)`,
        [id, JSON.stringify({ protocol, reason: reason ?? null })],
      );
    });

    this.logger.log(`Usuário ${id} desativado com protocolo ${protocol} por ${requester.userId}`);
    return {
      protocol,
      message: 'Sua conta foi encerrada com sucesso e seus dados foram anonimizados. Suas sessões foram revogadas.',
    };
  }

  async remove(id: string, requester: UserRequester): Promise<{ protocol: string; message: string }> {
    return this.closeAccount(id, requester);
  }

  async confirmEmailChange(token: string): Promise<{ message: string }> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    try {
      const result = await this.usersRepository.createQueryBuilder()
        .update(User)
        .set({
          email: () => 'pending_email',
          pendingEmail: null,
          emailChangeTokenHash: null,
          emailChangeExpiresAt: null,
          refreshTokenHash: null,
          resetPasswordTokenHash: null,
          resetPasswordExpiresAt: null,
          authVersion: () => 'auth_version + 1',
        })
        .where('email_change_token_hash = :tokenHash', { tokenHash })
        .andWhere('email_change_expires_at > CURRENT_TIMESTAMP')
        .andWhere('pending_email IS NOT NULL AND is_active = true AND deleted_at IS NULL')
        .andWhere('(recovery_email IS NULL OR lower(pending_email) <> lower(recovery_email))')
        .execute();
      if (!result.affected) throw new BadRequestException('Token inválido ou expirado.');
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('O novo e-mail já está em uso.');
      }
      throw error;
    }
    return { message: 'E-mail confirmado com sucesso.' };
  }

  async findByEmailForAuth(email: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();
  }

  async recordFailedLogin(userId: string): Promise<void> {
    await this.usersRepository.createQueryBuilder().update(User).set({
      failedLoginAttempts: () => 'failed_login_attempts + 1',
      loginLockedUntil: () => `CASE WHEN failed_login_attempts + 1 >= 5 THEN CURRENT_TIMESTAMP + (LEAST(3600, 900 * power(2, LEAST(failed_login_attempts - 4, 6))) * INTERVAL '1 second') ELSE login_locked_until END`,
    }).where('id = :userId AND (login_locked_until IS NULL OR login_locked_until <= CURRENT_TIMESTAMP)', { userId }).execute();
  }

  async suspensionReason(userId: string): Promise<string> {
    const rows: { reason: string }[] = await this.usersRepository.query(`SELECT details->>'reason' AS reason FROM audit_logs
      WHERE target_type = 'user' AND target_id = $1 AND action = 'user.suspend' ORDER BY created_at DESC, id DESC LIMIT 1`, [userId]);
    return rows[0]?.reason ?? 'Conta suspensa pela administração.';
  }

  async upgradePasswordHash(userId: string, previousHash: string, passwordHash: string): Promise<void> {
    // A concurrent password reset must win over a transparent cost upgrade.
    await this.usersRepository.update({ id: userId, passwordHash: previousHash }, { passwordHash });
  }

  async clearFailedLogins(userId: string): Promise<boolean> {
    const result = await this.usersRepository.createQueryBuilder().update(User)
      .set({ failedLoginAttempts: 0, loginLockedUntil: null })
      .where('id = :userId AND (login_locked_until IS NULL OR login_locked_until <= CURRENT_TIMESTAMP)', { userId }).execute();
    return !!result.affected;
  }

  async updateRefreshTokenHash(
    userId: string,
    refreshTokenHash: string | null,
  ): Promise<void> {
    await this.usersRepository.update(userId, { refreshTokenHash });
  }

  async findByIdForAuth(id: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.refreshTokenHash')
      .where('user.id = :id', { id })
      .andWhere('user.isActive = true')
      .getOne();
  }

  async setResetPasswordToken(
    email: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<User | null> {
    const result = await this.usersRepository.createQueryBuilder().update(User)
      .set({ resetPasswordTokenHash: tokenHash, resetPasswordExpiresAt: expiresAt })
      .where('email = :email AND is_active = true AND deleted_at IS NULL', { email })
      .returning(['id', 'email', 'name']).execute();
    return (result.raw[0] as User | undefined) ?? null;
  }

  async findByResetPasswordToken(tokenHash: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect(['user.resetPasswordTokenHash', 'user.resetPasswordExpiresAt'])
      .where('user.resetPasswordTokenHash = :tokenHash', { tokenHash })
      .andWhere('user.isActive = true')
      .getOne();
  }

  async resetPassword(userId: string, newPasswordHash: string): Promise<void> {
    await this.usersRepository.manager.transaction(async manager => {
      await manager.getRepository(User).update(userId, {
        passwordHash: newPasswordHash,
        resetPasswordTokenHash: null,
        resetPasswordExpiresAt: null,
        refreshTokenHash: null,
        pendingEmail: null,
        emailChangeTokenHash: null,
        emailChangeExpiresAt: null,
        authVersion: () => 'auth_version + 1',
      });
      await manager.query(`INSERT INTO audit_logs (actor_id, action, target_type, target_id) VALUES ($1, 'auth.password_reset', 'user', $1)`, [userId]);
    });
    this.logger.log(
      `Senha redefinida e sessões invalidadas para o usuário ${userId}`,
    );
  }
}
