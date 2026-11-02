import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guard/roles.guard.js';
import { UserRole } from '../users/enums/user.enum.js';
import { AnalyticsService } from './analytics.service.js';
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
  overview() { return this.service.overview(); }
}
