import { Body, Controller, Get, Header, HttpCode, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { ApiPublicRoute } from '../../docs/decorators/public.decorator.js';
import { JwtAuthGuard } from './guard/jwt-auth.guard.js';
import type { RequestWithUser } from './interfaces/request-with-user.interface.js';
import { AuthService, TokenPairResult } from './auth.service.js';
import { SocialAuthService } from './social-auth.service.js';
class CallbackQuery {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(4096) code: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(256) state: string;
}
class ChallengeDto {
  @ApiProperty({ example: 'opaque-challenge-token' }) @IsString() @MinLength(1) @MaxLength(256) challenge: string;
  @ApiProperty({ example: '123456' }) @Matches(/^\d{6}$/) code: string;
}
@ApiTags('Autenticação') @Controller('auth/social')
export class SocialAuthController {
  constructor(private readonly social: SocialAuthService, private readonly auth: AuthService) {}
  private stateCookie() { const opts = this.auth.getRefreshTokenCookieOptions(); return { httpOnly: true, secure: opts.secure, sameSite: 'lax' as const, path: '/api/v1/auth/social', maxAge: 600000 }; }
  private sendTokens(res: Response, tokens: TokenPairResult) {
    res.cookie('refreshToken', tokens.refreshToken, this.auth.getRefreshTokenCookieOptions());
    return { access_token: tokens.accessToken, token_type: tokens.tokenType, expires_in: tokens.expiresIn };
  }
  @Get(':provider/start') @Header('Cache-Control', 'no-store') @ApiPublicRoute() @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Iniciar login social', description: 'Acesse a URL de autorização retornada. Um cookie HTTP-only temporário vincula o retorno a este navegador.' })
  @ApiParam({ name: 'provider', enum: ['google', 'github'] })
  @ApiResponse({ status: 200, description: 'URL de autorização e cookie de estado.', schema: { example: { url: 'https://accounts.google.com/o/oauth2/v2/auth?...' } } })
  @ApiResponse({ status: 400, description: 'Provedor não suportado.' }) @ApiResponse({ status: 503, description: 'Provedor não configurado.' })
  async start(@Param('provider') provider: string, @Res({ passthrough: true }) res: Response) {
    const result = await this.social.start(provider); res.cookie('oauthState', result.state, this.stateCookie()); return { url: result.url };
  }
  @Post(':provider/link') @Header('Cache-Control', 'no-store') @UseGuards(JwtAuthGuard) @ApiBearerAuth('JWT-auth') @HttpCode(200) @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Iniciar vinculação de conta social', description: 'Autentique-se primeiro. O provedor deve confirmar o mesmo e-mail verificado da conta.' })
  @ApiParam({ name: 'provider', enum: ['google', 'github'] })
  @ApiResponse({ status: 200, description: 'URL de autorização e cookie de estado.', schema: { example: { url: 'https://accounts.google.com/o/oauth2/v2/auth?...' } } })
  @ApiResponse({ status: 400, description: 'Provedor não suportado.' }) @ApiResponse({ status: 401, description: 'Autenticação necessária.' }) @ApiResponse({ status: 503, description: 'Provedor não configurado.' })
  async link(@Param('provider') provider: string, @Req() req: RequestWithUser, @Res({ passthrough: true }) res: Response) {
    const result = await this.social.start(provider, { id: req.user.userId, authVersion: req.user.authVersion, sessionId: req.user.sessionId }); res.cookie('oauthState', result.state, this.stateCookie()); return { url: result.url };
  }
  @Get(':provider/callback') @Header('Cache-Control', 'no-store') @ApiPublicRoute() @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Concluir login ou vinculação social', description: 'O retorno do provedor valida o cookie de estado e o PKCE. Retorna tokens, desafio TOTP ou confirmação de vínculo.' })
  @ApiParam({ name: 'provider', enum: ['google', 'github'] })
  @ApiResponse({ status: 200, description: 'Tokens, desafio TOTP ou confirmação de vínculo.', schema: { example: { access_token: 'eyJ...', token_type: 'Bearer', expires_in: 900 } } })
  @ApiResponse({ status: 400, description: 'Parâmetros ou provedor inválidos.' }) @ApiResponse({ status: 401, description: 'Estado ou identidade do provedor inválidos.' }) @ApiResponse({ status: 409, description: 'Uma conta existente exige vinculação explícita.' }) @ApiResponse({ status: 503, description: 'Provedor indisponível ou não configurado.' })
  async callback(@Param('provider') provider: string, @Query() query: CallbackQuery, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookie = req.cookies?.oauthState ?? ''; res.clearCookie('oauthState', { ...this.stateCookie(), maxAge: undefined });
    const result = await this.social.callback(provider, query.code, query.state, cookie, req.get('user-agent'));
    if (result.tokens) return this.sendTokens(res, result.tokens);
    if (result.challenge) return { requires_totp: true, challenge: result.challenge, expires_in: 300 };
    return { linked: true };
  }
  @Post('challenge') @Header('Cache-Control', 'no-store') @ApiPublicRoute() @HttpCode(200) @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Concluir login social com TOTP', description: 'O desafio de uso único expira em cinco minutos e exige um código atual do autenticador.' })
  @ApiResponse({ status: 200, description: 'Token de acesso e cookie de renovação.', schema: { example: { access_token: 'eyJ...', token_type: 'Bearer', expires_in: 900 } } })
  @ApiResponse({ status: 400, description: 'Dados inválidos.' }) @ApiResponse({ status: 401, description: 'Desafio ou código inválido.' }) @ApiResponse({ status: 503, description: 'TOTP não configurado.' })
  async challenge(@Body() dto: ChallengeDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) { return this.sendTokens(res, await this.social.finishChallenge(dto.challenge, dto.code, req.get('user-agent'))); }
}
