import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiProperty, ApiPropertyOptional, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ApiPublicRoute } from '../../docs/decorators/public.decorator.js';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guard/roles.guard.js';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface.js';
import { UserRole } from '../users/enums/user.enum.js';
import { CreateSeriesDto, FindSeriesQueryDto, SeriesItemsDto, UpdateSeriesDto } from './dto/series.dto.js';
import { PostSeriesService } from './post-series.service.js';

class SeriesResponse {
  @ApiProperty({ nullable: true, example: '/uploads/post-covers/550e8400-e29b-41d4-a716-446655440000.webp' }) coverImage: string | null;
  @ApiProperty({ enum: ['NONE', 'HUMAN_OR_PHOTO', 'AI_GENERATED', 'HYBRID'] }) aiCoverDeclaration: string;
  @ApiPropertyOptional({ description: 'Total de capítulos ativos; somente consulta privada.' }) chapterCount?: number;
  @ApiPropertyOptional({ description: 'Total de capítulos publicados visíveis.' }) publishedCount?: number;
  @ApiPropertyOptional({ description: 'Classificação máxima dos capítulos públicos.' }) contentRating?: string;
  @ApiPropertyOptional({ description: 'Quantidade de capítulos públicos com uso declarado de IA no texto.' }) aiTextCount?: number;
  @ApiPropertyOptional({ example: { id: '550e8400-e29b-41d4-a716-446655440000', name: 'Autor' } }) author?: object;
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) authorId: string;
  @ApiProperty({ example: 'Introducao ao NestJS' }) title: string;
  @ApiProperty({ example: 'Uma serie sobre arquitetura.' }) description: string;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt: Date;
}
class SeriesPost {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'meu-artigo' }) slug: string;
  @ApiProperty({ example: 'Meu artigo' }) title: string;
  @ApiProperty({ example: 1 }) position: number;
}
class SeriesDetail extends SeriesResponse {
  @ApiProperty({ type: () => [SeriesPost] }) posts: SeriesPost[];
}
class SeriesItemsResponse {
  @ApiProperty({ type: [String], format: 'uuid', example: ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'] }) postIds: string[];
}
@ApiTags('Séries de artigos')
@Controller('series')
export class PostSeriesController {
  constructor(private readonly service: PostSeriesService) {}

  @Get() @ApiPublicRoute()
  @ApiOperation({ summary: 'Descobrir séries públicas', description: 'Paginação page/limit, busca search e filtro authorId. Apenas séries de autores ativos com capítulos públicos não ocultos; ordem pela publicação mais recente de capítulo e ID. Contagens, classificação máxima e quantidade de textos com IA consideram somente capítulos visíveis.' })
  @ApiResponse({ status: 200, description: 'Séries públicas e metadados de paginação.', schema: { example: { data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false } } } })
  @ApiResponse({ status: 400, description: 'Filtros inválidos.' })
  list(@Query() query: FindSeriesQueryDto) { return this.service.publicList(query); }

  @Post(':id/cover-image') @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.AUTHOR, UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiBearerAuth('JWT-auth') @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Enviar capa da série', description: 'Somente o titular. Reutiliza processamento e armazenamento de capas: JPEG/PNG/WebP de até 5 MiB. Substitui a imagem anterior; não altera capas de capítulos.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 201, description: 'Capa salva.', schema: { example: { coverImage: '/uploads/post-covers/550e8400-e29b-41d4-a716-446655440000.webp' } } })
  @ApiResponse({ status: 400, description: 'Imagem inválida.' }) @ApiResponse({ status: 401, description: 'Autenticação necessária.' }) @ApiResponse({ status: 403, description: 'Exige titular.' }) @ApiResponse({ status: 404, description: 'Série inexistente.' }) @ApiResponse({ status: 413, description: 'Limite de 5 MiB.' })
  cover(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: { buffer: Buffer } | undefined, @Req() req: RequestWithUser) {
    if (!file) throw new BadRequestException('Envie uma imagem.');
    return this.service.changeCover(id, req.user, file.buffer);
  }

  @Delete(':id/cover-image') @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.AUTHOR, UserRole.ADMIN) @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Remover capa da série', description: 'Somente titular; remove arquivo próprio e redefine declaração da capa para NONE. Capítulos preservados.' })
  @ApiParam({ name: 'id', format: 'uuid' }) @ApiResponse({ status: 200, description: 'Capa removida.', schema: { example: { coverImage: null } } })
  @ApiResponse({ status: 401, description: 'Autenticação necessária.' }) @ApiResponse({ status: 403, description: 'Exige titular.' }) @ApiResponse({ status: 404, description: 'Série inexistente.' })
  removeCover(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) { return this.service.changeCover(id, req.user); }

  @Get('me') @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.AUTHOR, UserRole.ADMIN) @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Listar minhas series', description: 'Retorna ate 100 series mais recentes do usuario autenticado, inclusive vazias.' })
  @ApiResponse({ status: 200, type: SeriesResponse, isArray: true, description: 'Series do usuario.' })
  @ApiResponse({ status: 401, description: 'Autenticacao necessaria.' }) @ApiResponse({ status: 403, description: 'Exige autor ou administrador.' })
  mine(@Req() req: RequestWithUser) { return this.service.mine(req.user); }

  @Get(':id/manage') @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.AUTHOR, UserRole.ADMIN) @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Consultar serie para edicao', description: 'Inclui artigos publicados e rascunhos do autor; disponível apenas ao titular da série.' })
  @ApiParam({ name: 'id', format: 'uuid' }) @ApiResponse({ status: 200, type: SeriesDetail, description: 'Serie e artigos ordenados.' })
  @ApiResponse({ status: 401, description: 'Autenticacao necessaria.' }) @ApiResponse({ status: 403, description: 'Sem permissao.' }) @ApiResponse({ status: 404, description: 'Serie nao encontrada.' })
  mineDetail(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) { return this.service.mineDetail(id, req.user); }

  @Get(':id') @ApiPublicRoute()
  @ApiOperation({ summary: 'Consultar serie publica', description: 'Retorna apenas artigos publicados e ativos, na ordem da serie. Series sem artigos publicos ou de autores inativos nao sao exibidas.' })
  @ApiParam({ name: 'id', format: 'uuid' }) @ApiResponse({ status: 200, type: SeriesDetail, description: 'Serie e artigos publicos.' }) @ApiResponse({ status: 404, description: 'Serie indisponivel.' })
  detail(@Param('id', ParseUUIDPipe) id: string) { return this.service.detail(id); }

  @Post() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.AUTHOR, UserRole.ADMIN) @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Criar serie', description: 'Cria uma serie vazia para o autor autenticado.' })
  @ApiResponse({ status: 201, type: SeriesResponse, description: 'Serie criada.' }) @ApiResponse({ status: 400, description: 'Dados invalidos.' }) @ApiResponse({ status: 401, description: 'Autenticacao necessaria.' }) @ApiResponse({ status: 403, description: 'Exige autor ou administrador.' })
  create(@Body() dto: CreateSeriesDto, @Req() req: RequestWithUser) { return this.service.create(dto, req.user); }

  @Patch(':id') @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.AUTHOR, UserRole.ADMIN) @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Editar serie', description: 'Apenas o titular altera título, descrição e declaração da capa; expectedUpdatedAt opcional protege contra alterações concorrentes.' })
  @ApiParam({ name: 'id', format: 'uuid' }) @ApiResponse({ status: 200, type: SeriesResponse, description: 'Serie atualizada.' }) @ApiResponse({ status: 400, description: 'Dados invalidos.' }) @ApiResponse({ status: 401, description: 'Autenticacao necessaria.' }) @ApiResponse({ status: 403, description: 'Sem permissao.' }) @ApiResponse({ status: 404, description: 'Serie nao encontrada.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSeriesDto, @Req() req: RequestWithUser) { return this.service.update(id, dto, req.user); }

  @Put(':id/items') @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.AUTHOR, UserRole.ADMIN) @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Definir artigos e ordem da serie', description: 'Substitui atomicamente a lista completa de ate 100 artigos ativos do autor da serie. Um artigo pertence a no maximo uma serie. Lista vazia remove todos os itens.' })
  @ApiParam({ name: 'id', format: 'uuid' }) @ApiResponse({ status: 200, type: SeriesItemsResponse, description: 'Ordem atualizada.' }) @ApiResponse({ status: 400, description: 'Lista invalida ou artigo de outro autor.' }) @ApiResponse({ status: 401, description: 'Autenticacao necessaria.' }) @ApiResponse({ status: 403, description: 'Sem permissao.' }) @ApiResponse({ status: 404, description: 'Serie nao encontrada.' }) @ApiResponse({ status: 409, description: 'Artigo ja pertence a outra serie.' })
  setItems(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SeriesItemsDto, @Req() req: RequestWithUser) { return this.service.setItems(id, dto.postIds, req.user, dto.expectedUpdatedAt); }

  @Delete(':id') @HttpCode(204) @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.AUTHOR, UserRole.ADMIN) @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Excluir serie', description: 'Remove a serie e sua ordem; os artigos sao preservados.' })
  @ApiParam({ name: 'id', format: 'uuid' }) @ApiResponse({ status: 204, description: 'Serie removida.' }) @ApiResponse({ status: 401, description: 'Autenticacao necessaria.' }) @ApiResponse({ status: 403, description: 'Sem permissao.' }) @ApiResponse({ status: 404, description: 'Serie nao encontrada.' })
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) { return this.service.remove(id, req.user); }
}

@ApiTags('Séries de artigos')
@Controller('posts/:postId/series')
export class PostSeriesNavigationController {
  constructor(private readonly service: PostSeriesService) {}
  @Get() @ApiPublicRoute()
  @ApiOperation({ summary: 'Consultar a serie de um artigo publico', description: 'Retorna a serie e seus artigos publicados em ordem, permitindo navegar entre capitulos. Nao revela rascunhos.' })
  @ApiParam({ name: 'postId', format: 'uuid', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @ApiResponse({ status: 200, description: 'Serie publica.', type: SeriesDetail })
  @ApiResponse({ status: 400, description: 'UUID invalido.' })
  @ApiResponse({ status: 404, description: 'Artigo ou serie indisponivel.' })
  detail(@Param('postId', ParseUUIDPipe) postId: string) { return this.service.forPost(postId); }
}
