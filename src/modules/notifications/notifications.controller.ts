import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { PaginationMetaResponseDto } from '../../docs/models/pagination-meta-response.dto.js';
import { PostAuthorResponseDto } from '../../docs/models/post-response.dto.js';
import { NotificationsService } from './notifications.service.js';

class NotificationDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: ['post_like', 'comment', 'reply', 'comment_like', 'follow'] }) type: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) postId: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) commentId: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) readAt: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
  @ApiProperty({ type: () => PostAuthorResponseDto }) actor: PostAuthorResponseDto;
}
class NotificationListDto {
  @ApiProperty({ type: () => [NotificationDto] }) data: NotificationDto[];
  @ApiProperty({ type: () => PaginationMetaResponseDto }) meta: PaginationMetaResponseDto;
  @ApiProperty({ example: 2 }) unread: number;
}
@ApiTags('Notificações')
@ApiBearerAuth('JWT-auth')
@ApiResponse({ status: 401, description: 'Token ausente ou inválido.' })
@ApiResponse({ status: 429, description: 'Limite de requisições por IP excedido.' })
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}
  @Get()
  @ApiOperation({ summary: 'Listar minhas notificações', description: 'Inclui número total de notificações não lidas. Eventos: curtidas em artigos e comentários, comentários, respostas e seguidores; ações próprias não geram notificação.' })
  @ApiResponse({ status: 200, description: 'Notificações paginadas.', type: NotificationListDto })
  @ApiResponse({ status: 400, description: 'Paginação inválida.' })
  list(@Req() req: RequestWithUser, @Query() query: PaginationQueryDto) { return this.service.list(req.user.userId, query); }
  @Patch('read-all') @HttpCode(204)
  @ApiOperation({ summary: 'Marcar todas as minhas notificações como lidas' })
  @ApiResponse({ status: 204, description: 'Notificações marcadas como lidas.' })
  readAll(@Req() req: RequestWithUser) { return this.service.readAll(req.user.userId); }
  @Patch(':id/read') @HttpCode(204)
  @ApiOperation({ summary: 'Marcar uma notificação como lida', description: 'Operação idempotente, restrita ao destinatário.' })
  @ApiParam({ name: 'id', format: 'uuid', example: 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22' })
  @ApiResponse({ status: 204, description: 'Notificação marcada como lida.' })
  @ApiResponse({ status: 400, description: 'UUID inválido.' })
  @ApiResponse({ status: 404, description: 'Notificação não encontrada.' })
  read(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) { return this.service.read(id, req.user.userId); }
}
