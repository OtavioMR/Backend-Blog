import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiPublicRoute } from '../../docs/decorators/public.decorator.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { PaginationMetaResponseDto } from '../../docs/models/pagination-meta-response.dto.js';
import { PostViewsService } from './post-views.service.js';

class ViewResultDto {
  @ApiProperty({ example: true }) counted: boolean;
  @ApiProperty({ example: 12, description: 'Total acumulado de visualizações deduplicadas.' }) total: number;
}
class TrendingPostDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'meu-artigo' }) slug: string;
  @ApiProperty({ example: 'Meu artigo' }) title: string;
  @ApiProperty({ example: 'Resumo' }) excerpt: string;
  @ApiProperty({ example: 12 }) views: number;
}
class TrendingResponseDto {
  @ApiProperty({ type: () => [TrendingPostDto] }) data: TrendingPostDto[];
  @ApiProperty({ type: () => PaginationMetaResponseDto }) meta: PaginationMetaResponseDto;
}

@ApiTags('Visualizações')
@Controller('posts')
export class PostViewsController {
  constructor(private readonly service: PostViewsService) {}

  @Get('trending')
  @ApiPublicRoute()
  @ApiOperation({ summary: 'Artigos em alta', description: 'Artigos públicos com visualizações nos últimos sete dias UTC, incluindo hoje, ordenados por visualizações, data de publicação e ID. Acesso público.' })
  @ApiResponse({ status: 200, description: 'Lista paginada.', type: TrendingResponseDto })
  @ApiResponse({ status: 400, description: 'Paginação inválida.' })
  @ApiResponse({ status: 429, description: 'Limite de requisições por IP excedido.' })
  trending(@Query() query: PaginationQueryDto) { return this.service.trending(query); }

  @Post(':id/views')
  @HttpCode(200)
  @ApiPublicRoute()
  @ApiOperation({ summary: 'Registrar visualização', description: 'Acesso público. Conta uma visualização por IP e artigo em cada dia UTC. Repetições retornam counted: false.' })
  @ApiParam({ name: 'id', format: 'uuid', example: 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22' })
  @ApiResponse({ status: 200, description: 'Resultado do registro.', type: ViewResultDto })
  @ApiResponse({ status: 400, description: 'UUID inválido.' })
  @ApiResponse({ status: 404, description: 'Artigo público não encontrado.' })
  @ApiResponse({ status: 429, description: 'Limite de requisições excedido.' })
  record(@Param('id', ParseUUIDPipe) id: string, @Req() request: Request) { return this.service.record(id, request.ip ?? ''); }
}
