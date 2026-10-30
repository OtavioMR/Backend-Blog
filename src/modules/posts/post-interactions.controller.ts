import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { applyDecorators } from '@nestjs/common';
import {
  BadRequestResponseDto,
  UnauthorizedResponseDto,
  NotFoundResponseDto,
  InternalServerErrorResponseDto,
} from '../../docs/models/error-response.dto.js';
import {
  PaginatedSavedPostsResponseDto,
  PostInteractionResponseDto,
} from '../../docs/models/post-interaction-response.dto.js';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { PostInteractionsService } from './post-interactions.service.js';

function ApiInteractionErrors() {
  return applyDecorators(
    ApiParam({
      name: 'id',
      format: 'uuid',
      description: 'UUID do post publicado e ativo',
    }),
    ApiResponse({
      status: 400,
      description: 'UUID inválido.',
      type: BadRequestResponseDto,
    }),
    ApiResponse({
      status: 404,
      description: 'Post não encontrado ou indisponível.',
      type: NotFoundResponseDto,
    }),
  );
}

@ApiTags('Interações com posts')
@ApiBearerAuth('JWT-auth')
@ApiResponse({
  status: 401,
  description: 'Token ausente ou inválido.',
  type: UnauthorizedResponseDto,
})
@ApiResponse({
  status: 500,
  description: 'Erro interno.',
  type: InternalServerErrorResponseDto,
})
@UseGuards(JwtAuthGuard)
@Controller('posts')
export class PostInteractionsController {
  constructor(private readonly interactions: PostInteractionsService) {}

  @Get('saved')
  @ApiOperation({ summary: 'Listar posts salvos pelo usuário' })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada de posts publicados e ativos.',
    type: PaginatedSavedPostsResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Parâmetros de paginação inválidos.',
    type: BadRequestResponseDto,
  })
  saved(@Req() request: RequestWithUser, @Query() query: PaginationQueryDto) {
    return this.interactions.saved(request.user.userId, query);
  }

  @Get(':id/interaction')
  @ApiOperation({ summary: 'Consultar curtida, salvo e total de curtidas' })
  @ApiInteractionErrors()
  @ApiResponse({
    status: 200,
    description: 'Estado do usuário e total de curtidas.',
    type: PostInteractionResponseDto,
  })
  status(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: RequestWithUser,
  ) {
    return this.interactions.status(id, request.user.userId);
  }

  @Put(':id/like')
  @HttpCode(204)
  @ApiOperation({ summary: 'Curtir um post' })
  @ApiInteractionErrors()
  @ApiResponse({
    status: 204,
    description: 'Curtida registrada; repetir a operação mantém a curtida.',
  })
  like(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: RequestWithUser,
  ) {
    return this.interactions.set(id, request.user.userId, 'liked', true);
  }

  @Delete(':id/like')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remover curtida' })
  @ApiInteractionErrors()
  @ApiResponse({
    status: 204,
    description: 'Curtida removida ou já inexistente.',
  })
  unlike(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: RequestWithUser,
  ) {
    return this.interactions.set(id, request.user.userId, 'liked', false);
  }

  @Put(':id/save')
  @HttpCode(204)
  @ApiOperation({ summary: 'Salvar um post' })
  @ApiInteractionErrors()
  @ApiResponse({
    status: 204,
    description: 'Post salvo; repetir a operação mantém o post salvo.',
  })
  save(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: RequestWithUser,
  ) {
    return this.interactions.set(id, request.user.userId, 'saved', true);
  }

  @Delete(':id/save')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remover post dos salvos' })
  @ApiInteractionErrors()
  @ApiResponse({
    status: 204,
    description: 'Post removido dos salvos ou já não estava salvo.',
  })
  unsave(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: RequestWithUser,
  ) {
    return this.interactions.set(id, request.user.userId, 'saved', false);
  }
}
