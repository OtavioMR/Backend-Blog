import {
  Body,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Controller,
  HttpCode,
  Header,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { AuthService, type TokenPairResult } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { Verify2faDto } from './dto/verify-2fa.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { AuthResponseDto } from './dto/auth-response.dto.js';
import { JwtAuthGuard } from './guard/jwt-auth.guard.js';
import type { RequestWithUser } from './interfaces/request-with-user.interface.js';
import {
  ApiAuthTag,
  ApiLoginDoc,
  ApiRefreshDoc,
  ApiLogoutDoc,
  ApiForgotPasswordDoc,
  ApiResetPasswordDoc,
  ApiPublicRoute,
} from '../../docs/index.js';

const REFRESH_COOKIE_NAME = 'refreshToken';

@ApiAuthTag()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private applyCookiesOrFallback(res: Response, tokens: TokenPairResult): void {
    if (typeof this.authService.applySessionCookies === 'function') {
      this.authService.applySessionCookies(res, tokens);
      return;
    }
    res.cookie(
      REFRESH_COOKIE_NAME,
      tokens.refreshToken,
      this.authService.getRefreshTokenCookieOptions(),
    );
  }

  private buildSessionResponse(tokens: TokenPairResult): AuthResponseDto {
    return {
      access_token: tokens.accessToken,
      token_type: tokens.tokenType,
      expires_in: tokens.expiresIn,
      ...(tokens.sessionId !== undefined && { session_id: tokens.sessionId }),
      ...(tokens.refreshGeneration !== undefined && { refresh_generation: tokens.refreshGeneration }),
      ...(tokens.refreshProtocol !== undefined && { refresh_protocol: tokens.refreshProtocol }),
    };
  }

  @ApiLoginDoc()
  @Header('Cache-Control', 'no-store')
  @Post('login')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const result = await this.authService.login(loginDto, req.get('user-agent'));

    if ('requires2fa' in result && result.requires2fa) {
      return {
        requires2fa: true,
        preAuthToken: result.preAuthToken,
        expires_in: result.expiresIn,
      };
    }

    const tokens = result as TokenPairResult;
    this.applyCookiesOrFallback(res, tokens);
    return this.buildSessionResponse(tokens);
  }

  @Header('Cache-Control', 'no-store')
  @Post('2fa/verify')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Concluir login com segundo fator (2FA)',
    description: 'Valida o código TOTP ou código de recuperação com o desafio de pré-autenticação e emite a sessão definitiva.',
  })
  @ApiResponse({ status: 200, description: 'Sessão liberada.', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Código de autenticação inválido ou desafio expirado.' })
  async verify2fa(
    @Body() verifyDto: Verify2faDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const tokens = await this.authService.verify2faLogin(verifyDto, req.get('user-agent'));
    this.applyCookiesOrFallback(res, tokens);
    return this.buildSessionResponse(tokens);
  }

  @ApiRefreshDoc()
  @Header('Cache-Control', 'no-store')
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const refreshToken =
      req.cookies?.[REFRESH_COOKIE_NAME] ?? req.cookies?.['refresh_token'];

    if (!refreshToken) {
      throw new UnauthorizedException(
        'Refresh token não fornecido via cookie.',
      );
    }

    const tokens = await this.authService.refresh(refreshToken, true);

    res.cookie(
      REFRESH_COOKIE_NAME,
      tokens.refreshToken,
      this.authService.getRefreshTokenCookieOptions(),
    );

    return {
      access_token: tokens.accessToken,
      token_type: tokens.tokenType,
      expires_in: tokens.expiresIn,
    };
  }

  @ApiPublicRoute()
  @Header('Cache-Control', 'no-store')
  @Post('refresh/v2')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Renovar ou recuperar par de tokens com idempotência transacional (protocolo v2)',
    description:
      'Executa rotação transacional ou recupera o resultado cifrado exato de uma operação já confirmada mediante apresentação do cookie de refresh assinado, cookie HttpOnly de prova da sessão e cabeçalhos de coordenação (X-Session-Id, X-Refresh-Operation, X-Refresh-Generation). Emite cookies isolados por geração e expira gerações estritamente inferiores.',
  })
  @ApiHeader({ name: 'X-Session-Id', required: true, description: 'UUID da sessão autenticada.' })
  @ApiHeader({ name: 'X-Refresh-Operation', required: true, description: 'ID CSPRNG base64url de 43 caracteres da tentativa.' })
  @ApiHeader({ name: 'X-Refresh-Generation', required: true, description: 'Geração de entrada esperada pelo cliente.' })
  @ApiResponse({ status: 200, description: 'Tokens rotacionados ou recuperados com sucesso.', type: AuthResponseDto })
  @ApiResponse({ status: 400, description: 'Cabeçalhos ou cookies malformados/ambíguos.' })
  @ApiResponse({ status: 401, description: 'Sessão inválida, expirada, revogada ou reutilização comprovada.' })
  @ApiResponse({ status: 403, description: 'Origem ou metadados de requisição não autorizados.' })
  @ApiResponse({ status: 409, description: 'Prazo de recuperação expirado (RECOVERY_EXPIRED), operação superada (OPERATION_SUPERSEDED) ou geração incompatível. retry_generation só é informado após comprovar posse do token atual e da prova da sessão; permite iniciar nova operação sem recuperar tokens antigos.' })
  @ApiResponse({ status: 431, description: 'Cabeçalho de cookies excedeu o orçamento.' })
  @ApiResponse({ status: 503, description: 'Indisponibilidade temporária.' })
  async refreshV2(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const contentLength = req.headers['content-length'];
    const hasBodyBytes =
      (typeof contentLength === 'string' && contentLength !== '0' && contentLength.trim() !== '') ||
      (req.body && typeof req.body === 'object' && Object.keys(req.body as object).length > 0) ||
      (typeof req.body === 'string' && req.body.length > 0);

    const outcome = await this.authService.refreshV2({
      sessionIdHeader: req.headers['x-session-id'] as string | undefined,
      operationIdHeader: req.headers['x-refresh-operation'] as string | undefined,
      generationHeader: req.headers['x-refresh-generation'] as string | undefined,
      rawCookieHeader: req.headers.cookie,
      originHeader: req.headers.origin as string | undefined,
      secFetchSite: req.headers['sec-fetch-site'] as string | undefined,
      secFetchMode: req.headers['sec-fetch-mode'] as string | undefined,
      contentTypeHeader: req.headers['content-type'],
      hasNonEmptyBody: Boolean(hasBodyBytes),
    });

    this.authService.applyRefreshV2Cookies(res, outcome);

    return {
      access_token: outcome.accessToken,
      token_type: outcome.tokenType,
      expires_in: outcome.expiresIn,
      session_id: outcome.sessionId,
      generation: outcome.generation,
      operation_id: outcome.operationId,
      recovery_deadline: outcome.recoveryDeadlineIso,
    };
  }

  @ApiLogoutDoc()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const cookieOptions = this.authService.getRefreshTokenCookieOptions();
    res.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: cookieOptions.httpOnly,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      path: cookieOptions.path,
    });
    if (typeof this.authService.clearAllSessionCookies === 'function') {
      this.authService.clearAllSessionCookies(res, request.user?.sessionId, request.headers?.cookie);
    }

    return this.authService.logout(request.user.userId, request.user.sessionId);
  }

  @ApiPublicRoute()
  @Header('Cache-Control', 'no-store')
  @Post('logout/v2')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Encerrar sessão v2 de forma idempotente (com Bearer ou cookies v2 + prova)',
    description:
      'Revoga a sessão atual autorizada por Bearer JWT válido ou pela combinação de cookie de refresh assinado + prova HttpOnly correspondente da sessão (permitindo logout mesmo durante renovação incerta). Nunca recupera credenciais.',
  })
  @ApiHeader({ name: 'X-Session-Id', required: false, description: 'UUID da sessão a encerrar quando utilizado o caminho de cookies v2.' })
  @ApiResponse({ status: 200, description: 'Sessão encerrada com sucesso.' })
  @ApiResponse({ status: 400, description: 'Requisição inválida.' })
  @ApiResponse({ status: 401, description: 'Credenciais ausentes ou inválidas.' })
  @ApiResponse({ status: 403, description: 'Origem não autorizada.' })
  async logoutV2(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const authHeader = req.headers.authorization;
    const bearer =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : undefined;
    const declaredSid = (req.headers['x-session-id'] as string | undefined)?.trim();

    const result = await this.authService.logoutV2({
      bearerToken: bearer,
      sessionIdHeader: declaredSid,
      rawCookieHeader: req.headers.cookie,
      originHeader: req.headers.origin as string | undefined,
      secFetchSite: req.headers['sec-fetch-site'] as string | undefined,
      secFetchMode: req.headers['sec-fetch-mode'] as string | undefined,
      contentTypeHeader: req.headers['content-type'],
    });

    this.authService.clearAllSessionCookies(res, result.sessionId ?? declaredSid, req.headers.cookie);
    return { message: result.message };
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Listar sessões ativas do usuário' })
  @ApiResponse({ status: 200, description: 'Sessões ativas, incluindo a sessão atual.', schema: { example: [{ id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', userAgent: 'Mozilla/5.0', createdAt: '2026-01-01T00:00:00Z', lastUsedAt: '2026-01-01T00:00:00Z', expiresAt: '2026-01-08T00:00:00Z', current: true }] } })
  @ApiResponse({ status: 401, description: 'Token ausente, inválido ou sessão revogada.' })
  listSessions(@Req() request: RequestWithUser) {
    return this.authService.listSessions(request.user.userId, request.user.sessionId, request.user.authVersion);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Revogar uma sessão do próprio usuário' })
  @ApiParam({ name: 'id', format: 'uuid', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @ApiResponse({ status: 204, description: 'Sessão revogada ou já ausente.' })
  @ApiResponse({ status: 400, description: 'Identificador inválido.' })
  @ApiResponse({ status: 401, description: 'Token ausente, inválido ou sessão revogada.' })
  async revokeSession(@Req() request: RequestWithUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.authService.revokeSession(request.user.userId, id);
  }

  @ApiForgotPasswordDoc()
  @Post('forgot-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @ApiResetPasswordDoc()
  @Post('reset-password')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() resetPasswordDto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.resetPassword(resetPasswordDto);
  }
}
