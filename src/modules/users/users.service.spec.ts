import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { User } from './entities/user.entity.js';
import { UserRole } from './enums/user.enum.js';

describe('UsersService', () => {
  let service: UsersService;
  let mockUsersRepository: any;

  beforeEach(async () => {
    mockUsersRepository = {
      findOne: vi.fn(),
      findAndCount: vi.fn(),
      create: vi.fn((data) => data),
      save: vi.fn((data) => Promise.resolve(data)),
      softRemove: vi.fn((data) => Promise.resolve(data)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
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
