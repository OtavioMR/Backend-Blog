import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiProperty, ApiPropertyOptional, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guard/roles.guard.js';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface.js';
import { UserRole } from '../users/enums/user.enum.js';
import { PostReviewService } from './post-review.service.js';
class DecisionDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'], example: 'APPROVED' }) @IsIn(['APPROVED', 'REJECTED']) decision: 'APPROVED' | 'REJECTED';
  @ApiPropertyOptional({ description: 'Obrigatório ao rejeitar.', minLength: 5, maxLength: 1000, example: 'Faltam fontes para as afirmações.' })
  @ValidateIf((dto: DecisionDto) => dto.decision === 'REJECTED' || dto.reason !== undefined) @IsString() @MinLength(5) @MaxLength(1000) reason?: string;
}
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
  @Get(':id')
  @ApiOperation({ summary: 'Consultar resultado da revisão', description: 'O autor e administradores podem consultar o estado e a justificativa de rejeição.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Resultado da revisão.', schema: { example: { status: 'REJECTED', reason: 'Faltam fontes para as afirmações.' } } })
  @ApiResponse({ status: 400, description: 'Identificador inválido.' })
  @ApiResponse({ status: 401, description: 'Autenticação necessária.' })
  @ApiResponse({ status: 403, description: 'Acesso restrito ao autor e administradores.' })
  @ApiResponse({ status: 404, description: 'Artigo não encontrado.' })
  result(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) { return this.service.result(id, req.user); }
  @Post(':id/decision')
  @UseGuards(RolesGuard) @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Aprovar ou rejeitar primeiro artigo', description: 'A aprovação publica o artigo e libera a publicação posterior pelo autor. A rejeição exige justificativa; o próprio autor não pode decidir.' })
  @ApiParam({ name: 'id', format: 'uuid', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @ApiResponse({ status: 201, description: 'Decisão registrada.', schema: { example: { status: 'APPROVED' } } })
  @ApiResponse({ status: 400, description: 'Dados inválidos.' })
  @ApiResponse({ status: 401, description: 'Autenticação necessária.' })
  @ApiResponse({ status: 403, description: 'Apenas administradores.' })
  @ApiResponse({ status: 404, description: 'Artigo não encontrado.' })
  @ApiResponse({ status: 409, description: 'Artigo não está pendente ou autor indisponível.' })
  decide(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionDto, @Req() req: RequestWithUser) { return this.service.decide(id, dto.decision, req.user.userId, dto.reason); }
}
