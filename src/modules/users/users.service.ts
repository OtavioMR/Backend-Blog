import { paginationMeta } from '../../common/utils/pagination.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
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
import { UserRole } from './enums/user.enum.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import type { PaginatedResult } from '../../common/interfaces/paginated-result.interface.js';
import { MailService } from '../mail/mail.service.js';

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
  ) {}

  private toPublic(user: User) {
    return {
      id: user.id,
      name: user.name,
      profilePhoto: user.profilePhoto,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
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
    if (requester.userId !== id && requester.role !== UserRole.ADMIN) {
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
    const user = await this.usersRepository.findOne({
      where: { id, isActive: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    let image: Buffer;
    try {
      const input = sharp(buffer, { limitInputPixels: 40_000_000, failOn: 'error' });
      const metadata = await input.metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) > 1) throw new Error('Invalid image');
      image = await input.rotate().resize(512, 512, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    } catch {
      throw new BadRequestException('A imagem deve ser JPEG, PNG ou WebP v\u00e1lida.');
    }
    const directory = join(process.cwd(), 'uploads', 'profile-photos');
    await mkdir(directory, { recursive: true });
    const filename = `${randomUUID()}.webp`;
    const path = join(directory, filename);
    await writeFile(path, image, { flag: 'wx' });
    const oldPhoto = user.profilePhoto;
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
    const user = this.usersRepository.create({
      emailVerified: false,
      emailVerificationTokenHash: createHash('sha256').update(verificationToken).digest('hex'),
      emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      name,
      email,
      passwordHash,
      role: UserRole.READER,
      isActive: true,
    });
    const savedUser = await this.usersRepository.save(user);

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

    if (requester.userId === id || requester.role === UserRole.ADMIN) {
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

    if ((updateUserDto.role !== undefined || updateUserDto.isActive !== undefined) && requester.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Apenas administradores podem alterar permissões ou status.');
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

    if (updateUserDto.role !== undefined) {
      if (requester.role !== UserRole.ADMIN) {
        throw new ForbiddenException(
          'Apenas administradores podem alterar o perfil (role) de usuários.',
        );
      }
      user.role = updateUserDto.role;
    }

    if (updateUserDto.isActive !== undefined) {
      if (requester.role !== UserRole.ADMIN) {
        throw new ForbiddenException(
          'Apenas administradores podem alterar o status de ativação diretamente.',
        );
      }
      user.isActive = updateUserDto.isActive;
      if (!user.isActive) {
        user.refreshTokenHash = null;
      }
    }

    const savedUser = await this.usersRepository.save(user);
    if (confirmation) {
      await this.mailService.sendEmailChangeConfirmation(confirmation.email, confirmation.token);
    }

    this.logger.log(`Usuário ${id} atualizado por ${requester.userId}`);
    return this.toPublic(savedUser);
  }

  async remove(id: string, requester: UserRequester): Promise<void> {
    this.assertCanManage(id, requester);

    const user = await this.usersRepository.findOne({
      where: { id, isActive: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    user.isActive = false;
    user.refreshTokenHash = null;
    await this.usersRepository.save(user);
    await this.usersRepository.softRemove(user);
    this.logger.log(`Usuário ${id} desativado por ${requester.userId}`);
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
      .andWhere('user.isActive = true')
      .getOne();
  }

  async recordFailedLogin(userId: string): Promise<void> {
    await this.usersRepository.createQueryBuilder().update(User).set({
      failedLoginAttempts: () => 'failed_login_attempts + 1',
      loginLockedUntil: () => `CASE WHEN failed_login_attempts + 1 >= 5 THEN CURRENT_TIMESTAMP + (LEAST(3600, 60 * power(2, LEAST(failed_login_attempts - 4, 6))) * INTERVAL '1 second') ELSE login_locked_until END`,
    }).where('id = :userId AND (login_locked_until IS NULL OR login_locked_until <= CURRENT_TIMESTAMP)', { userId }).execute();
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
    const user = await this.usersRepository.findOne({
      where: { email, isActive: true },
    });

    if (!user) {
      return null;
    }

    user.resetPasswordTokenHash = tokenHash;
    user.resetPasswordExpiresAt = expiresAt;
    return this.usersRepository.save(user);
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
    await this.usersRepository.update(userId, {
      passwordHash: newPasswordHash,
      resetPasswordTokenHash: null,
      resetPasswordExpiresAt: null,
      refreshTokenHash: null,
      pendingEmail: null,
      emailChangeTokenHash: null,
      emailChangeExpiresAt: null,
      authVersion: () => 'auth_version + 1',
    });
    this.logger.log(
      `Senha redefinida e sessões invalidadas para o usuário ${userId}`,
    );
  }
}
