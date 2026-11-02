import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import bcrypt from 'bcrypt';
import type { CookieOptions } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { TotpService } from './totp.service.js';
import { AuthSession } from './entities/session.entity.js';

import { UsersService } from '../users/users.service.js';
import { MailService } from '../mail/mail.service.js';
import { User } from '../users/entities/user.entity.js';
import { UserRole } from '../users/enums/user.enum.js';
import { LoginDto } from './dto/login.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';

export interface TokenPairResult {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  refreshExpiresIn: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    @InjectRepository(AuthSession) private readonly sessions: Repository<AuthSession>,
    private readonly totp: TotpService,
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
    authVersion: number,
    sessionId: string,
  ): Promise<TokenPairResult> {
    const payload = {
      sub: userId,
      email,
      role,
      authVersion,
      sid: sessionId,
    };

    const refreshPayload = {
      jti: randomUUID(),
      sid: sessionId,
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

  async login(loginDto: LoginDto, userAgent?: string): Promise<TokenPairResult> {
    const email = loginDto.email.trim().toLowerCase();

    const user = await this.usersService.findByEmailForAuth(email);

    // Compare even for unknown users to avoid a cheap account enumeration oracle.
    const hash = user?.passwordHash ?? '$2b$12$1V0Y5v5dUHYeOwtoasAswuk3ESkRespVkPTfR2TzRFdg.y65Vxk/S';
    const passwordIsValid = await bcrypt.compare(loginDto.password, hash);
    const rounds = bcrypt.getRounds(hash);
    // Legacy cost-10 accounts and current/unknown accounts do the same total
    // bcrypt work (one cost-10 comparison plus one cost-12 comparison).
    await bcrypt.compare(loginDto.password, rounds === 10
      ? '$2b$12$1V0Y5v5dUHYeOwtoasAswuk3ESkRespVkPTfR2TzRFdg.y65Vxk/S'
      : '$2b$10$1V0Y5v5dUHYeOwtoasAswuk3ESkRespVkPTfR2TzRFdg.y65Vxk/S');
    const locked = !!user?.loginLockedUntil && new Date(user.loginLockedUntil).getTime() > Date.now();
    if (user?.moderationSuspended && passwordIsValid && !locked && Buffer.byteLength(loginDto.password, 'utf8') <= 72) {
      throw new ForbiddenException({ statusCode: 403, message: 'Conta suspensa.',
        reason: await this.usersService.suspensionReason(user.id), endsAt: user.suspensionEndsAt });
    }
    if (!user || !user.isActive || user.emailVerified === false || !passwordIsValid || Buffer.byteLength(loginDto.password, 'utf8') > 72 || locked) {
      if (user && !passwordIsValid && !locked) await this.usersService.recordFailedLogin(user.id);
      throw new UnauthorizedException('E-mail ou senha inv\u00e1lidos.');
    }
    if (user.totpEnabled && !(await this.totp.verifyLogin(user.id, loginDto.totpCode))) {
      await this.usersService.recordFailedLogin(user.id);
      throw new UnauthorizedException('Credenciais inválidas.');
    }
    if (!(await this.usersService.clearFailedLogins(user.id))) {
      throw new UnauthorizedException('E-mail ou senha inv\u00e1lidos.');
    }
    if (rounds < 12) await this.usersService.upgradePasswordHash(user.id, hash, await bcrypt.hash(loginDto.password, 12));

    return this.createSession(user, userAgent);
  }

  async createSession(user: User, userAgent?: string): Promise<TokenPairResult> {
    const sessionId = randomUUID();
    const tokens = await this.generateTokens(user.id, user.email, user.role, user.authVersion, sessionId);
    const now = new Date();
    await this.sessions.manager.transaction(async manager => {
      await manager.getRepository(AuthSession).save({ id: sessionId, userId: user.id, authVersion: user.authVersion,
        tokenHash: this.hashToken(tokens.refreshToken), userAgent: userAgent?.slice(0, 500) || null,
        lastUsedAt: now, expiresAt: new Date(now.getTime() + tokens.refreshExpiresIn * 1000) });
      await manager.query(`INSERT INTO audit_logs (actor_id, action, target_type, target_id) VALUES ($1, 'auth.session_created', 'session', $2)`, [user.id, sessionId]);
    });
    this.logger.log(`Login realizado para usuario ${user.id}`);
    return tokens;
  }

  async refresh(refreshToken: string): Promise<TokenPairResult> {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token não fornecido no cookie.');
    }

    const refreshSecret =
      this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');

    let payload: { sub: string; sid: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, { secret: refreshSecret });
    } catch {
      throw new UnauthorizedException('Refresh token inválido ou expirado.');
    }
    if (!payload?.sub || !payload.sid) throw new UnauthorizedException('Refresh token inválido.');
    const user = await this.usersService.findByIdForAuth(payload.sub);
    if (!user || !user.isActive) throw new UnauthorizedException('Usuário inválido.');
    const tokens = await this.generateTokens(user.id, user.email, user.role, user.authVersion, payload.sid);
    const now = new Date();
    // Compare-and-swap ensures concurrent refresh requests cannot both rotate the same token.
    const result = await this.sessions.update({ id: payload.sid, userId: user.id,
      authVersion: user.authVersion, tokenHash: this.hashToken(refreshToken), expiresAt: MoreThan(now) },
      { tokenHash: this.hashToken(tokens.refreshToken), lastUsedAt: now,
        expiresAt: new Date(now.getTime() + tokens.refreshExpiresIn * 1000) });
    if (!result.affected) {
      await this.revokeSession(user.id, payload.sid);
      throw new UnauthorizedException('Refresh token inválido ou reutilizado.');
    }

    this.logger.log(`Tokens renovados para usuário ${user.id}`);
    return tokens;
  }

  async listSessions(userId: string, sessionId: string, authVersion: number) {
    const sessions = await this.sessions.find({ where: { userId, authVersion, expiresAt: MoreThan(new Date()) }, order: { createdAt: 'DESC' } });
    return sessions.map(({ id, userAgent, createdAt, lastUsedAt, expiresAt }) => ({ id, userAgent, createdAt, lastUsedAt, expiresAt, current: id === sessionId }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    await this.sessions.manager.transaction(async manager => {
      const result = await manager.getRepository(AuthSession).delete({ id: sessionId, userId });
      if (result.affected) await manager.query(`INSERT INTO audit_logs (actor_id, action, target_type, target_id) VALUES ($1, 'auth.session_revoked', 'session', $2)`, [userId, sessionId]);
    });
  }

  async logout(userId: string, sessionId: string): Promise<{ message: string }> {
    await this.revokeSession(userId, sessionId);
    return { message: 'Logout realizado com sucesso.' };
  }

  async forgotPassword(
    forgotPasswordDto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    const started = performance.now();
    const email = forgotPasswordDto.email.trim().toLowerCase();
    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutos

    const user = await this.usersService.setResetPasswordToken(
      email,
      tokenHash,
      expiresAt,
    );

    if (user) {
      const frontendUrl = this.configService.get<string>(
        'FRONTEND_URL',
        'http://localhost:3000',
      );
      const resetLink = `${frontendUrl}/reset-password?token=${token}`;
      try {
        await this.mailService.sendPasswordResetEmail(user.email, resetLink, user.name);
      } catch {
        this.logger.error('Falha ao enfileirar e-mail de recuperação de senha.');
      }
    }

    await delay(Math.max(0, 35 - (performance.now() - started)));
    return {
      message:
        'Se o e-mail informado estiver cadastrado, as instruções para redefinição de senha foram enviadas.',
    };
  }

  async resetPassword(
    resetPasswordDto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    const token = resetPasswordDto.token.trim();
    const tokenHash = this.hashToken(token);

    const user = await this.usersService.findByResetPasswordToken(tokenHash);

    if (
      !user ||
      !user.resetPasswordExpiresAt ||
      new Date() > new Date(user.resetPasswordExpiresAt)
    ) {
      throw new BadRequestException(
        'Token de recuperação inválido ou expirado.',
      );
    }

    if (Buffer.byteLength(resetPasswordDto.newPassword, 'utf8') > 72) {
      throw new BadRequestException('A senha é muito longa.');
    }
    const passwordHash = await bcrypt.hash(resetPasswordDto.newPassword, 12);
    await this.usersService.resetPassword(user.id, passwordHash);

    return {
      message: 'Senha redefinida com sucesso.',
    };
  }
}
