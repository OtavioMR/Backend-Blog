import { Body, Controller, Header, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from './guard/jwt-auth.guard.js';
import type { RequestWithUser } from './interfaces/request-with-user.interface.js';
import { TotpService } from './totp.service.js';
class PasswordDto { @ApiProperty({ example: 'Password123!' }) @IsString() @MinLength(1) @MaxLength(72) password: string; }
class CodeDto { @ApiProperty({ example: '123456' }) @Matches(/^\d{6}$/) code: string; }
class DisableDto extends PasswordDto { @ApiProperty({ example: '123456' }) @Matches(/^\d{6}$/) code: string; }
@ApiTags('Autenticação') @ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard) @Controller('auth/totp')
export class TotpController {
  constructor(private readonly service: TotpService) {}
  @Post('setup') @HttpCode(200) @Header('Cache-Control', 'no-store') @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Iniciar configuração do TOTP', description: 'Exige a senha atual. Adicione o segredo ou a URI retornada ao autenticador; a configuração expira em dez minutos.' })
  @ApiResponse({ status: 200, description: 'Segredo e URI para o autenticador.', schema: { example: { secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/Backend%20Blog:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Backend%20Blog', expiresIn: 600 } } })
  @ApiResponse({ status: 400, description: 'Dados inválidos.' }) @ApiResponse({ status: 401, description: 'Token ou senha inválidos.' })
  @ApiResponse({ status: 409, description: 'TOTP já ativado.' }) @ApiResponse({ status: 503, description: 'Chave de criptografia do TOTP não configurada.' })
  setup(@Req() req: RequestWithUser, @Body() dto: PasswordDto) { return this.service.setup(req.user.userId, dto.password); }
  @Post('enable') @HttpCode(200) @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Confirmar e ativar TOTP', description: 'Envie um código do autenticador. Todas as sessões serão invalidadas e será necessário entrar novamente.' })
  @ApiResponse({ status: 200, description: 'TOTP ativado.', schema: { example: { enabled: true } } })
  @ApiResponse({ status: 400, description: 'Dados inválidos ou configuração expirada.' }) @ApiResponse({ status: 401, description: 'Token ou código inválido.' })
  @ApiResponse({ status: 409, description: 'TOTP já ativado.' }) @ApiResponse({ status: 503, description: 'Chave de criptografia do TOTP não configurada.' })
  enable(@Req() req: RequestWithUser, @Body() dto: CodeDto) { return this.service.enable(req.user.userId, dto.code); }
  @Post('disable') @HttpCode(200) @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Desativar TOTP', description: 'Exige a senha atual e um código atual do autenticador. Todas as sessões serão invalidadas.' })
  @ApiResponse({ status: 200, description: 'TOTP desativado.', schema: { example: { enabled: false } } })
  @ApiResponse({ status: 400, description: 'Dados inválidos.' }) @ApiResponse({ status: 401, description: 'Credenciais inválidas.' }) @ApiResponse({ status: 503, description: 'Chave de criptografia do TOTP não configurada.' })
  disable(@Req() req: RequestWithUser, @Body() dto: DisableDto) { return this.service.disable(req.user.userId, dto.password, dto.code); }
}
