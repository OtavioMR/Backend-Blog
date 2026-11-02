import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guard/roles.guard.js';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface.js';
import { UserRole } from '../users/enums/user.enum.js';
import { PostReviewService } from './post-review.service.js';
class DecisionDto { @ApiProperty({ enum: ['APPROVED', 'REJECTED'], example: 'APPROVED' }) @IsIn(['APPROVED', 'REJECTED']) decision: 'APPROVED' | 'REJECTED'; }
@ApiTags('Revisão de artigos')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('post-reviews')
export class PostReviewController {
  constructor(private readonly service: PostReviewService) {}
  @Post(':id/submit')
  @ApiOperation({ summary: 'Enviar rascunho para revisão do primeiro artigo' })
  @ApiParam({ name: 'id', format: 'uuid', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @ApiResponse({ status: 201, description: 'Rascunho enviado.', schema: { example: { status: 'PENDING' } } })
  @ApiResponse({ status: 401, description: 'Autenticação necessária.' })
  @ApiResponse({ status: 403, description: 'Artigo não pertence a autor ativo.' })
  @ApiResponse({ status: 404, description: 'Artigo não encontrado.' })
  @ApiResponse({ status: 409, description: 'Artigo ou autoria não elegível.' })
  submit(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) { return this.service.submit(id, req.user.userId); }
  @Get()
  @UseGuards(RolesGuard) @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Listar artigos pendentes de revisão', description: 'Apenas administradores; retorna até 100 artigos mais antigos.' })
  @ApiResponse({ status: 200, description: 'Artigos pendentes.', schema: { example: [] } })
  @ApiResponse({ status: 401, description: 'Autenticação necessária.' })
  @ApiResponse({ status: 403, description: 'Apenas administradores.' })
  list() { return this.service.list(); }
  @Post(':id/decision')
  @UseGuards(RolesGuard) @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Aprovar ou rejeitar primeiro artigo', description: 'A aprovação publica o artigo e libera a publicação posterior pelo autor.' })
  @ApiParam({ name: 'id', format: 'uuid', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @ApiResponse({ status: 201, description: 'Decisão registrada.', schema: { example: { status: 'APPROVED' } } })
  @ApiResponse({ status: 400, description: 'Dados inválidos.' })
  @ApiResponse({ status: 401, description: 'Autenticação necessária.' })
  @ApiResponse({ status: 403, description: 'Apenas administradores.' })
  @ApiResponse({ status: 404, description: 'Artigo não encontrado.' })
  @ApiResponse({ status: 409, description: 'Artigo não está pendente ou autor indisponível.' })
  decide(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionDto, @Req() req: RequestWithUser) { return this.service.decide(id, dto.decision, req.user.userId); }
}
