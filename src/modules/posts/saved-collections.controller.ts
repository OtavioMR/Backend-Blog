import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { PaginationMetaResponseDto } from '../../docs/models/pagination-meta-response.dto.js';
import { SavedCollectionsService } from './saved-collections.service.js';

class CollectionNameDto {
  @ApiProperty({ example: 'Para ler depois', maxLength: 100 })
  @IsString() @MaxLength(100) @Matches(/\S/) name: string;
}
class CollectionDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Para ler depois' }) name: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
}
class CollectionPostDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'meu-artigo' }) slug: string;
  @ApiProperty({ example: 'Meu artigo' }) title: string;
  @ApiProperty({ example: 'Resumo' }) excerpt: string;
}
class CollectionPostsDto {
  @ApiProperty({ type: () => [CollectionPostDto] }) data: CollectionPostDto[];
  @ApiProperty({ type: () => PaginationMetaResponseDto }) meta: PaginationMetaResponseDto;
}

@ApiTags('Coleções de salvos')
@ApiBearerAuth('JWT-auth')
@ApiResponse({ status: 400, description: 'Parâmetros ou corpo inválidos.' })
@ApiResponse({ status: 401, description: 'Token ausente ou inválido.' })
@ApiResponse({ status: 429, description: 'Limite de requisições por IP excedido.' })
@UseGuards(JwtAuthGuard)
@Controller('collections')
export class SavedCollectionsController {
  constructor(private readonly service: SavedCollectionsService) {}
  @Post()
  @ApiOperation({ summary: 'Criar coleção privada', description: 'Nomes são únicos por usuário após remover espaços nas extremidades.' })
  @ApiResponse({ status: 201, description: 'Coleção criada.', type: CollectionDto })
  @ApiResponse({ status: 409, description: 'Nome já utilizado.' })
  create(@Req() req: RequestWithUser, @Body() dto: CollectionNameDto) { return this.service.create(req.user.userId, dto.name); }

  @Get()
  @ApiOperation({ summary: 'Listar minhas coleções' })
  @ApiResponse({ status: 200, description: 'Coleções do usuário.', type: CollectionDto, isArray: true })
  list(@Req() req: RequestWithUser) { return this.service.list(req.user.userId); }

  @Patch(':id')
  @ApiOperation({ summary: 'Renomear minha coleção' })
  @ApiParam({ name: 'id', format: 'uuid', example: 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22' })
  @ApiResponse({ status: 200, description: 'Coleção atualizada.', type: CollectionDto })
  @ApiResponse({ status: 404, description: 'Coleção não encontrada.' })
  @ApiResponse({ status: 409, description: 'Nome já utilizado.' })
  rename(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser, @Body() dto: CollectionNameDto) { return this.service.rename(id, req.user.userId, dto.name); }

  @Delete(':id') @HttpCode(204)
  @ApiOperation({ summary: 'Excluir minha coleção', description: 'Os artigos permanecem salvos.' })
  @ApiParam({ name: 'id', format: 'uuid', example: 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22' })
  @ApiResponse({ status: 204, description: 'Coleção removida.' })
  @ApiResponse({ status: 404, description: 'Coleção não encontrada.' })
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) { return this.service.remove(id, req.user.userId); }

  @Get(':id/posts')
  @ApiOperation({ summary: 'Listar artigos da coleção', description: 'Somente artigos salvos, publicados e ativos. Ao remover um artigo dos salvos, ele fica oculto; ao salvá-lo novamente, retorna às coleções anteriores.' })
  @ApiParam({ name: 'id', format: 'uuid', example: 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22' })
  @ApiResponse({ status: 200, description: 'Artigos paginados.', type: CollectionPostsDto })
  @ApiResponse({ status: 404, description: 'Coleção não encontrada.' })
  posts(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser, @Query() query: PaginationQueryDto) { return this.service.listPosts(id, req.user.userId, query); }

  @Put(':id/posts/:postId') @HttpCode(204)
  @ApiOperation({ summary: 'Adicionar artigo salvo à coleção', description: 'Operação idempotente; o artigo deve estar salvo e público.' })
  @ApiParam({ name: 'id', format: 'uuid', example: 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22' }) @ApiParam({ name: 'postId', format: 'uuid', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @ApiResponse({ status: 204, description: 'Artigo incluído.' })
  @ApiResponse({ status: 404, description: 'Coleção ou artigo salvo não encontrado.' })
  add(@Param('id', ParseUUIDPipe) id: string, @Param('postId', ParseUUIDPipe) postId: string, @Req() req: RequestWithUser) { return this.service.add(id, postId, req.user.userId); }

  @Delete(':id/posts/:postId') @HttpCode(204)
  @ApiOperation({ summary: 'Remover artigo da coleção', description: 'Operação idempotente; o artigo permanece salvo.' })
  @ApiParam({ name: 'id', format: 'uuid', example: 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22' }) @ApiParam({ name: 'postId', format: 'uuid', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @ApiResponse({ status: 204, description: 'Artigo removido.' })
  @ApiResponse({ status: 404, description: 'Coleção não encontrada.' })
  removePost(@Param('id', ParseUUIDPipe) id: string, @Param('postId', ParseUUIDPipe) postId: string, @Req() req: RequestWithUser) { return this.service.removePost(id, postId, req.user.userId); }
}
