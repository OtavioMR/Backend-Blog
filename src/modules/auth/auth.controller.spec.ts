import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

describe('AuthController', () => {
  let controller: AuthController;
  let mockAuthService: any;

  beforeEach(async () => {
    mockAuthService = {
      login: vi.fn(),
      refresh: vi.fn(),
      logout: vi.fn(),
      forgotPassword: vi.fn(),
      resetPassword: vi.fn(),
      getRefreshTokenCookieOptions: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate forgotPassword to authService', async () => {
    const dto = { email: 'test@example.com' };
    mockAuthService.forgotPassword.mockResolvedValue({
      message:
        'Se o e-mail informado estiver cadastrado, as instruções para redefinição de senha foram enviadas.',
    });

    const result = await controller.forgotPassword(dto);

    expect(mockAuthService.forgotPassword).toHaveBeenCalledWith(dto);
    expect(result.message).toContain('instruções para redefinição');
  });

  it('should delegate resetPassword to authService', async () => {
    const dto = { token: 'token123', newPassword: 'NewPassword123!' };
    mockAuthService.resetPassword.mockResolvedValue({
      message: 'Senha redefinida com sucesso.',
    });

    const result = await controller.resetPassword(dto);

    expect(mockAuthService.resetPassword).toHaveBeenCalledWith(dto);
    expect(result.message).toBe('Senha redefinida com sucesso.');
  });
});
