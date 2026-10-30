import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { User } from './entities/user.entity.js';
import { UserRole } from './enums/user.enum.js';

export interface UserRequester {
  userId: string;
  role: UserRole;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
  ) {}

  private toPublic(user: User) {
    return {
      id: user.id,
      name: user.name,
      profilePhoto: user.profilePhoto,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
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
    const jpeg =
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff;
    const png =
      buffer.length >= 8 &&
      buffer
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const webp =
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP';
    if (!jpeg && !png && !webp)
      throw new BadRequestException('A imagem deve ser JPEG, PNG ou WebP.');
    const directory = join(process.cwd(), 'uploads', 'profile-photos');
    await mkdir(directory, { recursive: true });
    const filename = `${randomUUID()}.${jpeg ? 'jpg' : png ? 'png' : 'webp'}`;
    await writeFile(join(directory, filename), buffer, { flag: 'wx' });
    user.profilePhoto = `/uploads/profile-photos/${filename}`;
    return this.toPublic(await this.usersRepository.save(user));
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

    const user = this.usersRepository.create({
      name,
      email,
      passwordHash,
      role: UserRole.READER,
      isActive: true,
    });
    const savedUser = await this.usersRepository.save(user);

    this.logger.log(`Usuário ${savedUser.id} cadastrado`);
    return this.toPublic(savedUser);
  }

  async findAll(): Promise<User[]> {
    return this.usersRepository.find({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { id, isActive: true },
    });
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    requester: UserRequester,
  ) {
    this.assertCanManage(id, requester);

    const user = await this.usersRepository.findOne({
      where: { id, isActive: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
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

        user.email = email;
      }
    }

    if (updateUserDto.password !== undefined) {
      if (Buffer.byteLength(updateUserDto.password, 'utf8') > 72) {
        throw new BadRequestException('A senha é muito longa.');
      }

      user.passwordHash = await bcrypt.hash(updateUserDto.password, 12);
      user.refreshTokenHash = null;
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

  async findByEmailForAuth(email: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .andWhere('user.isActive = true')
      .getOne();
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
    });
    this.logger.log(
      `Senha redefinida e sessões invalidadas para o usuário ${userId}`,
    );
  }
}
