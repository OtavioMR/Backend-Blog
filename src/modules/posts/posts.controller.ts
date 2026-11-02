import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import {
  Body,
  BadRequestException,
  UploadedFile,
  UseInterceptors,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post as HttpPost,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { PostsService } from './posts.service.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';
import { FindPostsQueryDto } from './dto/find-posts-query.dto.js';
import { PostResponseDto } from '../../docs/models/post-response.dto.js';

import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import { OptionalJwtAuthGuard } from '../auth/guard/optional-jwt-auth.guard.js';
import { RolesGuard } from '../auth/guard/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../users/enums/user.enum.js';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface.js';
import {
  ApiPublicRoute,
  ApiPostsTag,
  ApiFindAllPostsDoc,
  ApiFindMinePostsDoc,
  ApiFindPostByIdDoc,
  ApiCreatePostDoc,
  ApiUpdatePostDoc,
  ApiRemovePostDoc,
} from '../../docs/index.js';

@ApiPostsTag()
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @ApiFindAllPostsDoc()
  @Get()
  findAll(@Query() findPostsQuery: FindPostsQueryDto) {
    return this.postsService.findAll(findPostsQuery);
  }

  @ApiFindMinePostsDoc()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  findMine(@Query() query: PaginationQueryDto, @Req() request: RequestWithUser) {
    return this.postsService.findMine(request.user.userId, query);
  }

  @Get(':id/related')
  @ApiPublicRoute()
  @ApiOperation({ summary: 'Artigos relacionados', description: 'Informe o UUID, slug atual ou slug antigo de um artigo publicado e ativo. Retorna até cinco artigos completos, também publicados e ativos, que compartilham tags ou categorias ativas. A ordem prioriza a quantidade de correspondências; em empate, a publicação mais recente e depois o ID. O próprio artigo é excluído. Sem correspondências, retorna []. Não requer autenticação.' })
  @ApiParam({ name: 'id', description: 'UUID ou slug do artigo público.', example: 'meu-artigo' })
  @ApiResponse({ status: 200, description: 'Artigos relacionados completos; lista vazia quando não há correspondência.', type: PostResponseDto, isArray: true })
  @ApiResponse({ status: 404, description: 'Artigo público não encontrado.' })
  findRelated(@Param('id') id: string) { return this.postsService.findRelated(id); }

  @ApiFindPostByIdDoc()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  findById(@Param('id') id: string, @Req() request: RequestWithUser) {
    return this.postsService.findById(id, request.user);
  }

  @ApiCreatePostDoc()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiResponse({ status: 429, description: 'Limite de 10 criações de artigos por minuto por IP excedido; tags podem ser criadas nesta operação.' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.AUTHOR, UserRole.ADMIN)
  @HttpPost()
  create(
    @Body() createPostDto: CreatePostDto,
    @Req() request: RequestWithUser,
  ) {
    return this.postsService.create(createPostDto, request.user.userId);
  }

  @ApiUpdatePostDoc()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiResponse({ status: 429, description: 'Limite de 20 edições de artigos por minuto por IP excedido; tags podem ser criadas nesta operação.' })
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updatePostDto: UpdatePostDto,
    @Req() request: RequestWithUser,
  ) {
    return this.postsService.update(id, updatePostDto, request.user);
  }

  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Enviar ou substituir capa', description: 'Autor ou administrador envia JPEG, PNG ou WebP de até 5 MB; a imagem é convertida para WebP com até 1920 × 1080 pixels.' })
  @ApiParam({ name: 'id', format: 'uuid', example: 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 201, description: 'Capa atualizada.', schema: { example: { coverImage: '/uploads/post-covers/550e8400-e29b-41d4-a716-446655440000.webp' } } })
  @ApiResponse({ status: 400, description: 'UUID ou imagem inválidos.' })
  @ApiResponse({ status: 401, description: 'Token ausente ou inválido.' })
  @ApiResponse({ status: 403, description: 'Sem permissão.' })
  @ApiResponse({ status: 404, description: 'Artigo não encontrado.' })
  @ApiResponse({ status: 409, description: 'Capa alterada simultaneamente.' })
  @ApiResponse({ status: 413, description: 'Arquivo maior que 5 MB.' })
  @HttpPost(':id/cover-image')
  uploadCover(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: { buffer: Buffer } | undefined, @Req() request: RequestWithUser) {
    if (!file) throw new BadRequestException('Envie uma imagem.');
    return this.postsService.uploadCover(id, file.buffer, request.user);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Remover capa', description: 'Remove a capa do artigo; disponível ao autor ou administrador.' })
  @ApiParam({ name: 'id', format: 'uuid', example: 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22' })
  @ApiResponse({ status: 200, description: 'Capa removida.', schema: { example: { coverImage: null } } })
  @ApiResponse({ status: 400, description: 'UUID inválido.' })
  @ApiResponse({ status: 401, description: 'Token ausente ou inválido.' })
  @ApiResponse({ status: 403, description: 'Sem permissão.' })
  @ApiResponse({ status: 404, description: 'Artigo não encontrado.' })
  @ApiResponse({ status: 409, description: 'Capa alterada simultaneamente.' })
  @Delete(':id/cover-image')
  removeCover(@Param('id', ParseUUIDPipe) id: string, @Req() request: RequestWithUser) {
    return this.postsService.removeCover(id, request.user);
  }

  @ApiRemovePostDoc()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: RequestWithUser,
  ) {
    return this.postsService.remove(id, request.user);
  }
}
