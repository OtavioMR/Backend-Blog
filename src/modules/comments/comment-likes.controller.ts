import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface.js';
import { CommentLikesService } from './comment-likes.service.js';

class CommentLikeStatusDto {
  @ApiProperty({ example: true }) liked: boolean;
  @ApiProperty({ example: 3 }) likes: number;
}

@ApiTags('Curtidas em comentários')
@ApiBearerAuth('JWT-auth')
@ApiParam({ name: 'id', format: 'uuid', example: 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22' })
@ApiResponse({ status: 400, description: 'UUID inválido.' })
@ApiResponse({ status: 401, description: 'Token ausente ou inválido.' })
@ApiResponse({ status: 404, description: 'Comentário indisponível.' })
@ApiResponse({ status: 429, description: 'Limite de requisições por IP excedido.' })
@UseGuards(JwtAuthGuard)
@Controller('comments/:id/like')
export class CommentLikesController {
  constructor(private readonly service: CommentLikesService) {}
  @Get()
  @ApiOperation({ summary: 'Consultar curtidas do comentário' })
  @ApiResponse({ status: 200, description: 'Total e estado do usuário.', type: CommentLikeStatusDto })
  status(@Param('id', ParseUUIDPipe) id: string, @Req() request: RequestWithUser) { return this.service.status(id, request.user.userId); }
  @Put()
  @HttpCode(204)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Curtir comentário', description: 'Operação idempotente, limitada a 30 solicitações por minuto por IP.' })
  @ApiResponse({ status: 204, description: 'Curtida registrada.' })
  @ApiResponse({ status: 429, description: 'Limite excedido.' })
  like(@Param('id', ParseUUIDPipe) id: string, @Req() request: RequestWithUser) { return this.service.set(id, request.user.userId, true); }
  @Delete()
  @HttpCode(204)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Remover curtida', description: 'Operação idempotente, limitada a 30 solicitações por minuto por IP.' })
  @ApiResponse({ status: 204, description: 'Curtida removida.' })
  @ApiResponse({ status: 429, description: 'Limite excedido.' })
  unlike(@Param('id', ParseUUIDPipe) id: string, @Req() request: RequestWithUser) { return this.service.set(id, request.user.userId, false); }
}
