import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';

import { AuthService } from './auth.service.js';
import { UsersService } from '../users/users.service.js';
import { MailService } from '../mail/mail.service.js';

describe('AuthService', () => {
  let service: AuthService;
  let mockUsersService: any;
  let mockJwtService: any;
  let mockConfigService: any;
  let mockMailService: any;

  beforeEach(async () => {
    mockUsersService = {
      findByEmailForAuth: vi.fn(),
      findByIdForAuth: vi.fn(),
      updateRefreshTokenHash: vi.fn(),
      setResetPasswordToken: vi.fn(),
      findByResetPasswordToken: vi.fn(),
      resetPassword: vi.fn(),
    };

    mockJwtService = {
      signAsync: vi.fn(),
      verifyAsync: vi.fn(),
    };

    mockConfigService = {
      get: vi.fn((key: string, defaultValue?: any) => {
        if (key === 'FRONTEND_URL') return 'http://localhost:3000';
        return defaultValue;
      }),
      getOrThrow: vi.fn(),
    };

    mockMailService = {
      sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: MailService,
          useValue: mockMailService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('forgotPassword', () => {
    it('should generate token, store hash, and send email when user exists', async () => {
      mockUsersService.setResetPasswordToken.mockResolvedValue({
        id: 'user-uuid',
        email: 'test@example.com',
        name: 'Test User',
      });

      const result = await service.forgotPassword({
        email: 'test@example.com',
      });

      expect(mockUsersService.setResetPasswordToken).toHaveBeenCalledWith(
        'test@example.com',
        expect.any(String),
        expect.any(Date),
      );
      expect(mockMailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'test@example.com',
        expect.stringContaining('http://localhost:3000/reset-password?token='),
        'Test User',
      );
      expect(result).toEqual({
        message:
          'Se o e-mail informado estiver cadastrado, as instruções para redefinição de senha foram enviadas.',
      });
    });

    it('should not call mail service and return generic message if user is not found', async () => {
      mockUsersService.setResetPasswordToken.mockResolvedValue(null);

      const result = await service.forgotPassword({
        email: 'unknown@example.com',
      });

      expect(mockUsersService.setResetPasswordToken).toHaveBeenCalled();
      expect(mockMailService.sendPasswordResetEmail).not.toHaveBeenCalled();
      expect(result).toEqual({
        message:
          'Se o e-mail informado estiver cadastrado, as instruções para redefinição de senha foram enviadas.',
      });
    });
  });

  describe('resetPassword', () => {
    it('should throw BadRequestException if token is invalid / user not found', async () => {
      mockUsersService.findByResetPasswordToken.mockResolvedValue(null);

      await expect(
        service.resetPassword({
          token: 'invalid-token',
          newPassword: 'NewPassword123!',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if reset token has expired', async () => {
      mockUsersService.findByResetPasswordToken.mockResolvedValue({
        id: 'user-uuid',
        resetPasswordExpiresAt: new Date(Date.now() - 1000 * 60), // expirado há 1 minuto
      });

      await expect(
        service.resetPassword({
          token: 'expired-token',
          newPassword: 'NewPassword123!',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update password and invalidate sessions when token is valid', async () => {
      mockUsersService.findByResetPasswordToken.mockResolvedValue({
        id: 'user-uuid',
        resetPasswordExpiresAt: new Date(Date.now() + 1000 * 60 * 15), // expira em 15 min
      });
      mockUsersService.resetPassword.mockResolvedValue(undefined);

      const result = await service.resetPassword({
        token: 'valid-token',
        newPassword: 'NewPassword123!',
      });

      expect(mockUsersService.resetPassword).toHaveBeenCalledWith(
        'user-uuid',
        expect.any(String),
      );
      expect(result).toEqual({
        message: 'Senha redefinida com sucesso.',
      });
    });
  });
});
