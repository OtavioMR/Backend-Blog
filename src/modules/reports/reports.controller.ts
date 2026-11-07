import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guard/roles.guard.js';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface.js';
import { UserRole } from '../users/enums/user.enum.js';
import { AssignReportDto, CreateReportDto, ListReportsDto, ResolveReportDto, ReviewReportDto } from './reports.dto.js';
import { ReportsService } from './reports.service.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

@ApiTags('Denúncias')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Denunciar artigo, comentário público ou perfil ativo', description: 'Cada pessoa pode manter apenas uma denúncia aberta por recurso. O próprio perfil não pode ser denunciado.' })
  @ApiResponse({ status: 201, description: 'Denúncia criada.', schema: { example: { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', status: 'PENDING', reason: 'Conteúdo ofensivo' } } })
  @ApiResponse({ status: 400, description: 'Dados inválidos.' })
  @ApiResponse({ status: 401, description: 'Autenticação necessária.' })
  @ApiResponse({ status: 404, description: 'Conteúdo indisponível.' })
  @ApiResponse({ status: 409, description: 'Denúncia pendente já existente.' })
  create(@Req() req: RequestWithUser, @Body() dto: CreateReportDto) { return this.service.create(req.user.userId, dto); }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Listar denúncias para moderação', description: 'Apenas administradores; resultados paginados, mais recentes primeiro.' })
  @ApiResponse({ status: 200, description: 'Lista paginada.', schema: { example: { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0, hasNextPage: false, hasPreviousPage: false } } } })
  @ApiResponse({ status: 400, description: 'Filtros inválidos.' })
  @ApiResponse({ status: 401, description: 'Autenticação necessária.' })
  @ApiResponse({ status: 403, description: 'Apenas administradores.' })
  list(@Query() query: ListReportsDto) { return this.service.list(query); }

  @Get(':id')
  @UseGuards(RolesGuard) @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Consultar denúncia', description: 'Apenas administradores. A denúncia permanece disponível quando o conteúdo deixa de ser público.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Detalhes da denúncia.' })
  @ApiResponse({ status: 401, description: 'Autenticação necessária.' })
  @ApiResponse({ status: 403, description: 'Apenas administradores.' })
  @ApiResponse({ status: 404, description: 'Denúncia não encontrada.' })
  detail(@Param('id', ParseUUIDPipe) id: string) { return this.service.detail(id); }

  @Get(':id/history')
  @UseGuards(RolesGuard) @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Consultar histórico de ações da denúncia', description: 'Atribuições e decisões auditadas, paginadas.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Histórico paginado.' }) @ApiResponse({ status: 400, description: 'Identificador ou paginação inválidos.' }) @ApiResponse({ status: 401, description: 'Autenticação necessária.' }) @ApiResponse({ status: 403, description: 'Apenas administradores.' }) @ApiResponse({ status: 404, description: 'Denúncia não encontrada.' })
  history(@Param('id', ParseUUIDPipe) id: string, @Query() query: PaginationQueryDto) { return this.service.history(id, query.page, query.limit); }

  @Patch(':id/assign')
  @UseGuards(RolesGuard) @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Atribuir denúncia a moderador', description: 'Marca denúncia aberta como IN_REVIEW e audita a atribuição.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Denúncia atribuída.', schema: { example: { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', status: 'IN_REVIEW', moderatorId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' } } })
  @ApiResponse({ status: 400, description: 'Moderador inválido.' })
  @ApiResponse({ status: 401, description: 'Autenticação necessária.' })
  @ApiResponse({ status: 403, description: 'Apenas administradores.' })
  @ApiResponse({ status: 404, description: 'Denúncia não encontrada.' })
  @ApiResponse({ status: 409, description: 'Denúncia já concluída.' })
  assign(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser, @Body() dto: AssignReportDto) { return this.service.assign(id, req.user.userId, dto.moderatorId); }
  @Post(':id/resolve')
  @UseGuards(RolesGuard) @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Concluir denúncia com ação vinculada', description: 'Registra decisão e, opcionalmente, oculta o artigo ou comentário denunciado na mesma transação. DISMISSED exige ação NONE.' })
  @ApiParam({ name: 'id', format: 'uuid' }) @ApiResponse({ status: 201, description: 'Denúncia concluída e ação aplicada.' }) @ApiResponse({ status: 400, description: 'Decisão, justificativa ou ação incompatível.' }) @ApiResponse({ status: 401, description: 'Autenticação necessária.' }) @ApiResponse({ status: 403, description: 'Apenas administradores.' }) @ApiResponse({ status: 404, description: 'Denúncia não encontrada.' }) @ApiResponse({ status: 409, description: 'Denúncia concluída ou alvo indisponível.' })
  resolve(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser, @Body() dto: ResolveReportDto) { return this.service.resolveWithAction(id, req.user.userId, dto); }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Concluir análise de denúncia', description: 'Apenas administradores; exige justificativa e a decisão não altera o conteúdo automaticamente.' })
  @ApiParam({ name: 'id', format: 'uuid', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @ApiResponse({ status: 200, description: 'Denúncia analisada.', schema: { example: { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', status: 'RESOLVED', moderationNote: 'Conteúdo analisado' } } })
  @ApiResponse({ status: 400, description: 'Dados ou identificador inválidos.' })
  @ApiResponse({ status: 401, description: 'Autenticação necessária.' })
  @ApiResponse({ status: 403, description: 'Apenas administradores.' })
  @ApiResponse({ status: 404, description: 'Denúncia não encontrada.' })
  @ApiResponse({ status: 409, description: 'Denúncia já analisada.' })
  review(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser, @Body() dto: ReviewReportDto) { return this.service.review(id, req.user.userId, dto); }
}
