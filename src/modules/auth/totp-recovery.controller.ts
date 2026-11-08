import { Body, Controller, Header, Headers, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../users/enums/user.enum.js';
import { JwtAuthGuard } from './guard/jwt-auth.guard.js';
import { RolesGuard } from './guard/roles.guard.js';
import type { RequestWithUser } from './interfaces/request-with-user.interface.js';
import { TotpRecoveryService } from './totp-recovery.service.js';
import { ApiPublicRoute } from '../../docs/decorators/public.decorator.js';

class AuthorizeRecoveryDto {
  @ApiProperty({ minLength: 10, maxLength: 1000, example: 'Identidade confirmada por canal independente; chamado REC-123.' })
  @IsString() @MinLength(10) @MaxLength(1000) reason: string;
}
class RecoveryTokenDto {
  @ApiProperty({ description: 'Token de 256 bits recebido pelo e-mail cadastrado. Nunca enviar na URL da API.', minLength: 43, maxLength: 43 })
  @Matches(/^[A-Za-z0-9_-]{43}$/) token: string;
}
class RecoverySetupDto extends RecoveryTokenDto {
  @ApiProperty({ description: 'Senha atual da conta.', example: 'Password123!' })
  @IsString() @MinLength(1) @MaxLength(72) password: string;
}
class RecoveryCompleteDto extends RecoverySetupDto {
  @ApiProperty({ description: 'Código do NOVO autenticador.', example: '123456' })
  @Matches(/^\d{6}$/) code: string;
}
class RequestRecoveryDto {
  @ApiProperty({ example: 'titular@example.com', description: 'E-mail principal de entrada. As instruções vão somente ao endereço de recuperação confirmado.' })
  @IsEmail() @MaxLength(255) email: string;
  @ApiProperty({ example: 'Password123!', description: 'Senha atual.' })
  @IsString() @MinLength(1) @MaxLength(72) password: string;
}

@ApiTags('Recuperação do autenticador')
@Controller()
export class TotpRecoveryController {
  constructor(private readonly service: TotpRecoveryService) {}

  @Post('auth/totp-recovery/request') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @ApiPublicRoute() @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Solicitar recuperação pelo endereço de recuperação', description: 'Senha e e-mail principal identificam a conta. Resposta genérica para conta inexistente, inelegível ou credenciais inválidas. Link de acesso somente no e-mail de recuperação previamente confirmado; principal recebe aviso e cancelamento. Não emite autorização para SUPER_ADMIN. O link pode ser usado imediatamente; há intervalo de 30 minutos entre solicitações.' })
  @ApiResponse({ status: 200, description: 'Resposta genérica; com senha válida e conta elegível, uma solicitação recente retorna retryAt em UTC.', schema: { example: { message: 'Uma solicitação recente impede um novo envio por 30 minutos. Tente novamente após o horário informado.', retryAt: '2026-11-08T21:19:21.000Z' } } })
  @ApiResponse({ status: 400, description: 'Formato inválido.' })
  @ApiResponse({ status: 429, description: 'Muitas solicitações.' })
  @ApiResponse({ status: 503, description: 'Configuração indisponível.' })
  request(@Body() dto: RequestRecoveryDto) { return this.service.request(dto.email, dto.password); }

  @Post('admin/users/:id/totp-recovery')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.SUPER_ADMIN)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiBearerAuth('JWT-auth')
  @ApiHeader({ name: 'X-TOTP-Code', required: true, description: 'Código TOTP atual do autorizador, de uso único.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Autorizar recuperação assistida de 2FA', description: 'Somente SUPER_ADMIN com TOTP atual. Exige verificar a identidade por outro canal e registrar o atendimento. Proíbe a própria conta e alvos SUPER_ADMIN. Envia autorização ao e-mail já verificado; não remove o fator atual. Autorização disponível imediatamente e válida por 24 horas.' })
  @ApiResponse({ status: 200, description: 'Autorização enviada.', schema: { example: { authorized: true, availableAt: '2026-11-10T12:00:00.000Z', expiresAt: '2026-11-11T12:00:00.000Z' } } })
  @ApiResponse({ status: 400, description: 'Motivo ou UUID inválido.' })
  @ApiResponse({ status: 401, description: 'Sessão ou TOTP inválido.' })
  @ApiResponse({ status: 403, description: 'Permissão insuficiente, própria conta ou alvo SUPER_ADMIN.' })
  @ApiResponse({ status: 409, description: 'Conta não elegível.' })
  @ApiResponse({ status: 429, description: 'Limite de solicitações.' })
  authorize(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser, @Body() dto: AuthorizeRecoveryDto, @Headers('x-totp-code') code = '') {
    return this.service.authorize(req.user.userId, req.user.authVersion, id, code, dto.reason);
  }

  @Post('auth/totp-recovery/setup') @HttpCode(200)
  @ApiPublicRoute()
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Preparar novo autenticador após autorização', description: 'Sem sessão: exige autorização válida e senha atual. Retorna secret, otpauthUri, qrCode e expiresIn=600. Não desativa o autenticador existente. Até dez tentativas por autorização.' })
  @ApiResponse({ status: 200, description: 'QR Code e segredo temporário do novo autenticador.' })
  @ApiResponse({ status: 400, description: 'Formato inválido.' })
  @ApiResponse({ status: 401, description: 'Autorização ou credenciais inválidas.' })
  @ApiResponse({ status: 429, description: 'Limite de tentativas.' })
  setup(@Body() dto: RecoverySetupDto) { return this.service.recover(dto.token, dto.password); }

  @Post('auth/totp-recovery/complete') @HttpCode(200)
  @ApiPublicRoute()
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Confirmar substituição do autenticador', description: 'Exige autorização, senha e código do novo autenticador. Consome a autorização uma única vez, revoga sessões e códigos antigos, emite novos códigos e notifica o titular. Não abre sessão automaticamente.' })
  @ApiResponse({ status: 200, description: 'Recuperação concluída; salvar os códigos apresentados uma única vez.', schema: { example: { recovered: true, recoveryCodes: ['a1b2-c3d4'] } } })
  @ApiResponse({ status: 400, description: 'Formato inválido.' })
  @ApiResponse({ status: 401, description: 'Credenciais, código ou autorização inválidos ou expirados.' })
  @ApiResponse({ status: 409, description: 'Período de segurança em curso.' })
  @ApiResponse({ status: 429, description: 'Limite de tentativas.' })
  complete(@Body() dto: RecoveryCompleteDto) { return this.service.recover(dto.token, dto.password, dto.code); }

  @Post('auth/totp-recovery/cancel') @HttpCode(200)
  @ApiPublicRoute()
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Cancelar recuperação pelo aviso de segurança', description: 'Exige o token de cancelamento distinto enviado ao titular. Nunca altera o fator atual nem abre sessão.' })
  @ApiResponse({ status: 200, description: 'Autorização cancelada.', schema: { example: { cancelled: true } } })
  @ApiResponse({ status: 400, description: 'Token malformado.' })
  @ApiResponse({ status: 401, description: 'Autorização inválida ou expirada.' })
  @ApiResponse({ status: 429, description: 'Limite de tentativas.' })
  cancel(@Body() dto: RecoveryTokenDto) { return this.service.cancel(dto.token); }
}
