import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guard/roles.guard.js';
import { UserRole } from '../users/enums/user.enum.js';
import { AnalyticsService } from './analytics.service.js';
class AnalyticsQuery {
  @ApiPropertyOptional({ format: 'date-time', description: 'Início do intervalo de criação, inclusivo.' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ format: 'date-time', description: 'Fim do intervalo de criação, inclusivo.' }) @IsOptional() @IsDateString() to?: string;
}
@ApiTags('Indicadores')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/analytics')
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}
  @Get('overview')
  @ApiOperation({ summary: 'Consultar indicadores da plataforma', description: 'Apenas administradores. Contagens atuais de usuários não excluídos, artigos não excluídos, comentários e denúncias.' })
  @ApiResponse({ status: 200, description: 'Indicadores agregados.', schema: { example: { users: { total: 100, active: 95, verified: 90 }, posts: { total: 50, published: 40, drafts: 10 }, comments: { total: 30, active: 29 }, reports: { total: 3, pending: 1 }, generatedAt: '2026-01-01T12:00:00.000Z' } } })
  @ApiResponse({ status: 401, description: 'Autenticação necessária.' })
  @ApiResponse({ status: 403, description: 'Apenas administradores.' })
  overview(@Query() query: AnalyticsQuery) { return this.service.overview(query.from, query.to); }
  @Get('newsletter')
  @ApiOperation({ summary: 'Consultar indicadores operacionais da newsletter', description: 'Contagens agregadas de assinaturas e envios; não retorna endereços de e-mail.' })
  @ApiResponse({ status: 200, description: 'Indicadores agregados.', schema: { example: { subscribers: { total: 20, active: 15, pending: 3, expired: 2 }, deliveries: { pending: 2, retrying: 1, sent: 30 }, generatedAt: '2026-01-01T12:00:00.000Z' } } })
  @ApiResponse({ status: 401, description: 'Autenticação necessária.' }) @ApiResponse({ status: 403, description: 'Apenas administradores.' })
  newsletter() { return this.service.newsletter(); }
  @Get('activity')
  @ApiOperation({ summary: 'Consultar atividade administrativa e evolução diária', description: 'Série de cadastros, artigos, denúncias e inscrições de newsletter por dia em intervalo de até 366 dias, além de dez publicações e ações recentes.' })
  @ApiResponse({ status: 200, description: 'Série e atividades recentes.' }) @ApiResponse({ status: 400, description: 'Intervalo inválido ou maior que 366 dias.' }) @ApiResponse({ status: 401, description: 'Autenticação necessária.' }) @ApiResponse({ status: 403, description: 'Apenas administradores.' })
  activity(@Query() query: AnalyticsQuery) { return this.service.activity(query.from, query.to); }
}
