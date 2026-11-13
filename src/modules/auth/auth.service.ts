import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import bcrypt from 'bcrypt';
import type { CookieOptions, Response } from 'express';
import { MoreThan, Repository } from 'typeorm';
import { TotpService } from './totp.service.js';
import { AuthSession } from './entities/session.entity.js';
import { AuthRefreshOperation } from './entities/refresh-operation.entity.js';
import {
  decryptRecoveryResult,
  encryptRecoveryResult,
  generateSessionProof,
  getV2CookieOptions,
  isValidGenerationHeader,
  isValidOperationId,
  isValidProofValue,
  isValidUuid,
  MAX_OPERATIONS_PER_SESSION,
  parseRawV2Cookies,
  RECOVERY_WINDOW_SECONDS,
  REFRESH_PROTOCOL_V2,
  resolveRecoveryKeys,
  safeEqualHex,
  sha256Hex,
  v2ProofCookieName,
  v2RefreshCookieName,
  validateOriginAndFetchMetadata,
} from './refresh-recovery-v2.js';

import { UsersService } from '../users/users.service.js';
import { MailService } from '../mail/mail.service.js';
import { User } from '../users/entities/user.entity.js';
import { UserRole } from '../users/enums/user.enum.js';
import { LoginDto } from './dto/login.dto.js';
import { Verify2faDto } from './dto/verify-2fa.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';

export interface TokenPairResult {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  refreshExpiresIn: number;
  sessionId?: string;
  refreshGeneration?: number;
  refreshProtocol?: number;
  recoveryProof?: string;
}

export type LoginResult =
  | TokenPairResult
  | { requires2fa: true; preAuthToken: string; expiresIn: number };

export interface RefreshV2RequestInput {
  sessionIdHeader?: string;
  operationIdHeader?: string;
  generationHeader?: string;
  rawCookieHeader?: string;
  originHeader?: string;
  secFetchSite?: string;
  secFetchMode?: string;
  contentTypeHeader?: string;
  hasNonEmptyBody?: boolean;
}

export interface RefreshV2SuccessResult {
  kind: 'created' | 'recovered';
  accessToken: string;
  refreshToken: string;
  recoveryProof: string;
  tokenType: string;
  expiresIn: number;
  refreshMaxAgeMs: number;
  sessionId: string;
  generation: number;
  operationId: string;
  recoveryDeadlineIso: string;
  clearGenerations: number[];
}

export interface RefreshV2TestHooks {
  onRequestReceived?: () => Promise<void> | void;
  onUserLocked?: () => Promise<void> | void;
  onSessionLocked?: () => Promise<void> | void;
  onBeforeCommit?: () => Promise<void> | void;
  onCommitObserved?: () => Promise<void> | void;
  nowMs?: () => number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private testHooks: RefreshV2TestHooks | null = null;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    @InjectRepository(AuthSession) private readonly sessions: Repository<AuthSession>,
    private readonly totp: TotpService,
  ) {}

  setTestHooks(hooks: RefreshV2TestHooks | null): void {
    if (this.configService.get<string>('NODE_ENV') === 'production' && !process.env.ALLOW_TEST_HOOKS) {
      return;
    }
    this.testHooks = hooks;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  isProduction(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }

  getAllowedOrigins(): string[] {
    const origins = new Set<string>();
    for (const key of ['FRONTEND_URL', 'SITE_ORIGIN']) {
      const val = this.configService.get<string>(key);
      if (val) {
        try {
          origins.add(new URL(val).origin);
        } catch { /* ignore invalid */ }
      }
    }
    if (!this.isProduction()) {
      origins.add('http://localhost:5173');
      origins.add('http://127.0.0.1:5173');
      origins.add('http://localhost:3000');
      origins.add('http://127.0.0.1:3000');
    }
    return [...origins];
  }

  getRefreshTokenCookieOptions(): CookieOptions {
    const refreshExpiresIn = Number(
      this.configService.get('JWT_REFRESH_EXPIRES_IN') ?? 604800,
    );
    const isProduction = this.isProduction();

    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: refreshExpiresIn * 1000,
    };
  }

  applySessionCookies(res: Response, tokens: TokenPairResult): void {
    res.cookie(
      'refreshToken',
      tokens.refreshToken,
      this.getRefreshTokenCookieOptions(),
    );
    if (
      tokens.sessionId &&
      tokens.refreshProtocol === REFRESH_PROTOCOL_V2 &&
      typeof tokens.refreshGeneration === 'number' &&
      tokens.recoveryProof
    ) {
      const isProd = this.isProduction();
      const maxAgeMs = (tokens.refreshExpiresIn ?? 604800) * 1000;
      const v2Opts = getV2CookieOptions(isProd, maxAgeMs);
      res.cookie(
        v2RefreshCookieName(tokens.sessionId, tokens.refreshGeneration, isProd),
        tokens.refreshToken,
        v2Opts,
      );
      res.cookie(
        v2ProofCookieName(tokens.sessionId, tokens.refreshGeneration, isProd),
        tokens.recoveryProof,
        v2Opts,
      );
    }
  }

  applyRefreshV2Cookies(res: Response, outcome: RefreshV2SuccessResult): void {
    const isProd = this.isProduction();
    const setOpts = getV2CookieOptions(isProd, outcome.refreshMaxAgeMs);
    res.cookie(
      v2RefreshCookieName(outcome.sessionId, outcome.generation, isProd),
      outcome.refreshToken,
      setOpts,
    );
    res.cookie(
      v2ProofCookieName(outcome.sessionId, outcome.generation, isProd),
      outcome.recoveryProof,
      setOpts,
    );
    // Never overwrite a fixed-name cookie in a delayed V2 response. Only expire older generations.
    const clearOpts = getV2CookieOptions(isProd, 0);
    for (const oldGen of outcome.clearGenerations) {
      if (oldGen < outcome.generation) {
        res.clearCookie(v2RefreshCookieName(outcome.sessionId, oldGen, isProd), {
          httpOnly: clearOpts.httpOnly,
          secure: clearOpts.secure,
          sameSite: clearOpts.sameSite,
          path: clearOpts.path,
        });
        res.clearCookie(v2ProofCookieName(outcome.sessionId, oldGen, isProd), {
          httpOnly: clearOpts.httpOnly,
          secure: clearOpts.secure,
          sameSite: clearOpts.sameSite,
          path: clearOpts.path,
        });
      }
    }
  }

  clearAllSessionCookies(res: Response, sessionId: string | undefined, rawCookieHeader: string | undefined): void {
    const cookieOptions = this.getRefreshTokenCookieOptions();
    res.clearCookie('refreshToken', {
      httpOnly: cookieOptions.httpOnly,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      path: cookieOptions.path,
    });
    if (sessionId && isValidUuid(sessionId)) {
      const isProd = this.isProduction();
      const parsed = parseRawV2Cookies(rawCookieHeader, sessionId, isProd);
      const gens = new Set<number>([0, 1, 2, ...parsed.observedGenerations]);
      for (const gen of gens) {
        res.clearCookie(v2RefreshCookieName(sessionId, gen, isProd), {
          httpOnly: cookieOptions.httpOnly,
          secure: cookieOptions.secure,
          sameSite: cookieOptions.sameSite,
          path: cookieOptions.path,
        });
        res.clearCookie(v2ProofCookieName(sessionId, gen, isProd), {
          httpOnly: cookieOptions.httpOnly,
          secure: cookieOptions.secure,
          sameSite: cookieOptions.sameSite,
          path: cookieOptions.path,
        });
      }
    }
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: UserRole,
    authVersion: number,
    sessionId: string,
    generation = 0,
    protocol = REFRESH_PROTOCOL_V2,
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
      gen: generation,
      ver: protocol,
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

  private getPreAuthSecret(): string {
    return (this.configService.get<string>('JWT_REFRESH_SECRET') || 'preauth-secret') + '_2fa_preauth';
  }

  async generatePreAuthToken(user: User): Promise<string> {
    const payload = {
      sub: user.id,
      scope: '2fa_preauth',
      authVersion: user.authVersion,
      email: user.email,
    };
    return this.jwtService.signAsync(payload, {
      secret: this.getPreAuthSecret(),
      expiresIn: 300,
    });
  }

  async verifyPreAuthToken(token: string): Promise<{ sub: string; authVersion: number; email: string }> {
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.getPreAuthSecret(),
      });
      if (!payload || payload.scope !== '2fa_preauth' || !payload.sub) {
        throw new UnauthorizedException('Desafio de autenticação inválido.');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Desafio de autenticação expirado ou inválido. Faça login novamente.');
    }
  }

  async login(loginDto: LoginDto, userAgent?: string): Promise<LoginResult> {
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

    if (user.totpEnabled) {
      if (loginDto.totpCode) {
        const valid = await this.totp.verify2faOrRecovery(user.id, loginDto.totpCode);
        if (!valid) {
          await this.usersService.recordFailedLogin(user.id);
          throw new UnauthorizedException('Credenciais inválidas.');
        }
      } else {
        const preAuthToken = await this.generatePreAuthToken(user);
        return {
          requires2fa: true,
          preAuthToken,
          expiresIn: 300,
        };
      }
    }

    if (!(await this.usersService.clearFailedLogins(user.id))) {
      throw new UnauthorizedException('E-mail ou senha inv\u00e1lidos.');
    }
    if (rounds < 12) await this.usersService.upgradePasswordHash(user.id, hash, await bcrypt.hash(loginDto.password, 12));

    return this.createSession(user, userAgent);
  }

  async verify2faLogin(verifyDto: Verify2faDto, userAgent?: string): Promise<TokenPairResult> {
    const payload = await this.verifyPreAuthToken(verifyDto.preAuthToken);
    const user = await this.usersService.findByIdForAuth(payload.sub);
    if (!user || !user.isActive || user.authVersion !== payload.authVersion) {
      throw new UnauthorizedException('Sessão expirada ou usuário desativado. Entre novamente.');
    }
    const locked = !!user.loginLockedUntil && new Date(user.loginLockedUntil).getTime() > Date.now();
    if (locked) {
      throw new UnauthorizedException('Conta temporariamente bloqueada por excesso de tentativas. Tente novamente mais tarde.');
    }
    const valid = await this.totp.verify2faOrRecovery(user.id, verifyDto.code);
    if (!valid) {
      await this.usersService.recordFailedLogin(user.id);
      throw new UnauthorizedException('Código de autenticação ou de recuperação inválido.');
    }
    await this.usersService.clearFailedLogins(user.id);
    return this.createSession(user, userAgent);
  }

  async createSession(user: User, userAgent?: string): Promise<TokenPairResult> {
    const sessionId = randomUUID();
    const { proof, proofHash } = generateSessionProof();
    const tokens = await this.generateTokens(user.id, user.email, user.role, user.authVersion, sessionId, 0, REFRESH_PROTOCOL_V2);
    const now = new Date();
    await this.sessions.manager.transaction(async manager => {
      await manager.getRepository(AuthSession).save({
        id: sessionId,
        userId: user.id,
        authVersion: user.authVersion,
        tokenHash: this.hashToken(tokens.refreshToken),
        userAgent: userAgent?.slice(0, 500) || null,
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + tokens.refreshExpiresIn * 1000),
        refreshProtocol: REFRESH_PROTOCOL_V2,
        refreshGeneration: 0,
        recoveryProofHash: proofHash,
      });
      await manager.query(`INSERT INTO audit_logs (actor_id, action, target_type, target_id) VALUES ($1, 'auth.session_created', 'session', $2)`, [user.id, sessionId]);
    });
    this.logger.log(`Login realizado para usuario ${user.id}`);
    return {
      ...tokens,
      sessionId,
      refreshGeneration: 0,
      refreshProtocol: REFRESH_PROTOCOL_V2,
      recoveryProof: proof,
    };
  }

  async refresh(refreshToken: string, disallowV2 = false): Promise<TokenPairResult> {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token não fornecido no cookie.');
    }

    const refreshSecret =
      this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');

    let payload: { sub: string; sid: string; ver?: number; gen?: number };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, { secret: refreshSecret });
    } catch {
      throw new UnauthorizedException('Refresh token inválido ou expirado.');
    }
    if (!payload?.sub || !payload.sid) throw new UnauthorizedException('Refresh token inválido.');
    const user = await this.usersService.findByIdForAuth(payload.sub);
    if (!user || !user.isActive) throw new UnauthorizedException('Usuário inválido.');
    const session = await this.sessions.findOne({
      where: { id: payload.sid, userId: user.id },
      select: { id: true, tokenHash: true, authVersion: true, expiresAt: true, refreshProtocol: true, refreshGeneration: true },
    });
    if (!session || session.authVersion !== user.authVersion || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Sessão expirada ou revogada.');
    }
    if (disallowV2 && session.refreshProtocol === REFRESH_PROTOCOL_V2) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'PROTOCOL_V2_REQUIRED',
        message: 'Sessão configurada para protocolo de renovação v2.',
      });
    }
    const presentedHash = this.hashToken(refreshToken);
    if (session.tokenHash !== presentedHash) {
      // A signed token already superseded at entry is reuse under the V1 policy.
      // Never delete a newer snapshot if another request rotates in the meantime.
      await this.revokeSession(user.id, payload.sid, { tokenHash: session.tokenHash, authVersion: session.authVersion });
      throw new UnauthorizedException('Refresh token inválido ou reutilizado.');
    }
    const nextGen = (session.refreshGeneration ?? 0) + 1;
    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role,
      user.authVersion,
      payload.sid,
      nextGen,
      session.refreshProtocol ?? 1,
    );
    const now = new Date();
    // Compare-and-swap ensures concurrent refresh requests cannot both rotate the same token.
    const result = await this.sessions.update({ id: payload.sid, userId: user.id,
      authVersion: user.authVersion, tokenHash: presentedHash, expiresAt: MoreThan(now) },
      { tokenHash: this.hashToken(tokens.refreshToken), lastUsedAt: now,
        expiresAt: new Date(now.getTime() + tokens.refreshExpiresIn * 1000),
        ...(session.refreshGeneration !== undefined ? { refreshGeneration: nextGen } : {}) });
    if (!result.affected) {
      // This token matched at entry. A lost CAS can be rotation, expiry or
      // revocation during the request; it is not sufficient evidence of reuse.
      throw new ConflictException('Sessão alterada durante a renovação.');
    }

    this.logger.log(`Tokens renovados para usuário ${user.id}`);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenType: tokens.tokenType,
      expiresIn: tokens.expiresIn,
      refreshExpiresIn: tokens.refreshExpiresIn,
    };
  }

  private getKeyRing() {
    const explicitKey = this.configService.get<string>('REFRESH_RECOVERY_ENCRYPTION_KEY');
    const prevKey = this.configService.get<string>('REFRESH_RECOVERY_PREVIOUS_KEY');
    const fallbackSecret =
      this.configService.get<string>('TOTP_ENCRYPTION_KEY') ||
      this.configService.get<string>('JWT_REFRESH_SECRET');
    return resolveRecoveryKeys(explicitKey, fallbackSecret, prevKey);
  }

  async refreshV2(input: RefreshV2RequestInput): Promise<RefreshV2SuccessResult> {
    await this.testHooks?.onRequestReceived?.();

    if (input.hasNonEmptyBody) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'NON_EMPTY_BODY',
        message: 'Corpo da requisição deve ser vazio.',
      });
    }

    const originCheck = validateOriginAndFetchMetadata(
      input.originHeader,
      input.secFetchSite,
      input.secFetchMode,
      input.contentTypeHeader,
      this.getAllowedOrigins(),
    );
    if (!originCheck.ok) {
      if (originCheck.status === 400) {
        throw new BadRequestException({
          statusCode: 400,
          code: originCheck.code,
          message: originCheck.message,
        });
      }
      throw new ForbiddenException({
        statusCode: 403,
        code: originCheck.code,
        message: originCheck.message,
      });
    }

    const declaredSid = input.sessionIdHeader?.trim();
    const operationId = input.operationIdHeader?.trim();
    const declaredGen = isValidGenerationHeader(input.generationHeader?.trim());

    if (!isValidUuid(declaredSid) || !isValidOperationId(operationId) || declaredGen === null) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_V2_HEADERS',
        message: 'Cabeçalhos de coordenação v2 ausentes ou malformados.',
      });
    }

    const parsedCookies = parseRawV2Cookies(
      input.rawCookieHeader,
      declaredSid,
      this.isProduction(),
    );

    if (parsedCookies.headerTooLarge) {
      throw new HttpException(
        {
          statusCode: 431,
          code: 'COOKIE_HEADER_TOO_LARGE',
          message: 'Cabeçalho de cookies excedeu o limite permitido.',
        },
        431,
      );
    }

    if (parsedCookies.duplicateDetected || parsedCookies.tooManySessionCookies) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'AMBIGUOUS_OR_EXCESSIVE_COOKIES',
        message: 'Cookies de sessão duplicados ou acima do limite permitido.',
      });
    }

    const refreshSecret = this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    const verifiedTokens = new Map<
      string,
      { token: string; hash: string; gen: number; sub: string; sid: string; expMs: number }
    >();

    for (const [cookieGen, rawToken] of parsedCookies.refreshByGeneration.entries()) {
      try {
        const decoded = await this.jwtService.verifyAsync<{
          sub: string;
          sid: string;
          gen?: number;
          ver?: number;
          exp?: number;
        }>(rawToken, { secret: refreshSecret });
        if (
          decoded &&
          isValidUuid(decoded.sub) &&
          isValidUuid(decoded.sid) &&
          decoded.sid.toLowerCase() === declaredSid.toLowerCase() &&
          decoded.ver === REFRESH_PROTOCOL_V2 &&
          typeof decoded.gen === 'number' &&
          decoded.gen === cookieGen &&
          typeof decoded.exp === 'number'
        ) {
          const tokenHash = this.hashToken(rawToken);
          verifiedTokens.set(tokenHash, {
            token: rawToken,
            hash: tokenHash,
            gen: decoded.gen,
            sub: decoded.sub,
            sid: decoded.sid,
            expMs: decoded.exp * 1000,
          });
        }
      } catch {
        // Invalid or expired cookie token is ignored unless no valid token matches.
      }
    }

    const validProofValues = new Set<string>();
    for (const [, rawProof] of parsedCookies.proofByGeneration.entries()) {
      if (isValidProofValue(rawProof)) {
        validProofValues.add(rawProof);
      }
    }

    if (verifiedTokens.size === 0 || validProofValues.size === 0) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'SESSION_INVALID',
        message: 'Credenciais de renovação ausentes, inválidas ou expiradas.',
      });
    }

    // All verified tokens for the same sid must belong to the same subject.
    const subjects = new Set([...verifiedTokens.values()].map(t => t.sub.toLowerCase()));
    if (subjects.size !== 1) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INCONSISTENT_TOKEN_SUBJECTS',
        message: 'Tokens de sessão inconsistentes.',
      });
    }
    const candidateUserId = [...verifiedTokens.values()][0].sub;

    const keyRing = this.getKeyRing();
    if (!keyRing) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: 'RECOVERY_KEY_UNAVAILABLE',
        message: 'Chave de proteção de sessão indisponível.',
      });
    }

    const operationHash = sha256Hex(operationId);

    type TxOutcome =
      | { status: 'ok'; data: RefreshV2SuccessResult }
      | { status: 'error'; httpStatus: number; code: string; message: string; retryGeneration?: number };

    let txOutcome: TxOutcome;
    try {
      txOutcome = await this.sessions.manager.transaction(async (manager): Promise<TxOutcome> => {
        await manager.query(`SET LOCAL lock_timeout = '5000ms'`);

        // 1. Lock User first (pessimistic_write)
        const user = await manager
          .getRepository(User)
          .createQueryBuilder('u')
          .where('u.id = :id', { id: candidateUserId })
          .setLock('pessimistic_write')
          .getOne();

        await this.testHooks?.onUserLocked?.();

        if (!user || !user.isActive || user.deletedAt) {
          return {
            status: 'error',
            httpStatus: 401,
            code: 'SESSION_INVALID',
            message: 'Usuário inativo ou sessão inválida.',
          };
        }

        // 2. Lock AuthSession second (pessimistic_write)
        const sessionRows: {
          id: string;
          user_id: string;
          token_hash: string;
          auth_version: number;
          expires_at: Date;
          refresh_protocol: number;
          refresh_generation: string | number;
          recovery_proof_hash: string | null;
          db_now: Date;
        }[] = await manager.query(
          `SELECT id, user_id, token_hash, auth_version, expires_at, refresh_protocol, refresh_generation, recovery_proof_hash, clock_timestamp() AS db_now
           FROM auth_sessions
           WHERE id = $1 AND user_id = $2
           FOR UPDATE`,
          [declaredSid, user.id],
        );

        await this.testHooks?.onSessionLocked?.();

        if (sessionRows.length === 0) {
          return {
            status: 'error',
            httpStatus: 401,
            code: 'SESSION_INVALID',
            message: 'Sessão inexistente ou revogada.',
          };
        }

        const session = sessionRows[0];
        const currentNowMs = this.testHooks?.nowMs ? this.testHooks.nowMs() : new Date(session.db_now).getTime();
        const sessionGen = Number(session.refresh_generation);

        if (
          session.refresh_protocol !== REFRESH_PROTOCOL_V2 ||
          !session.recovery_proof_hash ||
          session.auth_version !== user.authVersion ||
          new Date(session.expires_at).getTime() <= currentNowMs
        ) {
          return {
            status: 'error',
            httpStatus: 401,
            code: 'SESSION_INVALID',
            message: 'Sessão expirada ou invalidada.',
          };
        }

        // Verify that at least one presented proof matches session.recovery_proof_hash
        let matchedProof: string | null = null;
        for (const candidateProof of validProofValues) {
          if (safeEqualHex(sha256Hex(candidateProof), session.recovery_proof_hash)) {
            matchedProof = candidateProof;
            break;
          }
        }

        if (!matchedProof) {
          return {
            status: 'error',
            httpStatus: 401,
            code: 'PROOF_MISMATCH',
            message: 'Prova de sessão inválida ou ausente.',
          };
        }

        // Prune expired ciphertexts and expired metadata for this session inside the lock
        await manager.query(
          `UPDATE auth_refresh_operations
           SET result_ciphertext = NULL, key_id = NULL, nonce = NULL, tag = NULL
           WHERE session_id = $1 AND result_ciphertext IS NOT NULL AND result_expires_at <= to_timestamp($2 / 1000.0)`,
          [session.id, currentNowMs],
        );
        await manager.query(
          `DELETE FROM auth_refresh_operations
           WHERE session_id = $1 AND metadata_expires_at <= to_timestamp($2 / 1000.0)`,
          [session.id, currentNowMs],
        );

        const opRepo = manager.getRepository(AuthRefreshOperation);

        // 3. Check if operation_hash already exists for this session
        const existingOp = await opRepo.findOne({
          where: { sessionId: session.id, operationHash },
        });

        if (existingOp) {
          const hasMatchingToken =
            verifiedTokens.has(existingOp.inputHash) || verifiedTokens.has(existingOp.outputHash);
          if (!hasMatchingToken) {
            return {
              status: 'error',
              httpStatus: 401,
              code: 'SESSION_INVALID',
              message: 'Credenciais não correspondem à operação solicitada.',
            };
          }

          if (
            existingOp.authVersion !== user.authVersion ||
            existingOp.outputHash !== session.token_hash ||
            existingOp.outputGeneration !== sessionGen
          ) {
            return {
              status: 'error',
              httpStatus: 409,
              code: 'OPERATION_SUPERSEDED',
              message: 'A operação de renovação já foi superada por uma geração mais recente.',
            };
          }

          const latestClockRows: { now_ms: string }[] = await manager.query(
            `SELECT (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint AS now_ms`,
          );
          const checkNowMs = this.testHooks?.nowMs
            ? this.testHooks.nowMs()
            : Number(latestClockRows[0].now_ms);

          if (
            !existingOp.resultCiphertext ||
            !existingOp.keyId ||
            !existingOp.nonce ||
            !existingOp.tag ||
            existingOp.resultExpiresAt.getTime() <= checkNowMs ||
            existingOp.inputExpiresAt.getTime() <= checkNowMs ||
            existingOp.outputRefreshExpiresAt.getTime() <= checkNowMs ||
            existingOp.outputAccessExpiresAt.getTime() <= checkNowMs
          ) {
            return {
              status: 'error',
              httpStatus: 409,
              code: 'RECOVERY_EXPIRED',
              message: 'O prazo de recuperação da operação expirou.',
              // Advancing is safe only if the caller ALSO possesses the current
              // signed token and session proof, not merely an old operation ID.
              retryGeneration: verifiedTokens.has(session.token_hash) ? sessionGen : undefined,
            };
          }

          let recoveredPayload;
          try {
            recoveredPayload = decryptRecoveryResult(
              {
                ciphertext: existingOp.resultCiphertext,
                keyId: existingOp.keyId,
                nonce: existingOp.nonce,
                tag: existingOp.tag,
              },
              {
                sessionId: session.id,
                operationHash,
                inputGeneration: existingOp.inputGeneration,
                outputGeneration: existingOp.outputGeneration,
                authVersion: existingOp.authVersion,
              },
              keyRing,
            );
          } catch {
            return {
              status: 'error',
              httpStatus: 503,
              code: 'RECOVERY_DECRYPT_FAILED',
              message: 'Não foi possível recuperar o resultado da operação.',
            };
          }

          const remainingAccessSec = Math.floor((recoveredPayload.accessExpiresAtMs - checkNowMs) / 1000);
          const remainingRefreshMs = recoveredPayload.refreshExpiresAtMs - checkNowMs;
          if (remainingAccessSec <= 0 || remainingRefreshMs <= 0) {
            return {
              status: 'error',
              httpStatus: 409,
              code: 'RECOVERY_EXPIRED',
              message: 'As credenciais da operação recuperada já expiraram.',
            };
          }

          return {
            status: 'ok',
            data: {
              kind: 'recovered',
              accessToken: recoveredPayload.accessToken,
              refreshToken: recoveredPayload.refreshToken,
              recoveryProof: matchedProof,
              tokenType: recoveredPayload.tokenType,
              expiresIn: remainingAccessSec,
              refreshMaxAgeMs: remainingRefreshMs,
              sessionId: session.id,
              generation: existingOp.outputGeneration,
              operationId,
              recoveryDeadlineIso: existingOp.resultExpiresAt.toISOString(),
              clearGenerations: parsedCookies.observedGenerations.filter(
                g => g < existingOp.outputGeneration,
              ),
            },
          };
        }

        // 4. Operation is new. Check if the current valid token was presented.
        const currentTokenEntry = verifiedTokens.get(session.token_hash);
        if (currentTokenEntry && currentTokenEntry.expMs > currentNowMs) {
          if (declaredGen !== sessionGen || currentTokenEntry.gen !== sessionGen) {
            return {
              status: 'error',
              httpStatus: 409,
              code: 'GENERATION_MISMATCH',
              message: 'Geração declarada incompatível com o estado atual da sessão.',
              retryGeneration: sessionGen,
            };
          }

          // Check capacity limit before rotating
          const activeOpsCount = await opRepo.count({ where: { sessionId: session.id, resultExpiresAt: MoreThan(new Date(currentNowMs)) } });
          if (activeOpsCount >= MAX_OPERATIONS_PER_SESSION) {
            return {
              status: 'error',
              httpStatus: 503,
              code: 'OPERATION_CAPACITY_EXCEEDED',
              message: 'Limite de operações de renovação simultâneas atingido. Aguarde alguns instantes.',
            };
          }

          const nextGen = sessionGen + 1;
          const newTokens = await this.generateTokens(
            user.id,
            user.email,
            user.role,
            user.authVersion,
            session.id,
            nextGen,
            REFRESH_PROTOCOL_V2,
          );

          const preMutationClockRows: { now_ms: string }[] = await manager.query(
            `SELECT (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint AS now_ms`,
          );
          const commitNowMs = this.testHooks?.nowMs
            ? this.testHooks.nowMs()
            : Number(preMutationClockRows[0].now_ms);

          if (
            new Date(session.expires_at).getTime() <= commitNowMs ||
            currentTokenEntry.expMs <= commitNowMs
          ) {
            return {
              status: 'error',
              httpStatus: 401,
              code: 'SESSION_INVALID',
              message: 'Sessão expirou antes da confirmação.',
            };
          }

          const accessExpiresAtMs = commitNowMs + newTokens.expiresIn * 1000;
          const refreshExpiresAtMs = commitNowMs + newTokens.refreshExpiresIn * 1000;
          const recoveryWindowMs =
            Number(this.configService.get('REFRESH_RECOVERY_WINDOW_SECONDS') ?? RECOVERY_WINDOW_SECONDS) * 1000;
          const resultExpiresAtMs = Math.min(
            commitNowMs + recoveryWindowMs,
            currentTokenEntry.expMs,
            accessExpiresAtMs,
            refreshExpiresAtMs,
          );
          const metadataExpiresAtMs = Math.max(currentTokenEntry.expMs, refreshExpiresAtMs);
          const outputHash = this.hashToken(newTokens.refreshToken);

          const cipherEnvelope = encryptRecoveryResult(
            {
              accessToken: newTokens.accessToken,
              refreshToken: newTokens.refreshToken,
              tokenType: newTokens.tokenType,
              sessionId: session.id,
              inputGeneration: sessionGen,
              outputGeneration: nextGen,
              authVersion: user.authVersion,
              accessExpiresAtMs,
              refreshExpiresAtMs,
              resultExpiresAtMs,
            },
            operationHash,
            keyRing,
          );

          await this.testHooks?.onBeforeCommit?.();

          await manager.query(
            `UPDATE auth_sessions
             SET token_hash = $1,
                 refresh_generation = $2,
                 last_used_at = to_timestamp($3 / 1000.0),
                 expires_at = to_timestamp($4 / 1000.0)
             WHERE id = $5 AND user_id = $6`,
            [outputHash, nextGen, commitNowMs, refreshExpiresAtMs, session.id, user.id],
          );

          await opRepo.insert({
            sessionId: session.id,
            operationHash,
            inputGeneration: sessionGen,
            outputGeneration: nextGen,
            inputHash: currentTokenEntry.hash,
            outputHash,
            authVersion: user.authVersion,
            inputExpiresAt: new Date(currentTokenEntry.expMs),
            outputRefreshExpiresAt: new Date(refreshExpiresAtMs),
            outputAccessExpiresAt: new Date(accessExpiresAtMs),
            resultExpiresAt: new Date(resultExpiresAtMs),
            metadataExpiresAt: new Date(metadataExpiresAtMs),
            resultCiphertext: cipherEnvelope.ciphertext,
            keyId: cipherEnvelope.keyId,
            nonce: cipherEnvelope.nonce,
            tag: cipherEnvelope.tag,
          });

          return {
            status: 'ok',
            data: {
              kind: 'created',
              accessToken: newTokens.accessToken,
              refreshToken: newTokens.refreshToken,
              recoveryProof: matchedProof,
              tokenType: newTokens.tokenType,
              expiresIn: newTokens.expiresIn,
              refreshMaxAgeMs: newTokens.refreshExpiresIn * 1000,
              sessionId: session.id,
              generation: nextGen,
              operationId,
              recoveryDeadlineIso: new Date(resultExpiresAtMs).toISOString(),
              clearGenerations: parsedCookies.observedGenerations.filter(g => g < nextGen),
            },
          };
        }

        // 5. Current token is NOT present, and operationHash is NOT registered.
        // Since we already verified:
        // - at least one signed non-expired token for this exact session (verifiedTokens.size > 0)
        // - valid session proof matching session.recovery_proof_hash (matchedProof !== null)
        // Check if any presented token is an older generation (< sessionGen) or a previously rotated inputHash.
        const hasOlderSignedToken = [...verifiedTokens.values()].some(
          t => t.gen < sessionGen && t.expMs > currentNowMs,
        );

        if (hasOlderSignedToken) {
          // Proven reuse of an older refresh token with a different operation ID -> revoke session and commit!
          await manager.getRepository(AuthSession).delete({ id: session.id, userId: user.id });
          await manager.query(
            `INSERT INTO audit_logs (actor_id, action, target_type, target_id) VALUES ($1, 'auth.session_revoked', 'session', $2)`,
            [user.id, session.id],
          );
          return {
            status: 'error',
            httpStatus: 401,
            code: 'REFRESH_TOKEN_REUSED',
            message: 'Refresh token inválido ou reutilizado.',
          };
        }

        return {
          status: 'error',
          httpStatus: 401,
          code: 'SESSION_INVALID',
          message: 'Refresh token inválido ou expirado.',
        };
      });
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`Erro transacional no refresh v2: ${(err as Error)?.message ?? 'desconhecido'}`);
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: 'REFRESH_TEMPORARILY_UNAVAILABLE',
        message: 'Serviço de sessão temporariamente indisponível.',
      });
    }

    await this.testHooks?.onCommitObserved?.();

    if (txOutcome.status === 'error') {
      if (txOutcome.httpStatus === 401) {
        throw new UnauthorizedException({
          statusCode: 401,
          code: txOutcome.code,
          message: txOutcome.message,
        });
      }
      if (txOutcome.httpStatus === 409) {
        throw new ConflictException({
          statusCode: 409,
          code: txOutcome.code,
          message: txOutcome.message,
          ...(txOutcome.retryGeneration !== undefined ? { retry_generation: txOutcome.retryGeneration } : {}),
        });
      }
      if (txOutcome.httpStatus === 503) {
        throw new ServiceUnavailableException({
          statusCode: 503,
          code: txOutcome.code,
          message: txOutcome.message,
        });
      }
      throw new BadRequestException({
        statusCode: 400,
        code: txOutcome.code,
        message: txOutcome.message,
      });
    }

    this.logger.log(
      `Sessão v2 ${txOutcome.data.kind === 'created' ? 'renovada' : 'recuperada'} (gen=${txOutcome.data.generation})`,
    );
    return txOutcome.data;
  }

  async logoutV2(input: {
    bearerToken?: string;
    sessionIdHeader?: string;
    rawCookieHeader?: string;
    originHeader?: string;
    secFetchSite?: string;
    secFetchMode?: string;
    contentTypeHeader?: string;
  }): Promise<{ message: string; sessionId?: string }> {
    const originCheck = validateOriginAndFetchMetadata(
      input.originHeader,
      input.secFetchSite,
      input.secFetchMode,
      input.contentTypeHeader,
      this.getAllowedOrigins(),
    );
    if (!originCheck.ok) {
      if (originCheck.status === 400) {
        throw new BadRequestException({ statusCode: 400, code: originCheck.code, message: originCheck.message });
      }
      throw new ForbiddenException({ statusCode: 403, code: originCheck.code, message: originCheck.message });
    }

    // Path A: Valid Bearer token
    if (input.bearerToken) {
      try {
        const accessSecret = this.configService.getOrThrow<string>('JWT_SECRET');
        const payload = await this.jwtService.verifyAsync<{ sub: string; sid: string }>(input.bearerToken, {
          secret: accessSecret,
        });
        if (payload?.sub && payload?.sid && isValidUuid(payload.sub) && isValidUuid(payload.sid)) {
          await this.revokeSession(payload.sub, payload.sid);
          return { message: 'Logout realizado com sucesso.', sessionId: payload.sid };
        }
      } catch {
        // Fallback to Path B (v2 cookies + proof) if bearer is expired or missing
      }
    }

    // Path B: V2 cookies (signed non-expired refresh token + matching proof)
    const declaredSid = input.sessionIdHeader?.trim();
    if (!isValidUuid(declaredSid)) {
      throw new UnauthorizedException('Credenciais de logout ausentes ou inválidas.');
    }

    const parsedCookies = parseRawV2Cookies(input.rawCookieHeader, declaredSid, this.isProduction());
    if (parsedCookies.headerTooLarge || parsedCookies.duplicateDetected || parsedCookies.tooManySessionCookies) {
      throw new BadRequestException('Cookies de sessão inválidos.');
    }

    const refreshSecret = this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    let verifiedSub: string | null = null;
    for (const [cookieGen, rawToken] of parsedCookies.refreshByGeneration.entries()) {
      try {
        const decoded = await this.jwtService.verifyAsync<{
          sub: string;
          sid: string;
          gen?: number;
          ver?: number;
        }>(rawToken, { secret: refreshSecret });
        if (
          decoded &&
          isValidUuid(decoded.sub) &&
          isValidUuid(decoded.sid) &&
          decoded.sid.toLowerCase() === declaredSid.toLowerCase() &&
          decoded.ver === REFRESH_PROTOCOL_V2 &&
          decoded.gen === cookieGen
        ) {
          verifiedSub = decoded.sub;
          break;
        }
      } catch { /* continue */ }
    }

    const validProofValues = new Set<string>();
    for (const [, rawProof] of parsedCookies.proofByGeneration.entries()) {
      if (isValidProofValue(rawProof)) validProofValues.add(rawProof);
    }

    if (!verifiedSub || validProofValues.size === 0) {
      throw new UnauthorizedException('Credenciais de logout insuficientes.');
    }

    const targetUserId = verifiedSub;
    await this.sessions.manager.transaction(async manager => {
      await manager.query(`SET LOCAL lock_timeout = '5000ms'`);
      await manager
        .getRepository(User)
        .createQueryBuilder('u')
        .where('u.id = :id', { id: targetUserId })
        .setLock('pessimistic_write')
        .getOne();

      const rows: { id: string; recovery_proof_hash: string | null }[] = await manager.query(
        `SELECT id, recovery_proof_hash FROM auth_sessions WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [declaredSid, targetUserId],
      );
      if (rows.length === 0) {
        // Already revoked/deleted -> idempotent success
        return;
      }
      const proofHash = rows[0].recovery_proof_hash;
      const proofMatches = [...validProofValues].some(p => safeEqualHex(sha256Hex(p), proofHash));
      if (!proofMatches) {
        throw new UnauthorizedException('Prova de sessão inválida para logout.');
      }
      const del = await manager.getRepository(AuthSession).delete({ id: declaredSid, userId: targetUserId });
      if (del.affected) {
        await manager.query(
          `INSERT INTO audit_logs (actor_id, action, target_type, target_id) VALUES ($1, 'auth.session_revoked', 'session', $2)`,
          [targetUserId, declaredSid],
        );
      }
    });

    return { message: 'Logout realizado com sucesso.', sessionId: declaredSid };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async cleanupExpiredRefreshOperations(): Promise<void> {
    try {
      await this.sessions.manager.transaction(async manager => {
        await manager.query(`SET LOCAL lock_timeout = '2000ms'`);
        // Lock candidate sessions in deterministic order before mutating operations
        await manager.query(
          `WITH target_sessions AS (
             SELECT s.id
             FROM auth_sessions s
             WHERE EXISTS (SELECT 1 FROM auth_refresh_operations pending
               WHERE pending.session_id = s.id AND ((pending.result_ciphertext IS NOT NULL AND pending.result_expires_at <= clock_timestamp())
                 OR pending.metadata_expires_at <= clock_timestamp()))
             ORDER BY s.id
             LIMIT 100
             FOR UPDATE OF s SKIP LOCKED
           )
           UPDATE auth_refresh_operations o
           SET result_ciphertext = NULL, key_id = NULL, nonce = NULL, tag = NULL
           FROM target_sessions ts
           WHERE o.session_id = ts.id
             AND o.result_ciphertext IS NOT NULL
             AND o.result_expires_at <= clock_timestamp()`,
        );
        await manager.query(
          `WITH target_sessions AS (
             SELECT s.id
             FROM auth_sessions s
             WHERE EXISTS (SELECT 1 FROM auth_refresh_operations pending
               WHERE pending.session_id = s.id AND pending.metadata_expires_at <= clock_timestamp())
             ORDER BY s.id
             LIMIT 100
             FOR UPDATE OF s SKIP LOCKED
           )
           DELETE FROM auth_refresh_operations o
           USING target_sessions ts
           WHERE o.session_id = ts.id
             AND o.metadata_expires_at <= clock_timestamp()`,
        );
      });
    } catch {
      // Non-critical background cleanup
    }
  }

  async listSessions(userId: string, sessionId: string, authVersion: number) {
    const sessions = await this.sessions.find({ where: { userId, authVersion, expiresAt: MoreThan(new Date()) }, order: { createdAt: 'DESC' } });
    return sessions.map(({ id, userAgent, createdAt, lastUsedAt, expiresAt }) => ({ id, userAgent, createdAt, lastUsedAt, expiresAt, current: id === sessionId }));
  }

  async revokeSession(userId: string, sessionId: string, expected?: Pick<AuthSession, 'tokenHash' | 'authVersion'>): Promise<void> {
    await this.sessions.manager.transaction(async manager => {
      const result = await manager.getRepository(AuthSession).delete({ id: sessionId, userId,
        ...(expected && { ...expected, expiresAt: MoreThan(new Date()) }) });
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
