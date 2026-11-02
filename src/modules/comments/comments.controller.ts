import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiExtraModels,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Throttle } from '@nestjs/throttler';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CommentsService } from './comments.service.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { UpdateCommentDto } from './dto/update-comment.dto.js';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import { ApiPublicRoute } from '../../docs/decorators/public.decorator.js';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface.js';
import { CommentResponseDto, RootCommentResponseDto, PaginatedCommentsResponseDto, PaginatedRepliesResponseDto } from '../../docs/models/comment-response.dto.js';

class PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
class CommentPageQuery extends PageQuery {
  @IsOptional() @IsString() @MaxLength(256) cursor?: string;
}

@ApiTags('Comentários')
@Controller('posts/:postId/comments')
export class PostCommentsController {
  constructor(private readonly service: CommentsService) {}
  @ApiPublicRoute()
  @ApiExtraModels(PaginatedCommentsResponseDto, RootCommentResponseDto)
  @ApiOperation({
    summary: 'Listar comentários do post',
    description:
      'Acesso público. Comentários principais aparecem dos mais recentes aos mais antigos, com até cinco respostas iniciais por conversa. Comentários desativados mantêm o autor e exibem “Comentário excluído”.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
    description: 'Página de comentários principais; padrão 1.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 20,
    description: 'Comentários principais por página; padrão 20, máximo 100.',
  })
  @ApiQuery({ name: 'cursor', required: false, type: String, example: 'start', description: 'Use start na primeira página e nextCursor nas seguintes. Retorna meta.hasMore e meta.nextCursor.' })
  @ApiResponse({ status: 400, description: 'Cursor ou parâmetros inválidos.' })
  @ApiResponse({ status: 409, description: 'A lista mudou durante a consulta; repita a requisição.' })
  @ApiResponse({ status: 403, description: 'Comentários desativados no post.' })
  @ApiResponse({ status: 200, description: 'Comentários e primeiras respostas, com metadados de paginação.', schema: { oneOf: [
    { $ref: getSchemaPath(PaginatedCommentsResponseDto) },
    { type: 'object', properties: { data: { type: 'array', items: { $ref: getSchemaPath(RootCommentResponseDto) } }, meta: { type: 'object', properties: { hasMore: { type: 'boolean', example: true }, nextCursor: { type: 'string', nullable: true } } } } },
  ] } })
  @ApiResponse({ status: 404, description: 'Post não encontrado ou indisponível.' })
  @Get()
  list(
    @Param('postId', ParseUUIDPipe) postId: string,
    @Query() query: CommentPageQuery,
  ) {
    return this.service.list(postId, query.page, query.limit, query.cursor);
  }
  @ApiPublicRoute()
  @ApiOperation({
    summary: 'Listar respostas de um comentário principal',
    description:
      'Acesso público. Informe no parâmetro id o UUID do comentário principal. As respostas são ordenadas das mais antigas às mais recentes.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
    description: 'Página de respostas; padrão 1.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 5,
    description: 'Respostas por página; padrão 5, máximo 100.',
  })
  @ApiResponse({ status: 403, description: 'Comentários desativados no post.' })
  @ApiResponse({ status: 200, description: 'Respostas paginadas.', type: PaginatedRepliesResponseDto })
  @ApiResponse({ status: 404, description: 'Post ou conversa não encontrado.' })
  @Get(':id/replies')
  replies(
    @Param('postId', ParseUUIDPipe) postId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PageQuery,
  ) {
    return this.service.listReplies(postId, id, query.page, query.limit);
  }
  @ApiOperation({
    summary: 'Criar comentário ou resposta',
    description:
      'Exige login. Para comentar no post, envie apenas content. Para responder, informe também replyToId com o UUID de um comentário ativo do mesmo post. Não envie replyToId vazio. Respostas ficam agrupadas no comentário principal.',
  })
  @ApiBody({
    schema: { $ref: getSchemaPath(CreateCommentDto) },
    examples: {
      comentario: {
        summary: 'Novo comentário',
        value: { content: 'Gostei do post!' },
      },
      resposta: {
        summary: 'Resposta a um comentário',
        value: {
          content: 'Também gostei!',
          replyToId: 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Texto inválido, UUID inválido ou comentário respondido indisponível.',
  })
  @ApiResponse({ status: 401, description: 'Token ausente ou inválido.' })
  @ApiResponse({ status: 201, description: 'Comentário criado.', type: CommentResponseDto })
  @ApiResponse({ status: 403, description: 'Comentários desativados no post.' })
  @ApiResponse({ status: 429, description: 'Limite de 5 comentários por minuto por IP excedido.' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  create(
    @Param('postId', ParseUUIDPipe) postId: string,
    @Body() dto: CreateCommentDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.create(postId, dto, req.user);
  }
}

@ApiTags('Comentários')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('comments')
export class CommentsController {
  constructor(private readonly service: CommentsService) {}
  @ApiOperation({
    summary: 'Editar comentário',
    description:
      'O autor ou administrador pode alterar o texto de um comentário ativo; a resposta informa a data da edição.',
  })
  @ApiResponse({
    status: 403,
    description: 'Sem permissão ou comentários desativados no post.',
  })
  @ApiResponse({ status: 200, description: 'Comentário atualizado.', type: CommentResponseDto })
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommentDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.update(id, dto.content, req.user);
  }
  @ApiOperation({
    summary: 'Desativar comentário',
    description:
      'O autor do comentário, o autor do post ou um administrador pode desativá-lo. O registro e as respostas são mantidos; não é possível reativá-lo nem responder diretamente a ele.',
  })
  @ApiResponse({ status: 204, description: 'Comentário desativado.' })
  @ApiResponse({
    status: 403,
    description: 'Sem permissão para desativar o comentário.',
  })
  @HttpCode(204)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) {
    return this.service.remove(id, req.user);
  }
}
