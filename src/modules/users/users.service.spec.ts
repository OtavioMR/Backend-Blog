import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import bcrypt from 'bcrypt';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { User } from './entities/user.entity.js';
import { UserRole } from './enums/user.enum.js';
import { MailService } from '../mail/mail.service.js';
import { createHash } from 'node:crypto';

describe('UsersService', () => {
  let service: UsersService;
  let mockUsersRepository: any;
  let mockMailService: any;

  beforeEach(async () => {
    mockUsersRepository = {
      findOne: vi.fn(),
      findAndCount: vi.fn(),
      create: vi.fn((data) => data),
      save: vi.fn((data) => Promise.resolve(data)),
      softRemove: vi.fn((data) => Promise.resolve(data)),
    };
    mockMailService = { sendEmailChangeConfirmation: vi.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: MailService, useValue: mockMailService },
        {
          provide: getRepositoryToken(User),
          useValue: mockUsersRepository,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByIdForRequester', () => {
    const targetUser = {
      id: 'user-1',
      name: 'Maria Silva',
      profilePhoto: '/uploads/maria.webp',
      email: 'maria@example.com',
      role: UserRole.AUTHOR,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('deve retornar dados completos incluindo e-mail quando o solicitante for o próprio usuário', async () => {
      mockUsersRepository.findOne.mockResolvedValue(targetUser);
      const requester = { userId: 'user-1', role: UserRole.AUTHOR };

      const result = await service.findByIdForRequester('user-1', requester);

      expect(result).toHaveProperty('email', 'maria@example.com');
      expect(result).toHaveProperty('role', UserRole.AUTHOR);
    });

    it('deve retornar dados completos incluindo e-mail quando o solicitante for ADMIN', async () => {
      mockUsersRepository.findOne.mockResolvedValue(targetUser);
      const requester = { userId: 'admin-uuid', role: UserRole.ADMIN };

      const result = await service.findByIdForRequester('user-1', requester);

      expect(result).toHaveProperty('email', 'maria@example.com');
    });

    it('deve retornar apenas perfil público SEM e-mail quando for outro usuário comum', async () => {
      mockUsersRepository.findOne.mockResolvedValue(targetUser);
      const requester = { userId: 'outro-user-uuid', role: UserRole.READER };

      const result = await service.findByIdForRequester('user-1', requester);

      expect(result).toHaveProperty('id', 'user-1');
      expect(result).toHaveProperty('name', 'Maria Silva');
      expect(result).toHaveProperty('profilePhoto', '/uploads/maria.webp');
      expect(result).not.toHaveProperty('email');
      expect(result).not.toHaveProperty('role');
    });

    it('deve lançar NotFoundException se o usuário não for encontrado', async () => {
      mockUsersRepository.findOne.mockResolvedValue(null);
      const requester = { userId: 'user-1', role: UserRole.READER };

      await expect(service.findByIdForRequester('user-1', requester)).rejects.toThrow(NotFoundException);
    });
  });

  describe('proteção de credenciais', () => {
    const requester = { userId: 'user-1', role: UserRole.READER };
    const user = { id: 'user-1', email: 'maria@example.com', isActive: true, refreshTokenHash: 'token', authVersion: 0 };

    beforeEach(() => { mockUsersRepository.findOne.mockResolvedValue({ ...user }); });

    it('recusa senha ausente ou incorreta e não salva alterações', async () => {
      vi.spyOn(service, 'findByEmailForAuth').mockResolvedValue({ ...user, passwordHash: await bcrypt.hash('senha-atual', 4) } as User);
      await expect(service.update('user-1', { password: 'nova-senha', currentPassword: 'errada' }, requester)).rejects.toThrow('Senha atual inválida');
      await expect(service.update('user-1', { password: 'nova-senha' }, requester)).rejects.toThrow('Informe a senha atual');
      expect(mockUsersRepository.save).not.toHaveBeenCalled();
    });

    it('altera a senha do titular e revoga o refresh token', async () => {
      vi.spyOn(service, 'findByEmailForAuth').mockResolvedValue({ ...user, passwordHash: await bcrypt.hash('senha-atual', 4) } as User);
      await service.update('user-1', { password: 'nova-senha', currentPassword: 'senha-atual' }, requester);
      const saved = mockUsersRepository.save.mock.calls[0][0];
      expect(await bcrypt.compare('nova-senha', saved.passwordHash)).toBe(true);
      expect(saved.refreshTokenHash).toBeNull();
      expect(saved.authVersion).toBe(1);
    });

    it('mantém o e-mail atual até confirmar o token enviado ao novo endereço', async () => {
      mockUsersRepository.findOne.mockResolvedValueOnce({ ...user }).mockResolvedValueOnce(null);
      vi.spyOn(service, 'findByEmailForAuth').mockResolvedValue({ ...user, passwordHash: await bcrypt.hash('senha-atual', 4) } as User);
      const result = await service.update('user-1', { email: 'novo@example.com', currentPassword: 'senha-atual' }, requester);
      const saved = mockUsersRepository.save.mock.calls[0][0];
      const token = mockMailService.sendEmailChangeConfirmation.mock.calls[0][1];
      expect(token).toMatch(/^[a-f0-9]{64}$/);
      expect(result.email).toBe(user.email);
      expect(saved.pendingEmail).toBe('novo@example.com');
      expect(saved.emailChangeTokenHash).toBe(createHash('sha256').update(token).digest('hex'));
      expect(saved.emailChangeExpiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('impede administrador de alterar senha de outro usu?rio', async () => {
      await expect(service.update('user-1', { password: 'nova-senha', currentPassword: 'qualquer' }, { userId: 'admin', role: UserRole.ADMIN })).rejects.toThrow('titular');
      expect(mockUsersRepository.save).not.toHaveBeenCalled();
    });
  });

  it('consome o token de confirmação em atualização atômica e rejeita reutilização', async () => {
    const execute = vi.fn().mockResolvedValueOnce({ affected: 1 }).mockResolvedValueOnce({ affected: 0 });
    const builder: any = { update: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), andWhere: vi.fn().mockReturnThis(), execute };
    mockUsersRepository.createQueryBuilder = vi.fn().mockReturnValue(builder);
    await expect(service.confirmEmailChange('a'.repeat(64))).resolves.toHaveProperty('message');
    expect(builder.where).toHaveBeenCalledWith('email_change_token_hash = :tokenHash', { tokenHash: createHash('sha256').update('a'.repeat(64)).digest('hex') });
    expect(builder.andWhere).toHaveBeenCalledWith('email_change_expires_at > CURRENT_TIMESTAMP');
    await expect(service.confirmEmailChange('a'.repeat(64))).rejects.toThrow('Token inválido ou expirado');
  });

  describe('findAll', () => {
    it('deve retornar lista paginada e sanitizada para admin', async () => {
      const users = [
        {
          id: 'user-1',
          name: 'User 1',
          email: 'u1@example.com',
          role: UserRole.READER,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockUsersRepository.findAndCount.mockResolvedValue([users, 1]);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });
    });
  });
});
