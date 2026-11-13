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
  @ApiResponse({ status: 200, description: 'Endereço confirmado e solicitação pendente (null quando ausente, expirada ou invalidada). pending.action distingue add, replace e remove; pending.email é o destino da confirmação.', schema: { example: { email: 'recuperacao@example.com', verified: true, pendingEmail: null, availableAt: '2026-11-10T12:00:00.000Z', pending: { action: 'remove', email: 'principal@example.com', confirmationDestination: 'primary', expiresAt: '2026-11-11T12:30:00.000Z' } } } })
  @ApiResponse({ status: 401, description: 'Sessão inválida.' })
  status(@Req() req: RequestWithUser) { return this.service.status(req.user.userId); }

  @Post('cancel-pending') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @UseGuards(JwtAuthGuard) @ApiBearerAuth('JWT-auth')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Cancelar a própria alteração pendente', description: 'Sessão atual do titular. Invalida os links de cadastro, troca ou remoção; preserva o endereço confirmado e o autenticador. Idempotente quando não há solicitação pendente.' })
  @ApiResponse({ status: 200, description: 'Solicitação cancelada.', schema: { example: { cancelled: true } } })
  @ApiResponse({ status: 401, description: 'Sessão inválida ou desatualizada.' })
  @ApiResponse({ status: 429, description: 'Muitas solicitações.' })
  cancelPending(@Req() req: RequestWithUser) { return this.service.cancelPending(req.user.userId, req.user.authVersion); }

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
  @ApiOperation({ summary: 'Solicitar remoção do e-mail de recuperação', description: 'Somente READER/AUTHOR, independentemente do 2FA. Exige senha e TOTP atual quando ativo. Envia confirmação ao principal verificado e aviso/cancelamento ao secundário. O secundário permanece válido até confirmar a remoção. Mantém o autenticador atual. ADMIN/SUPER_ADMIN devem substituir o secundário por outro verificado ou perder privilégios pelo fluxo autorizado.' })
  @ApiResponse({ status: 200, description: 'Confirmação de remoção enviada ao principal; válida por 30 minutos. A remoção ainda não foi concluída.', schema: { example: { sent: true, confirmationDestination: 'primary', expiresAt: '2026-11-11T12:30:00.000Z' } } })
  @ApiResponse({ status: 400, description: 'Dados inválidos.' })
  @ApiResponse({ status: 401, description: 'Senha, sessão ou TOTP inválido, ou conta bloqueada.' })
  @ApiResponse({ status: 403, description: 'Conta administrativa não pode remover o secundário.' })
  @ApiResponse({ status: 409, description: 'Sem secundário confirmado para remover.' })
  @ApiResponse({ status: 429, description: 'Limite de solicitações.' })
  @ApiResponse({ status: 503, description: 'Configuração indisponível.' })
  requestRemoval(@Req() req: RequestWithUser, @Body() dto: RemoveRecoveryEmailDto) { return this.service.request(req.user.userId, req.user.authVersion, null, dto.password, dto.code); }

  @Post('remove-confirm') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @ApiPublicRoute() @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Confirmar remoção do e-mail de recuperação', description: 'Token de uso único e 30 minutos, vinculado à versão de autenticação. Revalida função sob lock; ADMIN/SUPER_ADMIN não podem remover mesmo com token anterior. Invalida recuperações pendentes e notifica o titular, preservando o 2FA.' })
  @ApiResponse({ status: 200, description: 'Secundário removido; configuração de 2FA mantida.', schema: { example: { removed: true } } })
  @ApiResponse({ status: 400, description: 'Token malformado.' })
  @ApiResponse({ status: 401, description: 'Token inválido, expirado ou já utilizado.' })
  @ApiResponse({ status: 403, description: 'Conta administrativa não pode remover o secundário.' })
  @ApiResponse({ status: 409, description: 'Solicitação incompatível com remoção.' })
  @ApiResponse({ status: 429, description: 'Limite de tentativas.' })
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
