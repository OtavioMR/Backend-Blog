import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guard/roles.guard.js';
import { UserRole } from '../users/enums/user.enum.js';
import { AuditService } from './audit.service.js';
export class AuditQuery {
  @ApiPropertyOptional({ default: 1, minimum: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() actorId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() targetId?: string;
  @ApiPropertyOptional({ example: 'user.suspend', maxLength: 100 }) @IsOptional() @IsString() @MaxLength(100) action?: string;
  @ApiPropertyOptional({ example: 'user', maxLength: 100 }) @IsOptional() @IsString() @MaxLength(100) targetType?: string;
  @ApiPropertyOptional({ description: 'Pesquisa por ação, responsável ou conteúdo afetado.', maxLength: 100 }) @IsOptional() @IsString() @MaxLength(100) search?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ description: 'Incluir eventos de login e sessão (auth.session_created, auth.session_revoked). Padrão: false.', default: false })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === '1') return true;
    if (value === 'false' || value === false || value === '0') return false;
    return value;
  })
  @IsBoolean()
  includeSessions?: boolean;
}
@ApiTags('Auditoria') @ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN)
@Controller('admin/audit-logs')
export class AuditController {
  constructor(private readonly service: AuditService) {}
  @Get()
  @ApiOperation({ summary: 'Consultar trilha de auditoria', description: 'Apenas administradores. Eventos ordenados do mais recente ao mais antigo; filtros por responsável, ação, alvo e período, com pesquisa e nomes de referência disponíveis.' })
  @ApiResponse({ status: 200, description: 'Eventos paginados.', schema: { example: { data: [{ action: 'report.review', targetType: 'report', targetId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', details: { status: 'RESOLVED' } }], meta: { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPreviousPage: false } } } })
  @ApiResponse({ status: 400, description: 'Paginação inválida.' })
  @ApiResponse({ status: 401, description: 'Autenticação necessária.' })
  @ApiResponse({ status: 403, description: 'Apenas administradores.' })
  list(@Query() query: AuditQuery) { return this.service.list(query.page, query.limit, query); }
}
