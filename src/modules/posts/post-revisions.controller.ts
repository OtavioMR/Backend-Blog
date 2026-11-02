import { Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { PaginationMetaResponseDto } from '../../docs/models/pagination-meta-response.dto.js';
import { PostResponseDto } from '../../docs/models/post-response.dto.js';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface.js';
import { PostRevisionsService } from './post-revisions.service.js';

class RevisionSummaryDto {
  @ApiProperty({ format: 'uuid', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' }) id: string;
  @ApiProperty({ example: 'Titulo do artigo' }) title: string;
  @ApiProperty({ format: 'date-time', example: '2026-01-01T12:00:00.000Z' }) createdAt: Date;
}
class RevisionDto extends RevisionSummaryDto {
  @ApiProperty({ example: 'Conteudo anterior do artigo.' }) content: string;
}
class PaginatedRevisionsDto {
  @ApiProperty({ type: () => [RevisionSummaryDto] }) data: RevisionSummaryDto[];
  @ApiProperty({ type: () => PaginationMetaResponseDto }) meta: PaginationMetaResponseDto;
}

@ApiTags('Histórico de artigos')
@ApiBearerAuth('JWT-auth')
@ApiParam({ name: 'postId', format: 'uuid', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
@ApiResponse({ status: 400, description: 'UUID ou paginacao invalida.' })
@ApiResponse({ status: 401, description: 'Autenticacao necessaria.' })
@ApiResponse({ status: 403, description: 'Acesso restrito ao autor ou administrador.' })
@ApiResponse({ status: 404, description: 'Artigo ou revisao nao encontrado.' })
@UseGuards(JwtAuthGuard)
@Controller('posts/:postId/revisions')
export class PostRevisionsController {
  constructor(private readonly service: PostRevisionsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar revisoes de um artigo', description: 'Retorna o historico de titulo e conteudo em ordem decrescente. As revisoes existem desde a migracao; alteracoes anteriores nao podem ser recuperadas. Acesso ao autor ou administrador.' })
  @ApiResponse({ status: 200, description: 'Revisoes paginadas.', type: PaginatedRevisionsDto })
  list(@Param('postId', ParseUUIDPipe) postId: string, @Req() req: RequestWithUser, @Query() query: PaginationQueryDto) {
    return this.service.list(postId, req.user, query);
  }

  @Get(':revisionId')
  @ApiOperation({ summary: 'Consultar uma revisao', description: 'Retorna titulo e conteudo de uma revisao pertencente ao artigo.' })
  @ApiParam({ name: 'revisionId', format: 'uuid', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12' })
  @ApiResponse({ status: 200, description: 'Revisao encontrada.', type: RevisionDto })
  detail(@Param('postId', ParseUUIDPipe) postId: string, @Param('revisionId', ParseUUIDPipe) revisionId: string, @Req() req: RequestWithUser) {
    return this.service.detail(postId, revisionId, req.user);
  }

  @Post(':revisionId/restore')
  @ApiOperation({ summary: 'Restaurar uma revisao', description: 'Restaura titulo e conteudo, mantendo demais propriedades e criando uma nova revisao quando houver alteracao. Nao altera o estado de publicacao.' })
  @ApiParam({ name: 'revisionId', format: 'uuid', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12' })
  @ApiResponse({ status: 201, description: 'Artigo restaurado.', type: PostResponseDto })
  @ApiResponse({ status: 409, description: 'Artigo aguardando revisao.' })
  restore(@Param('postId', ParseUUIDPipe) postId: string, @Param('revisionId', ParseUUIDPipe) revisionId: string, @Req() req: RequestWithUser) {
    return this.service.restore(postId, revisionId, req.user);
  }
}
