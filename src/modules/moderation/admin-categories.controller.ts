import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guard/roles.guard.js';
import { UserRole } from '../users/enums/user.enum.js';
import { ModerationService } from './moderation.service.js';

@ApiTags('Administração de categorias') @ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN)
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(private readonly service: ModerationService) {}
  @Get()
  @ApiOperation({ summary: 'Listar categorias com quantidade de artigos', description: 'Inclui categorias desativadas; posts e associações são preservados quando uma categoria é desativada.' })
  @ApiResponse({ status: 200, description: 'Categorias paginadas.', schema: { example: { data: [{ id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', name: 'Tecnologia', slug: 'tecnologia', description: 'Artigos sobre tecnologia', isActive: true, deletedAt: null, postCount: 3 }], meta: { page: 1, limit: 10, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false } } } }) @ApiResponse({ status: 400, description: 'Paginação inválida.' }) @ApiResponse({ status: 401, description: 'Autenticação necessária.' }) @ApiResponse({ status: 403, description: 'Requer administrador.' })
  list(@Query() query: PaginationQueryDto) { return this.service.listCategories(query.page, query.limit); }
}
