import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { PaginationMetaResponseDto } from '../../docs/models/pagination-meta-response.dto.js';
import { PostAuthorResponseDto } from '../../docs/models/post-response.dto.js';
import { AuthorFollowsService } from './author-follows.service.js';

class FollowStatusDto { @ApiProperty({ example: true }) following: boolean; }
class FeedItemDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'meu-artigo' }) slug: string;
  @ApiProperty({ example: 'Meu artigo' }) title: string;
  @ApiProperty({ example: 'Resumo' }) excerpt: string;
  @ApiProperty({ type: String, nullable: true, example: null }) coverImage: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) publishedAt: Date | null;
  @ApiProperty({ type: () => PostAuthorResponseDto }) author: PostAuthorResponseDto;
}
class PersonalFeedDto {
  @ApiProperty({ type: () => [FeedItemDto] }) data: FeedItemDto[];
  @ApiProperty({ type: () => PaginationMetaResponseDto }) meta: PaginationMetaResponseDto;
}

@ApiTags('Autores e feed')
@ApiBearerAuth('JWT-auth')
@ApiResponse({ status: 401, description: 'Token ausente ou inválido.' })
@ApiResponse({ status: 429, description: 'Limite de requisições por IP excedido.' })
@UseGuards(JwtAuthGuard)
@Controller()
export class AuthorFollowsController {
  constructor(private readonly service: AuthorFollowsService) {}
  @Get('feed')
  @ApiOperation({ summary: 'Feed personalizado', description: 'Artigos públicos dos autores ativos seguidos, ordenados por publicação decrescente e ID; lista vazia quando não há resultados.' })
  @ApiResponse({ status: 200, description: 'Feed paginado.', type: PersonalFeedDto })
  @ApiResponse({ status: 400, description: 'Paginação inválida.' })
  feed(@Req() req: RequestWithUser, @Query() query: PaginationQueryDto) { return this.service.feed(req.user.userId, query); }

  @Get('authors/:id/follow')
  @ApiOperation({ summary: 'Consultar se segue o autor' })
  @ApiParam({ name: 'id', format: 'uuid', example: 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22' })
  @ApiResponse({ status: 200, description: 'Estado do relacionamento.', type: FollowStatusDto })
  @ApiResponse({ status: 400, description: 'UUID inválido.' })
  status(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) { return this.service.status(id, req.user.userId); }

  @Put('authors/:id/follow')
  @HttpCode(204)
  @ApiOperation({ summary: 'Seguir autor', description: 'Operação idempotente para AUTHOR ou ADMIN ativo. Não é possível seguir a si mesmo.' })
  @ApiParam({ name: 'id', format: 'uuid', example: 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22' })
  @ApiResponse({ status: 204, description: 'Autor seguido.' })
  @ApiResponse({ status: 400, description: 'UUID inválido ou tentativa de seguir a si mesmo.' })
  @ApiResponse({ status: 404, description: 'Autor não encontrado.' })
  follow(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) { return this.service.follow(id, req.user.userId); }

  @Delete('authors/:id/follow')
  @HttpCode(204)
  @ApiOperation({ summary: 'Deixar de seguir autor', description: 'Operação idempotente, inclusive para autor indisponível.' })
  @ApiParam({ name: 'id', format: 'uuid', example: 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22' })
  @ApiResponse({ status: 204, description: 'Relacionamento removido.' })
  @ApiResponse({ status: 400, description: 'UUID inválido.' })
  unfollow(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) { return this.service.unfollow(id, req.user.userId); }
}
