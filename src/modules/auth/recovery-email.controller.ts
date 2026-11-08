import { Body, Controller, Get, Header, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiPublicRoute } from '../../docs/decorators/public.decorator.js';
import { JwtAuthGuard } from './guard/jwt-auth.guard.js';
import type { RequestWithUser } from './interfaces/request-with-user.interface.js';
import { RecoveryEmailService } from './recovery-email.service.js';

class RequestRecoveryEmailDto {
  @ApiProperty({ example: 'recuperacao@example.com', description: 'Endereço diferente do e-mail principal.' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(255) email: string;
  @ApiProperty({ example: 'Password123!', description: 'Senha atual.' })
  @IsString() @MinLength(1) @MaxLength(72) password: string;
  @ApiPropertyOptional({ example: '123456', description: 'TOTP atual obrigatório quando o 2FA já está ativo. Códigos de recuperação não autorizam trocar o endereço.' })
  @IsOptional() @Matches(/^\d{6}$/) code?: string;
}
class RemoveRecoveryEmailDto {
  @ApiProperty({ description: 'Senha atual.' })
  @IsString() @MinLength(1) @MaxLength(72) password: string;
  @ApiPropertyOptional({ description: 'TOTP atual quando o 2FA está ativo.' })
  @IsOptional() @Matches(/^\d{6}$/) code?: string;
}
class RecoveryEmailTokenDto {
  @ApiProperty({ description: 'Token de confirmação ou cancelamento recebido por e-mail; 256 bits, base64url.' })
  @Matches(/^[A-Za-z0-9_-]{43}$/) token: string;
}

@ApiTags('E-mail de recuperação')
@Controller('auth/recovery-email')
export class RecoveryEmailController {
  constructor(private readonly service: RecoveryEmailService) {}
  @Get() @Header('Cache-Control', 'no-store')
  @UseGuards(JwtAuthGuard) @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Consultar o próprio e-mail de recuperação', description: 'Somente o titular autenticado. Não expõe tokens e não inclui o endereço nos perfis públicos.' })
  @ApiResponse({ status: 200, description: 'Estado do endereço.', schema: { example: { email: 'recuperacao@example.com', verified: true, pendingEmail: null, availableAt: '2026-11-10T12:00:00.000Z' } } })
  @ApiResponse({ status: 401, description: 'Sessão inválida.' })
  status(@Req() req: RequestWithUser) { return this.service.status(req.user.userId); }

  @Post('request') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @UseGuards(JwtAuthGuard) @ApiBearerAuth('JWT-auth')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Cadastrar ou trocar e-mail de recuperação', description: 'Senha atual e, se o 2FA está ativo, TOTP atual. Confirmação de uso único expira em 30 minutos. O endereço antigo permanece até confirmar. Principal e endereço anterior recebem somente avisos/cancelamento. O novo endereço pode ser usado assim que confirmado; cada solicitação de recuperação tem seu próprio prazo de segurança.' })
  @ApiResponse({ status: 200, description: 'Confirmação enviada.', schema: { example: { sent: true } } })
  @ApiResponse({ status: 400, description: 'Formato inválido ou endereço igual ao principal/atual.' })
  @ApiResponse({ status: 401, description: 'Senha, sessão ou TOTP inválido.' })
  @ApiResponse({ status: 429, description: 'Limite de solicitações.' })
  @ApiResponse({ status: 503, description: 'Configuração do serviço indisponível.' })
  request(@Req() req: RequestWithUser, @Body() dto: RequestRecoveryEmailDto) { return this.service.request(req.user.userId, req.user.authVersion, dto.email, dto.password, dto.code); }

  @Post('remove-request') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @UseGuards(JwtAuthGuard) @ApiBearerAuth('JWT-auth')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Solicitar remoção do e-mail de recuperação', description: 'Exige senha e TOTP atual quando ativo. Envia confirmação ao endereço de recuperação.' })
  requestRemoval(@Req() req: RequestWithUser, @Body() dto: RemoveRecoveryEmailDto) { return this.service.request(req.user.userId, req.user.authVersion, null, dto.password, dto.code); }

  @Post('remove-confirm') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @ApiPublicRoute() @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Confirmar remoção do e-mail de recuperação' })
  confirmRemoval(@Body() dto: RecoveryEmailTokenDto) { return this.service.confirm(dto.token, false, true); }

  @Post('confirm') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @ApiPublicRoute() @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Confirmar e-mail de recuperação', description: 'Token recebido no novo endereço. Uso único, vinculado à versão de autenticação e à conta. Invalida recuperações pendentes, mantém o TOTP existente e notifica os endereços envolvidos.' })
  @ApiResponse({ status: 200, description: 'Confirmado.', schema: { example: { verified: true } } })
  @ApiResponse({ status: 400, description: 'Formato inválido.' })
  @ApiResponse({ status: 401, description: 'Token inválido, usado ou expirado.' })
  @ApiResponse({ status: 409, description: 'Endereço deixou de ser elegível.' })
  @ApiResponse({ status: 429, description: 'Limite de tentativas.' })
  confirm(@Body() dto: RecoveryEmailTokenDto) { return this.service.confirm(dto.token); }

  @Post('cancel') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @ApiPublicRoute() @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Cancelar cadastro/troca de e-mail de recuperação', description: 'Token distinto recebido no aviso, sem sessão. Preserva endereço confirmado e TOTP existentes.' })
  @ApiResponse({ status: 200, description: 'Cancelado.', schema: { example: { cancelled: true } } })
  @ApiResponse({ status: 400, description: 'Formato inválido.' })
  @ApiResponse({ status: 401, description: 'Token inválido ou expirado.' })
  @ApiResponse({ status: 429, description: 'Limite de tentativas.' })
  cancel(@Body() dto: RecoveryEmailTokenDto) { return this.service.confirm(dto.token, true); }
}
