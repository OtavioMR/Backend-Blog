import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
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
      getRefreshTokenCookieOptions: vi.fn().mockReturnValue({
        httpOnly: true,
        secure: false,
        sameSite: 'strict',
        path: '/api/v1/auth',
        maxAge: 604800000,
      }),
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

  describe('login', () => {
    it('should authenticate user, set refreshToken cookie and return access_token', async () => {
      const loginDto = { email: 'user@example.com', password: 'Password123!' };
      const tokens = {
        accessToken: 'access-123',
        refreshToken: 'refresh-456',
        tokenType: 'Bearer',
        expiresIn: 900,
        refreshExpiresIn: 604800,
      };
      mockAuthService.login.mockResolvedValue(tokens);

      const mockRes: any = {
        cookie: vi.fn(),
      };

      const result = await controller.login(loginDto, mockRes);

      expect(mockAuthService.login).toHaveBeenCalledWith(loginDto);
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'refresh-456',
        expect.objectContaining({ httpOnly: true, sameSite: 'strict' }),
      );
      expect(result).toEqual({
        access_token: 'access-123',
        token_type: 'Bearer',
        expires_in: 900,
      });
    });
  });

  describe('refresh', () => {
    it('should throw UnauthorizedException if refresh token is missing in cookies', async () => {
      const req: any = { cookies: {} };
      const res: any = { cookie: vi.fn() };

      await expect(controller.refresh(req, res)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should refresh tokens when refreshToken cookie is present', async () => {
      const req: any = {
        cookies: { refreshToken: 'valid-cookie-token' },
      };
      const res: any = { cookie: vi.fn() };
      const tokens = {
        accessToken: 'new-access-123',
        refreshToken: 'new-refresh-456',
        tokenType: 'Bearer',
        expiresIn: 900,
        refreshExpiresIn: 604800,
      };
      mockAuthService.refresh.mockResolvedValue(tokens);

      const result = await controller.refresh(req, res);

      expect(mockAuthService.refresh).toHaveBeenCalledWith(
        'valid-cookie-token',
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'new-refresh-456',
        expect.any(Object),
      );
      expect(result).toEqual({
        access_token: 'new-access-123',
        token_type: 'Bearer',
        expires_in: 900,
      });
    });

    it('should support refresh_token fallback cookie name', async () => {
      const req: any = {
        cookies: { refresh_token: 'valid-fallback-token' },
      };
      const res: any = { cookie: vi.fn() };
      mockAuthService.refresh.mockResolvedValue({
        accessToken: 'new-access-123',
        refreshToken: 'new-refresh-456',
        tokenType: 'Bearer',
        expiresIn: 900,
      });

      const result = await controller.refresh(req, res);

      expect(mockAuthService.refresh).toHaveBeenCalledWith(
        'valid-fallback-token',
      );
      expect(result.access_token).toBe('new-access-123');
    });
  });

  describe('logout', () => {
    it('should clear refreshToken cookie and call authService.logout', async () => {
      const req: any = {
        user: { userId: 'user-uuid' },
      };
      const res: any = {
        clearCookie: vi.fn(),
      };
      mockAuthService.logout.mockResolvedValue({
        message: 'Logout realizado com sucesso.',
      });

      const result = await controller.logout(req, res);

      expect(res.clearCookie).toHaveBeenCalledWith(
        'refreshToken',
        expect.objectContaining({ httpOnly: true }),
      );
      expect(mockAuthService.logout).toHaveBeenCalledWith('user-uuid');
      expect(result).toEqual({
        message: 'Logout realizado com sucesso.',
      });
    });
  });

  describe('forgotPassword', () => {
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
  });

  describe('resetPassword', () => {
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
});
