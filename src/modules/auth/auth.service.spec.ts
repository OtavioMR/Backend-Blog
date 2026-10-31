import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcrypt';

import { AuthService } from './auth.service.js';
import { UsersService } from '../users/users.service.js';
import { MailService } from '../mail/mail.service.js';
import { UserRole } from '../users/enums/user.enum.js';

describe('AuthService', () => {
  let service: AuthService;
  let mockUsersService: any;
  let mockJwtService: any;
  let mockConfigService: any;
  let mockMailService: any;

  beforeEach(async () => {
    vi.restoreAllMocks();

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
        if (key === 'JWT_EXPIRES_IN') return 900;
        if (key === 'JWT_REFRESH_EXPIRES_IN') return 604800;
        if (key === 'NODE_ENV') return 'test';
        return defaultValue;
      }),
      getOrThrow: vi.fn((key: string) => {
        if (key === 'JWT_SECRET') return 'test-access-secret';
        if (key === 'JWT_REFRESH_SECRET') return 'test-refresh-secret';
        return 'test-secret';
      }),
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

  describe('getRefreshTokenCookieOptions', () => {
    it('should return cookie options with httpOnly, strict sameSite and correct path', () => {
      const options = service.getRefreshTokenCookieOptions();
      expect(options.httpOnly).toBe(true);
      expect(options.sameSite).toBe('strict');
      expect(options.path).toBe('/api/v1/auth');
      expect(options.maxAge).toBe(604800 * 1000);
      expect(options.secure).toBe(false);
    });
  });

  describe('login', () => {
    const validLoginDto = {
      email: 'user@example.com',
      password: 'Password123!',
    };

    const mockUser = {
      id: 'uuid-123',
      email: 'user@example.com',
      role: UserRole.READER,
      isActive: true,
      passwordHash: 'hashed-password',
    };

    it('should login successfully and return token pair', async () => {
      mockUsersService.findByEmailForAuth.mockResolvedValue(mockUser);
      vi.spyOn(bcrypt, 'compare').mockImplementation(async () => true);
      vi.spyOn(bcrypt, 'hash').mockImplementation(async () => 'new-refresh-hash');

      mockJwtService.signAsync
        .mockResolvedValueOnce('access-token-123')
        .mockResolvedValueOnce('refresh-token-456');

      const result = await service.login(validLoginDto);

      expect(mockUsersService.findByEmailForAuth).toHaveBeenCalledWith(
        'user@example.com',
      );
      expect(mockUsersService.updateRefreshTokenHash).toHaveBeenCalledWith(
        'uuid-123',
        'new-refresh-hash',
      );
      expect(result).toEqual({
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
        tokenType: 'Bearer',
        expiresIn: 900,
        refreshExpiresIn: 604800,
      });
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      mockUsersService.findByEmailForAuth.mockResolvedValue(null);

      await expect(service.login(validLoginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when user is inactive', async () => {
      mockUsersService.findByEmailForAuth.mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      await expect(service.login(validLoginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('compares a dummy hash when the account does not exist', async () => {
      mockUsersService.findByEmailForAuth.mockResolvedValue(null);
      const compare = vi.spyOn(bcrypt, 'compare').mockImplementation(async () => false);
      await expect(service.login(validLoginDto)).rejects.toThrow(UnauthorizedException);
      expect(compare).toHaveBeenCalledWith(validLoginDto.password, expect.stringMatching(/^\$2b\$12\$/));
    });

    it('should throw UnauthorizedException when password does not match', async () => {
      mockUsersService.findByEmailForAuth.mockResolvedValue(mockUser);
      vi.spyOn(bcrypt, 'compare').mockImplementation(async () => false);

      await expect(service.login(validLoginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should trim and lowercase the email before querying', async () => {
      mockUsersService.findByEmailForAuth.mockResolvedValue(null);

      await expect(
        service.login({
          email: '  USER@EXAMPLE.COM  ',
          password: 'Password123!',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockUsersService.findByEmailForAuth).toHaveBeenCalledWith(
        'user@example.com',
      );
    });
  });

  describe('refresh', () => {
    const rawRefreshToken = 'valid.jwt.refreshToken';

    it('should throw UnauthorizedException when refreshToken is empty', async () => {
      await expect(service.refresh('')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when jwt verification fails', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(new Error('jwt invalid'));

      await expect(service.refresh('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when payload lacks sub', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({});

      await expect(service.refresh('token-without-sub')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when user is not found or inactive', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      mockUsersService.findByIdForAuth.mockResolvedValue(null);

      await expect(service.refresh(rawRefreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when stored refreshTokenHash does not match', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      mockUsersService.findByIdForAuth.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        role: UserRole.READER,
        isActive: true,
        refreshTokenHash: 'stored-hash',
      });
      vi.spyOn(bcrypt, 'compare').mockImplementation(async () => false);

      await expect(service.refresh(rawRefreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should rotate tokens and update stored hash when refresh token is valid', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      mockUsersService.findByIdForAuth.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        role: UserRole.READER,
        isActive: true,
        refreshTokenHash: 'stored-hash',
      });
      vi.spyOn(bcrypt, 'compare').mockImplementation(async () => true);
      vi.spyOn(bcrypt, 'hash').mockImplementation(async () => 'new-rotated-hash');

      mockJwtService.signAsync
        .mockResolvedValueOnce('new-access-token')
        .mockResolvedValueOnce('new-refresh-token');

      const result = await service.refresh(rawRefreshToken);

      expect(mockUsersService.updateRefreshTokenHash).toHaveBeenCalledWith(
        'user-1',
        'new-rotated-hash',
      );
      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        tokenType: 'Bearer',
        expiresIn: 900,
        refreshExpiresIn: 604800,
      });
    });
  });

  describe('logout', () => {
    it('should invalidate refreshTokenHash and return success message', async () => {
      mockUsersService.updateRefreshTokenHash.mockResolvedValue(undefined);

      const result = await service.logout('user-123');

      expect(mockUsersService.updateRefreshTokenHash).toHaveBeenCalledWith(
        'user-123',
        null,
      );
      expect(result).toEqual({
        message: 'Logout realizado com sucesso.',
      });
    });
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

    it('rejects passwords exceeding the bcrypt byte limit', async () => {
      mockUsersService.findByResetPasswordToken.mockResolvedValue({ id: 'user-uuid', resetPasswordExpiresAt: new Date(Date.now() + 60000) });
      await expect(service.resetPassword({ token: 'valid', newPassword: '\u00e9'.repeat(37) })).rejects.toThrow(BadRequestException);
      expect(mockUsersService.resetPassword).not.toHaveBeenCalled();
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
