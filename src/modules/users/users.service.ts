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

  async create(createUserDto: CreateUserDto) {
    const name = createUserDto.name.trim();
    const email = createUserDto.email.trim().toLowerCase();
    const password = createUserDto.password;

    if (name.length < 2) {
      throw new BadRequestException('O nome precisa ter pelo menos 2 caracteres.');
    }

    if (Buffer.byteLength(password, 'utf8') > 72) {
      throw new BadRequestException('A senha é muito longa.');
    }

    const existingUser = await this.usersRepository.findOne({
      where: { email },
      withDeleted: true,
    });

    if (existingUser) {
      throw new ConflictException('Já existe um usuário cadastrado com este e-mail.');
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

  async update(id: string, updateUserDto: UpdateUserDto, requester: UserRequester) {
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
        throw new BadRequestException('O nome precisa ter pelo menos 2 caracteres.');
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
          throw new ConflictException('Já existe um usuário cadastrado com este e-mail.');
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
}
