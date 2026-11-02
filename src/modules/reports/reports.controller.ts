import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guard/roles.guard.js';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface.js';
import { UserRole } from '../users/enums/user.enum.js';
import { CreateReportDto, ListReportsDto, ReviewReportDto } from './reports.dto.js';
import { ReportsService } from './reports.service.js';

@ApiTags('Denúncias')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Denunciar artigo ou comentário público' })
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

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Concluir análise de denúncia', description: 'Apenas administradores; a decisão não altera o conteúdo automaticamente.' })
  @ApiParam({ name: 'id', format: 'uuid', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @ApiResponse({ status: 200, description: 'Denúncia analisada.', schema: { example: { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', status: 'RESOLVED', moderationNote: 'Conteúdo analisado' } } })
  @ApiResponse({ status: 400, description: 'Dados ou identificador inválidos.' })
  @ApiResponse({ status: 401, description: 'Autenticação necessária.' })
  @ApiResponse({ status: 403, description: 'Apenas administradores.' })
  @ApiResponse({ status: 404, description: 'Denúncia não encontrada.' })
  @ApiResponse({ status: 409, description: 'Denúncia já analisada.' })
  review(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser, @Body() dto: ReviewReportDto) { return this.service.review(id, req.user.userId, dto); }
}
