import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guard/roles.guard.js';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface.js';
import { UserRole } from '../users/enums/user.enum.js';
import { ModerationService } from './moderation.service.js';

class TagNameDto { @ApiProperty({ minLength: 1, maxLength: 50, example: 'Tecnologia' }) @IsString() @MinLength(1) @MaxLength(50) name: string; }
class MergeTagDto { @ApiProperty({ format: 'uuid', description: 'Tag que receberá os artigos da tag de origem.' }) @IsUUID() targetId: string; }

@ApiTags('Administração de tags') @ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN)
@Controller('admin/tags')
export class AdminTagsController {
  constructor(private readonly service: ModerationService) {}
  @Get()
  @ApiOperation({ summary: 'Listar tags com quantidade de artigos' })
  @ApiResponse({ status: 200, description: 'Tags paginadas.', schema: { example: { data: [{ id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', name: 'Tecnologia', slug: 'tecnologia', postCount: 3 }], meta: { page: 1, limit: 10, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false } } } }) @ApiResponse({ status: 401, description: 'Autenticação necessária.' }) @ApiResponse({ status: 403, description: 'Requer administrador.' })
  list(@Query() query: PaginationQueryDto) { return this.service.listTags(query.page, query.limit); }
  @Post()
  @ApiOperation({ summary: 'Criar tag' }) @ApiResponse({ status: 201, description: 'Tag criada.', schema: { example: { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', name: 'Tecnologia', slug: 'tecnologia' } } }) @ApiResponse({ status: 400, description: 'Nome inválido.' }) @ApiResponse({ status: 401, description: 'Autenticação necessária.' }) @ApiResponse({ status: 403, description: 'Requer administrador.' }) @ApiResponse({ status: 409, description: 'Slug já existe.' })
  create(@Body() dto: TagNameDto, @Req() req: RequestWithUser) { return this.service.saveTag(null, dto.name, req.user.userId); }
  @Patch(':id')
  @ApiOperation({ summary: 'Renomear tag' }) @ApiParam({ name: 'id', format: 'uuid' }) @ApiResponse({ status: 200, description: 'Tag atualizada.' }) @ApiResponse({ status: 400, description: 'Nome inválido.' }) @ApiResponse({ status: 401, description: 'Autenticação necessária.' }) @ApiResponse({ status: 403, description: 'Requer administrador.' }) @ApiResponse({ status: 404, description: 'Tag não encontrada.' }) @ApiResponse({ status: 409, description: 'Slug já existe.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TagNameDto, @Req() req: RequestWithUser) { return this.service.saveTag(id, dto.name, req.user.userId); }
  @Delete(':id')
  @ApiOperation({ summary: 'Excluir tag sem artigos associados' }) @ApiParam({ name: 'id', format: 'uuid' }) @ApiResponse({ status: 200, description: 'Tag excluída.', schema: { example: { deleted: true } } }) @ApiResponse({ status: 401, description: 'Autenticação necessária.' }) @ApiResponse({ status: 403, description: 'Requer administrador.' }) @ApiResponse({ status: 404, description: 'Tag não encontrada.' }) @ApiResponse({ status: 409, description: 'Tag em uso.' })
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) { return this.service.removeTag(id, req.user.userId); }
  @Post(':id/merge')
  @ApiOperation({ summary: 'Mesclar tag em outra', description: 'Transfere associações sem duplicar artigos e remove a tag de origem.' }) @ApiParam({ name: 'id', format: 'uuid' }) @ApiResponse({ status: 201, description: 'Tags mescladas.', schema: { example: { merged: true, targetId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' } } }) @ApiResponse({ status: 400, description: 'Origem e destino devem ser diferentes.' }) @ApiResponse({ status: 401, description: 'Autenticação necessária.' }) @ApiResponse({ status: 403, description: 'Requer administrador.' }) @ApiResponse({ status: 404, description: 'Tag não encontrada.' })
  merge(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MergeTagDto, @Req() req: RequestWithUser) { return this.service.mergeTag(id, dto.targetId, req.user.userId); }
}
