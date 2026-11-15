import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guard/roles.guard.js';
import { UserRole } from '../users/enums/user.enum.js';
import { MailQueueService } from './mail-queue.service.js';

@ApiTags('Operação de e-mails')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/mail-queue')
export class MailQueueController {
  constructor(private readonly queue: MailQueueService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Consultar a fila persistente de e-mails', description: 'Somente administradores com requisitos de segurança completos. Retorna contagens e idade máxima por estado, sem destinatários ou payloads.' })
  @ApiResponse({ status: 200, description: 'Contagens por estado.', schema: { example: [{ status: 'pending', total: 2, oldest_age_seconds: 10 }] } })
  @ApiResponse({ status: 401, description: 'Sessão inválida ou ausente.' })
  @ApiResponse({ status: 403, description: 'Permissão administrativa necessária.' })
  @ApiResponse({ status: 429, description: 'Limite de requisições excedido.' })
  @ApiResponse({ status: 503, description: 'Controle de requisições indisponível.' })
  statistics() { return this.queue.statistics(); }
}
