import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';
import { ApiPublicRoute } from '../../docs/decorators/public.decorator.js';
import { NewsletterService } from './newsletter.service.js';

class SubscribeDto {
  @ApiProperty({ example: 'leitor@example.com', maxLength: 255 })
  @IsEmail() @MaxLength(255) email: string;
}
class ConfirmationDto {
  @ApiProperty({ description: 'Token recebido por e-mail, válido por 24 horas.', example: 'a'.repeat(64) })
  @IsString() @Matches(/^[a-f0-9]{64}$/i) token: string;
}
class UnsubscribeDto {
  @ApiProperty({ description: 'Token de cancelamento recebido na newsletter.', example: 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22.' + 'a'.repeat(64) })
  @IsString() @MaxLength(101) token: string;
}
class MessageDto { @ApiProperty({ example: 'Inscrição confirmada.' }) message: string; }

@ApiTags('Newsletter')
@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly newsletter: NewsletterService) {}
  @Post('subscribe') @HttpCode(200) @ApiPublicRoute()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Solicitar inscrição', description: 'Acesso público. Envia token de confirmação válido por 24 horas; a resposta não revela se o endereço já está inscrito. Limite de cinco solicitações por IP por minuto.' })
  @ApiResponse({ status: 200, description: 'Solicitação recebida.', type: MessageDto })
  @ApiResponse({ status: 400, description: 'E-mail inválido.' })
  @ApiResponse({ status: 429, description: 'Limite excedido.' })
  subscribe(@Body() dto: SubscribeDto) { return this.newsletter.subscribe(dto.email); }
  @Post('confirm') @HttpCode(200) @ApiPublicRoute()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Confirmar inscrição', description: 'Acesso público. Token de uso único recebido por e-mail; somente após confirmação o endereço recebe novos artigos.' })
  @ApiResponse({ status: 200, description: 'Inscrição confirmada.', type: MessageDto })
  @ApiResponse({ status: 400, description: 'Token inválido, expirado ou já usado.' })
  @ApiResponse({ status: 429, description: 'Limite excedido.' })
  confirm(@Body() dto: ConfirmationDto) { return this.newsletter.confirm(dto.token); }
  @Post('unsubscribe') @HttpCode(200) @ApiPublicRoute()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Cancelar inscrição', description: 'Acesso público. Informe o token enviado em cada newsletter; o cancelamento remove entregas pendentes e é idempotente.' })
  @ApiResponse({ status: 200, description: 'Inscrição cancelada.', type: MessageDto })
  @ApiResponse({ status: 400, description: 'Token inválido.' })
  @ApiResponse({ status: 429, description: 'Limite excedido.' })
  unsubscribe(@Body() dto: UnsubscribeDto) { return this.newsletter.unsubscribe(dto.token); }
}
