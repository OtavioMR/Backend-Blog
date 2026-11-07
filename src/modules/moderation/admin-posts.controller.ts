import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiProperty, ApiPropertyOptional, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guard/roles.guard.js';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface.js';
import { UserRole } from '../users/enums/user.enum.js';
import { ModerationService } from './moderation.service.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

class ReasonDto { @ApiProperty({ minLength: 5, maxLength: 1000, example: 'Violação das regras editoriais' }) @IsString() @MinLength(5) @MaxLength(1000) reason: string; }
class PostQuery extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['published', 'pending', 'rejected', 'hidden', 'draft'] }) @IsOptional() @IsIn(['published', 'pending', 'rejected', 'hidden', 'draft']) status?: 'published' | 'pending' | 'rejected' | 'hidden' | 'draft';
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() authorId?: string;
  @ApiPropertyOptional({ maxLength: 150 }) @IsOptional() @IsString() @MaxLength(150) search?: string;
}
@ApiTags('Moderação de artigos') @ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN)
@Controller('admin/posts')
export class AdminPostsController {
  constructor(private readonly service: ModerationService) {}
  @Get()
  @ApiOperation({ summary: 'Listar artigos para moderação', description: 'Inclui rascunhos, pendentes, publicados, rejeitados e ocultados; aceita paginação, autor e busca por título.' })
  @ApiResponse({ status: 200, description: 'Artigos paginados.', schema: { example: { data: [{ id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', title: 'Artigo', published: false, reviewStatus: 'PENDING', isActive: true, moderationHidden: false }], meta: { page: 1, limit: 10, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false } } } }) @ApiResponse({ status: 400, description: 'Filtros inválidos.' }) @ApiResponse({ status: 401, description: 'Autenticação necessária.' }) @ApiResponse({ status: 403, description: 'Requer administrador.' })
  list(@Query() query: PostQuery) { return this.service.listPosts(query); }
  @Get(':id')
  @ApiOperation({ summary: 'Consultar artigo completo para moderação', description: 'Inclui conteúdo e resultado editorial, mesmo quando o artigo está oculto.' })
  @ApiParam({ name: 'id', format: 'uuid' }) @ApiResponse({ status: 200, description: 'Artigo de moderação.' }) @ApiResponse({ status: 400, description: 'UUID inválido.' }) @ApiResponse({ status: 401, description: 'Autenticação necessária.' }) @ApiResponse({ status: 403, description: 'Requer administrador.' }) @ApiResponse({ status: 404, description: 'Artigo não encontrado.' })
  detail(@Param('id', ParseUUIDPipe) id: string) { return this.service.postDetail(id); }
  @Get(':id/history')
  @ApiOperation({ summary: 'Consultar ações editoriais auditadas de um artigo' })
  @ApiParam({ name: 'id', format: 'uuid' }) @ApiResponse({ status: 200, description: 'Histórico paginado.' }) @ApiResponse({ status: 400, description: 'UUID ou paginação inválidos.' }) @ApiResponse({ status: 401, description: 'Autenticação necessária.' }) @ApiResponse({ status: 403, description: 'Requer administrador.' }) @ApiResponse({ status: 404, description: 'Artigo não encontrado.' })
  history(@Param('id', ParseUUIDPipe) id: string, @Query() query: PaginationQueryDto) { return this.service.contentHistory('post', id, query.page, query.limit); }
  @Post(':id/hide')
  @ApiOperation({ summary: 'Ocultar artigo publicado', description: 'Preserva o artigo e seu estado editorial, registrando a justificativa.' })
  @ApiParam({ name: 'id', format: 'uuid' }) @ApiResponse({ status: 201, description: 'Artigo ocultado.' }) @ApiResponse({ status: 400, description: 'Dados inválidos.' }) @ApiResponse({ status: 401, description: 'Autenticação necessária.' }) @ApiResponse({ status: 403, description: 'Requer administrador.' }) @ApiResponse({ status: 404, description: 'Artigo não encontrado.' }) @ApiResponse({ status: 409, description: 'Transição inválida.' })
  hide(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser, @Body() dto: ReasonDto) { return this.service.moderatePost(id, req.user.userId, true, dto.reason); }
  @Post(':id/restore')
  @ApiOperation({ summary: 'Restaurar artigo ocultado pela administração', description: 'Requer autor ativo e preserva o estado de publicação anterior.' })
  @ApiParam({ name: 'id', format: 'uuid' }) @ApiResponse({ status: 201, description: 'Artigo restaurado.' }) @ApiResponse({ status: 400, description: 'Dados inválidos.' }) @ApiResponse({ status: 401, description: 'Autenticação necessária.' }) @ApiResponse({ status: 403, description: 'Requer administrador.' }) @ApiResponse({ status: 404, description: 'Artigo não encontrado.' }) @ApiResponse({ status: 409, description: 'Transição inválida ou autor indisponível.' })
  restore(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser, @Body() dto: ReasonDto) { return this.service.moderatePost(id, req.user.userId, false, dto.reason); }
}
