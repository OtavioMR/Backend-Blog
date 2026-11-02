import { Body, Controller, Get, Header, HttpCode, Post, Query } from '@nestjs/common';
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
  @Get('confirm') @ApiPublicRoute() @Header('Content-Type', 'text/html; charset=utf-8')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Confirmar inscrição pelo link do e-mail', description: 'Consome o token de confirmação de uso único, válido por 24 horas, e mostra o resultado no navegador. Acesso público.' })
  @ApiResponse({ status: 200, description: 'Inscrição confirmada.', content: { 'text/html': { schema: { type: 'string', example: '<p>Inscrição confirmada.</p>' } } } })
  @ApiResponse({ status: 400, description: 'Token inválido, expirado ou já utilizado.' })
  @ApiResponse({ status: 429, description: 'Limite excedido.' })
  async confirmLink(@Query() dto: ConfirmationDto) {
    await this.newsletter.confirm(dto.token);
    return '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Newsletter</title><p>Inscrição confirmada.</p></html>';
  }
  @Get('unsubscribe') @ApiPublicRoute() @Header('Content-Type', 'text/html; charset=utf-8')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Cancelar inscrição pelo link do e-mail', description: 'Cancela a inscrição pelo token recebido na newsletter e mostra o resultado no navegador. Operação idempotente. Acesso público.' })
  @ApiResponse({ status: 200, description: 'Inscrição cancelada.', content: { 'text/html': { schema: { type: 'string', example: '<p>Inscrição cancelada.</p>' } } } })
  @ApiResponse({ status: 400, description: 'Token inválido.' })
  @ApiResponse({ status: 429, description: 'Limite excedido.' })
  async unsubscribeLink(@Query() dto: UnsubscribeDto) {
    await this.newsletter.unsubscribe(dto.token);
    return '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Newsletter</title><p>Inscrição cancelada.</p></html>';
  }
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
