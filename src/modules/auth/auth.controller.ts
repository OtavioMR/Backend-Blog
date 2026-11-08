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
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
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
} from '../../docs/index.js';

const REFRESH_COOKIE_NAME = 'refreshToken';

@ApiAuthTag()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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

    const tokens = await this.authService.refresh(refreshToken);

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

    return this.authService.logout(request.user.userId, request.user.sessionId);
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
