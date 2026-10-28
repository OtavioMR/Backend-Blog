import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import type { CookieOptions } from 'express';

import { UsersService } from '../users/users.service.js';
import { UserRole } from '../users/enums/user.enum.js';
import { LoginDto } from './dto/login.dto.js';

export interface TokenPairResult {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  refreshExpiresIn: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  getRefreshTokenCookieOptions(): CookieOptions {
    const refreshExpiresIn = Number(
      this.configService.get('JWT_REFRESH_EXPIRES_IN') ?? 604800,
    );
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';

    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: refreshExpiresIn * 1000,
    };
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: UserRole,
  ): Promise<TokenPairResult> {
    const payload = {
      sub: userId,
      email,
      role,
    };

    const refreshPayload = {
      jti: randomUUID(),
      sub: userId,
    };

    const accessSecret = this.configService.getOrThrow<string>('JWT_SECRET');
    const accessExpiresIn = Number(
      this.configService.get('JWT_EXPIRES_IN') ?? 900,
    );
    const refreshSecret =
      this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    const refreshExpiresIn = Number(
      this.configService.get('JWT_REFRESH_EXPIRES_IN') ?? 604800,
    );

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessSecret,
        expiresIn: accessExpiresIn,
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: refreshSecret,
        expiresIn: refreshExpiresIn,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: accessExpiresIn,
      refreshExpiresIn,
    };
  }

  async login(loginDto: LoginDto): Promise<TokenPairResult> {
    const email = loginDto.email.trim().toLowerCase();

    const user = await this.usersService.findByEmailForAuth(email);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    const passwordIsValid = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!passwordIsValid) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);

    const refreshTokenHash = await bcrypt.hash(
      this.hashToken(tokens.refreshToken),
      10,
    );
    await this.usersService.updateRefreshTokenHash(user.id, refreshTokenHash);

    return tokens;
  }

  async refresh(refreshToken: string): Promise<TokenPairResult> {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token não fornecido no cookie.');
    }

    const refreshSecret =
      this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');

    let payload: { sub: string };
    try {
      payload = await this.jwtService.verifyAsync<{ sub: string }>(
        refreshToken,
        {
          secret: refreshSecret,
        },
      );
    } catch {
      throw new UnauthorizedException('Refresh token inválido ou expirado.');
    }

    if (!payload || !payload.sub) {
      throw new UnauthorizedException('Refresh token inválido.');
    }

    const user = await this.usersService.findByIdForAuth(payload.sub);

    if (!user || !user.isActive || !user.refreshTokenHash) {
      throw new UnauthorizedException('Refresh token revogado, usuário inativo ou inválido.');
    }

    const isMatch = await bcrypt.compare(
      this.hashToken(refreshToken),
      user.refreshTokenHash,
    );

    if (!isMatch) {
      throw new UnauthorizedException('Refresh token inválido ou reutilizado.');
    }

    // Rotação estrita: gera novo par e substitui o hash anterior no banco
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    const newRefreshTokenHash = await bcrypt.hash(
      this.hashToken(tokens.refreshToken),
      10,
    );
    await this.usersService.updateRefreshTokenHash(
      user.id,
      newRefreshTokenHash,
    );

    return tokens;
  }

  async logout(userId: string): Promise<{ message: string }> {
    await this.usersService.updateRefreshTokenHash(userId, null);
    return {
      message: 'Logout realizado com sucesso.',
    };
  }
}
