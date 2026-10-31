import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { UserRole } from './enums/user.enum.js';
import { ROLES_KEY } from '../../common/decorators/roles.decorator.js';

describe('UsersController', () => {
  let controller: UsersController;
  let mockUsersService: any;

  beforeEach(async () => {
    mockUsersService = {
      findAll: vi.fn(),
      findByIdForRequester: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      updateProfilePhoto: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('deve possuir a metadata de roles restrita a ADMIN', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, UsersController.prototype.findAll);
      expect(roles).toBeDefined();
      expect(roles).toEqual([UserRole.ADMIN]);
    });

    it('deve chamar usersService.findAll com os parâmetros de paginação', async () => {
      const query = { page: 1, limit: 10 };
      mockUsersService.findAll.mockResolvedValue({ data: [], meta: {} });

      await controller.findAll(query);

      expect(mockUsersService.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('findById', () => {
    it('deve chamar usersService.findByIdForRequester passando o id e o usuário logado', async () => {
      const req: any = { user: { userId: 'solicitante-uuid', role: UserRole.READER } };
      mockUsersService.findByIdForRequester.mockResolvedValue({ id: 'user-uuid', name: 'Alvo' });

      const result = await controller.findById('user-uuid', req);

      expect(mockUsersService.findByIdForRequester).toHaveBeenCalledWith('user-uuid', req.user);
      expect(result).toEqual({ id: 'user-uuid', name: 'Alvo' });
    });
  });
});
