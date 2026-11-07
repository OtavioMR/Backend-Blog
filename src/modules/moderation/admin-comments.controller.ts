import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiProperty, ApiPropertyOptional, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guard/roles.guard.js';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface.js';
import { UserRole } from '../users/enums/user.enum.js';
import { ModerationService } from './moderation.service.js';

class CommentQuery extends PaginationQueryDto {
  @ApiPropertyOptional({ maxLength: 200 }) @IsOptional() @IsString() @MaxLength(200) search?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() authorId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() postId?: string;
  @ApiPropertyOptional({ enum: ['active', 'hidden', 'deleted'] }) @IsOptional() @IsIn(['active', 'hidden', 'deleted']) status?: 'active' | 'hidden' | 'deleted';
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsDateString() to?: string;
}
class ModerationReasonDto {
  @ApiProperty({ minLength: 5, maxLength: 1000, example: 'Conteúdo ofensivo' }) @IsString() @MinLength(5) @MaxLength(1000) reason: string;
}

@ApiTags('Moderação de comentários') @ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN)
@Controller('admin/comments')
export class AdminCommentsController {
  constructor(private readonly service: ModerationService) {}
  @Get()
  @ApiOperation({ summary: 'Listar comentários para moderação', description: 'Pesquisa paginada entre artigos, incluindo comentários ocultos e desativados.' })
  @ApiResponse({ status: 200, description: 'Comentários paginados.', schema: { example: { data: [{ id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', postId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', content: 'Comentário', isActive: true, moderationHidden: false }], meta: { page: 1, limit: 10, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false } } } })
  @ApiResponse({ status: 400, description: 'Filtros inválidos.' }) @ApiResponse({ status: 401, description: 'Autenticação necessária.' }) @ApiResponse({ status: 403, description: 'Requer administrador.' })
  list(@Query() query: CommentQuery) { return this.service.listComments(query); }
  @Get(':id')
  @ApiOperation({ summary: 'Consultar comentário e denúncias relacionadas', description: 'Retorna contexto da conversa e até 100 denúncias recentes sem identificar denunciantes.' })
  @ApiParam({ name: 'id', format: 'uuid' }) @ApiResponse({ status: 200, description: 'Comentário e denúncias.', schema: { example: { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', content: 'Comentário', isActive: true, moderationHidden: false, rootId: null, replyToId: null, reports: [] } } }) @ApiResponse({ status: 400, description: 'UUID inválido.' }) @ApiResponse({ status: 401, description: 'Autenticação necessária.' }) @ApiResponse({ status: 403, description: 'Requer administrador.' }) @ApiResponse({ status: 404, description: 'Comentário não encontrado.' })
  detail(@Param('id', ParseUUIDPipe) id: string) { return this.service.commentDetail(id); }
  @Get(':id/history')
  @ApiOperation({ summary: 'Consultar ações auditadas de um comentário' })
  @ApiParam({ name: 'id', format: 'uuid' }) @ApiResponse({ status: 200, description: 'Histórico paginado.' }) @ApiResponse({ status: 400, description: 'UUID ou paginação inválidos.' }) @ApiResponse({ status: 401, description: 'Autenticação necessária.' }) @ApiResponse({ status: 403, description: 'Requer administrador.' }) @ApiResponse({ status: 404, description: 'Comentário não encontrado.' })
  history(@Param('id', ParseUUIDPipe) id: string, @Query() query: PaginationQueryDto) { return this.service.contentHistory('comment', id, query.page, query.limit); }
  @Post(':id/hide')
  @ApiOperation({ summary: 'Ocultar comentário', description: 'Requer justificativa e registra auditoria. A conversa é preservada.' })
  @ApiParam({ name: 'id', format: 'uuid' }) @ApiResponse({ status: 201, description: 'Comentário ocultado.', schema: { example: { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', isActive: false, moderationHidden: true } } })
  @ApiResponse({ status: 400, description: 'Dados inválidos.' }) @ApiResponse({ status: 401, description: 'Autenticação necessária.' }) @ApiResponse({ status: 403, description: 'Requer administrador.' }) @ApiResponse({ status: 404, description: 'Comentário não encontrado.' }) @ApiResponse({ status: 409, description: 'Comentário indisponível.' })
  hide(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser, @Body() dto: ModerationReasonDto) { return this.service.moderateComment(id, req.user.userId, true, dto.reason); }
  @Post(':id/restore')
  @ApiOperation({ summary: 'Restaurar comentário ocultado pela administração', description: 'Não restaura comentários excluídos pelo autor ou removidos por outros meios.' })
  @ApiParam({ name: 'id', format: 'uuid' }) @ApiResponse({ status: 201, description: 'Comentário restaurado.', schema: { example: { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', isActive: true, moderationHidden: false } } })
  @ApiResponse({ status: 400, description: 'Dados inválidos.' }) @ApiResponse({ status: 401, description: 'Autenticação necessária.' }) @ApiResponse({ status: 403, description: 'Requer administrador.' }) @ApiResponse({ status: 404, description: 'Comentário não encontrado.' }) @ApiResponse({ status: 409, description: 'Comentário não foi ocultado pela administração.' })
  restore(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser, @Body() dto: ModerationReasonDto) { return this.service.moderateComment(id, req.user.userId, false, dto.reason); }
}
