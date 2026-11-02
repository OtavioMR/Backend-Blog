import { Body, Controller, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiProperty, ApiPropertyOptional, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guard/roles.guard.js';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface.js';
import { UserRole } from '../users/enums/user.enum.js';
import { ModerationService } from './moderation.service.js';
class SuspendDto {
  @ApiProperty({ minLength: 5, maxLength: 1000, example: 'Abuso recorrente' }) @IsString() @MinLength(5) @MaxLength(1000) reason: string;
  @ApiPropertyOptional({ nullable: true, format: 'date-time', example: '2099-01-01T00:00:00Z', description: 'Omita ou use null para banimento permanente.' }) @IsOptional() @IsISO8601({ strict: true }) endsAt?: string | null;
  @ApiPropertyOptional({ type: [String], format: 'uuid', example: [], description: 'Artigos publicados que serão ocultados permanentemente.' }) @IsOptional() @IsArray() @ArrayMaxSize(100) @IsUUID('4', { each: true }) hidePostIds?: string[];
}
@ApiTags('Moderação') @ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN)
@Controller('admin/users')
export class ModerationController {
  constructor(private readonly service: ModerationService) {}
  @Post(':id/suspension')
  @ApiOperation({ summary: 'Suspender ou banir usuário', description: 'Apenas administradores. Revoga sessões e oculta os artigos selecionados; omitir endsAt cria um banimento permanente.' })
  @ApiParam({ name: 'id', format: 'uuid', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @ApiResponse({ status: 201, description: 'Suspensão aplicada.', schema: { example: { suspended: true, endsAt: null } } })
  @ApiResponse({ status: 400, description: 'Motivo, prazo ou identificadores de artigos inválidos.' })
  @ApiResponse({ status: 401, description: 'Autenticação necessária.' })
  @ApiResponse({ status: 403, description: 'Requer administrador; não é permitido suspender a própria conta.' })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado.' })
  @ApiResponse({ status: 409, description: 'Usuário já está inativo.' })
  suspend(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser, @Body() dto: SuspendDto) { return this.service.suspend(req.user.userId, id, dto.reason, dto.endsAt ?? null, dto.hidePostIds ?? []); }
  @Post(':id/restore')
  @ApiOperation({ summary: 'Restaurar usuário suspenso', description: 'Apenas administradores. Artigos ocultados permanecem ocultos.' })
  @ApiParam({ name: 'id', format: 'uuid', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @ApiResponse({ status: 201, description: 'Usuário restaurado.', schema: { example: { suspended: false } } })
  @ApiResponse({ status: 401, description: 'Autenticação necessária.' })
  @ApiResponse({ status: 403, description: 'Requer administrador.' })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado.' })
  @ApiResponse({ status: 409, description: 'Usuário não está suspenso.' })
  restore(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) { return this.service.restore(req.user.userId, id); }
}
