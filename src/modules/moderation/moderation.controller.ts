import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiProperty, ApiPropertyOptional, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ArrayMaxSize, IsArray, IsEnum, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guard/roles.guard.js';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface.js';
import { UserRole } from '../users/enums/user.enum.js';
import { ModerationService } from './moderation.service.js';
import { AdminUsersQuery } from './admin-users.dto.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { TotpService } from '../auth/totp.service.js';
class SuspendDto {
  @ApiProperty({ minLength: 5, maxLength: 1000, example: 'Abuso recorrente' }) @IsString() @MinLength(5) @MaxLength(1000) reason: string;
  @ApiPropertyOptional({ nullable: true, format: 'date-time', example: '2099-01-01T00:00:00Z', description: 'Omita ou use null para banimento permanente.' }) @IsOptional() @IsISO8601({ strict: true }) endsAt?: string | null;
  @ApiPropertyOptional({ type: [String], format: 'uuid', example: [], description: 'Artigos publicados que serão ocultados permanentemente.' }) @IsOptional() @IsArray() @ArrayMaxSize(100) @IsUUID('4', { each: true }) hidePostIds?: string[];
}
class ChangeRoleDto {
  @ApiProperty({ enum: UserRole, example: UserRole.ADMIN }) @IsEnum(UserRole) role: UserRole;
  @ApiProperty({ minLength: 5, maxLength: 1000, example: 'Responsabilidade administrativa aprovada' }) @IsString() @MinLength(5) @MaxLength(1000) reason: string;
}
class RevokeSessionsDto {
  @ApiProperty({ minLength: 5, maxLength: 1000, example: 'Sessões revogadas por segurança' }) @IsString() @MinLength(5) @MaxLength(1000) reason: string;
}
@ApiTags('Moderação') @ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN)
@Controller('admin/users')
export class ModerationController {
  constructor(private readonly service: ModerationService, private readonly totp: TotpService) {}
  @Get()
  @ApiOperation({ summary: 'Listar usuários para administração', description: 'ADMIN ou SUPER_ADMIN; permite buscar, filtrar e ordenar contas não excluídas.' })
  @ApiResponse({ status: 200, description: 'Contas paginadas; administradores incluem dados de concessão quando registrados na auditoria.', schema: { example: { data: [{ id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', name: 'Ana', email: 'ana@example.com', role: 'READER', profilePhoto: null, isActive: true, moderationSuspended: false, createdAt: '2026-01-01T00:00:00.000Z', grantedAt: null, grantedBy: null }], meta: { page: 1, limit: 10, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false } } } })
  @ApiResponse({ status: 400, description: 'Filtros ou paginação inválidos.' })
  @ApiResponse({ status: 401, description: 'Autenticação necessária.' })
  @ApiResponse({ status: 403, description: 'Requer administrador.' })
  listUsers(@Query() query: AdminUsersQuery) { return this.service.listUsers(query); }
  @Get(':id')
  @ApiOperation({ summary: 'Consultar usuário para moderação', description: 'ADMIN ou SUPER_ADMIN; inclui estado da conta e contagens de publicações e comentários.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Detalhes de moderação.', schema: { example: { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', name: 'Ana', email: 'ana@example.com', role: 'READER', isActive: true, moderationSuspended: false, suspensionEndsAt: null, emailVerified: true, createdAt: '2026-01-01T00:00:00.000Z', counts: { posts: 0, comments: 2 } } } })
  @ApiResponse({ status: 400, description: 'UUID inválido.' })
  @ApiResponse({ status: 401, description: 'Autenticação necessária.' })
  @ApiResponse({ status: 403, description: 'Requer administrador.' })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado.' })
  userDetail(@Param('id', ParseUUIDPipe) id: string) { return this.service.userDetail(id); }
  @Get(':id/moderation-history')
  @ApiOperation({ summary: 'Consultar histórico administrativo do usuário', description: 'ADMIN ou SUPER_ADMIN; lista eventos de suspensão, restauração e permissões do usuário, em ordem decrescente.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Eventos paginados.', schema: { example: { data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false } } } })
  @ApiResponse({ status: 400, description: 'Identificador ou paginação inválidos.' })
  @ApiResponse({ status: 401, description: 'Autenticação necessária.' })
  @ApiResponse({ status: 403, description: 'Requer administrador.' })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado.' })
  userHistory(@Param('id', ParseUUIDPipe) id: string, @Query() query: PaginationQueryDto) { return this.service.userHistory(id, query.page, query.limit); }
  @Get(':id/reports')
  @ApiOperation({ summary: 'Listar denúncias relacionadas ao usuário', description: 'Inclui denúncias de perfil e de seus artigos e comentários, sem dados do denunciante na listagem.' })
  @ApiParam({ name: 'id', format: 'uuid' }) @ApiResponse({ status: 200, description: 'Denúncias paginadas.' }) @ApiResponse({ status: 400, description: 'Identificador ou paginação inválidos.' }) @ApiResponse({ status: 401, description: 'Autenticação necessária.' }) @ApiResponse({ status: 403, description: 'Requer administrador.' }) @ApiResponse({ status: 404, description: 'Usuário não encontrado.' })
  userReports(@Param('id', ParseUUIDPipe) id: string, @Query() query: PaginationQueryDto) { return this.service.userReports(id, query.page, query.limit); }
  @Patch(':id/role')
  @Roles(UserRole.SUPER_ADMIN)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Alterar função de outro usuário', description: 'Exclusivo para SUPER_ADMIN com TOTP ativado. Exige código atual de uso único; revoga sessões e registra o motivo.' })
  @ApiHeader({ name: 'X-TOTP-Code', required: true, description: 'Código TOTP atual de seis dígitos.', schema: { type: 'string', pattern: '^\\d{6}$', example: '123456' } })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Função alterada.', schema: { example: { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', role: 'ADMIN' } } })
  @ApiResponse({ status: 400, description: 'Dados inválidos.' })
  @ApiResponse({ status: 401, description: 'Autenticação necessária ou código TOTP inválido, reutilizado ou não configurado.' })
  @ApiResponse({ status: 403, description: 'Requer SUPER_ADMIN e impede alteração da própria função.' })
  @ApiResponse({ status: 404, description: 'Usuário ativo não encontrado.' })
  @ApiResponse({ status: 409, description: 'Função inalterada ou último SUPER_ADMIN.' })
  async changeRole(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser, @Body() dto: ChangeRoleDto, @Headers('x-totp-code') code?: string) {
    if (!(await this.totp.verifyLogin(req.user.userId, code))) throw new UnauthorizedException('Código TOTP inválido ou não configurado.');
    return this.service.changeRole(req.user.userId, id, dto.role, dto.reason, req.user.authVersion);
  }
  @Post(':id/sessions/revoke')
  @ApiOperation({ summary: 'Revogar sessões de uma conta', description: 'ADMIN pode revogar sessões de contas comuns; SUPER_ADMIN também pode revogar sessões de administradores. A alteração invalida tokens e é auditada.' })
  @ApiParam({ name: 'id', format: 'uuid' }) @ApiResponse({ status: 201, description: 'Sessões invalidadas.', schema: { example: { revoked: true } } }) @ApiResponse({ status: 400, description: 'Dados inválidos.' }) @ApiResponse({ status: 401, description: 'Autenticação necessária.' }) @ApiResponse({ status: 403, description: 'Permissão insuficiente ou sessão administrativa inválida.' }) @ApiResponse({ status: 404, description: 'Usuário não encontrado.' })
  revokeSessions(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser, @Body() dto: RevokeSessionsDto) { return this.service.revokeUserSessions(req.user.userId, id, req.user.authVersion, dto.reason); }
  @Post(':id/suspension')
  @ApiOperation({ summary: 'Suspender ou banir usuário', description: 'ADMIN pode suspender contas comuns; SUPER_ADMIN pode também suspender ADMIN. Contas SUPER_ADMIN não podem ser suspensas. Revoga sessões; omitir endsAt cria banimento permanente.' })
  @ApiParam({ name: 'id', format: 'uuid', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @ApiResponse({ status: 201, description: 'Suspensão aplicada.', schema: { example: { suspended: true, endsAt: null } } })
  @ApiResponse({ status: 400, description: 'Motivo, prazo ou identificadores de artigos inválidos.' })
  @ApiResponse({ status: 401, description: 'Autenticação necessária.' })
  @ApiResponse({ status: 403, description: 'Permissão insuficiente, conta protegida ou tentativa de suspender a própria conta.' })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado.' })
  @ApiResponse({ status: 409, description: 'Usuário já está inativo.' })
  suspend(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser, @Body() dto: SuspendDto) { return this.service.suspend(req.user.userId, id, dto.reason, dto.endsAt ?? null, dto.hidePostIds ?? [], req.user.authVersion); }
  @Post(':id/restore')
  @ApiOperation({ summary: 'Restaurar usuário suspenso', description: 'ADMIN restaura contas comuns; SUPER_ADMIN também restaura ADMIN. Artigos ocultados permanecem ocultos.' })
  @ApiParam({ name: 'id', format: 'uuid', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @ApiResponse({ status: 201, description: 'Usuário restaurado.', schema: { example: { suspended: false } } })
  @ApiResponse({ status: 401, description: 'Autenticação necessária.' })
  @ApiResponse({ status: 403, description: 'Permissão insuficiente ou conta protegida.' })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado.' })
  @ApiResponse({ status: 409, description: 'Usuário não está suspenso.' })
  restore(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) { return this.service.restore(req.user.userId, id, req.user.authVersion); }
}
