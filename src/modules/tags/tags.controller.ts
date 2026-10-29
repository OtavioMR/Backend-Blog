import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TagsService } from './tags.service.js';
import {
  PaginatedTagResponseDto,
  TagResponseDto,
} from '../../docs/models/tag-response.dto.js';
import { ApiPublicRoute } from '../../docs/decorators/public.decorator.js';
import { FindTagsQueryDto } from './dto/find-tags-query.dto.js';

@ApiTags('Tags')
@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @ApiOperation({ summary: 'Listar tags e buscar sugestões por nome ou slug' })
  @ApiPublicRoute()
  @ApiQuery({
    name: 'search',
    required: false,
    example: 'noti',
    description: 'Texto parcial para autocomplete',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({ status: 200, type: PaginatedTagResponseDto })
  @Get()
  findAll(@Query() query: FindTagsQueryDto) {
    return this.tagsService.findAll(query);
  }

  @ApiOperation({ summary: 'Buscar tag pelo slug' })
  @ApiPublicRoute()
  @ApiResponse({ status: 200, type: TagResponseDto })
  @ApiResponse({ status: 404, description: 'Tag não encontrada.' })
  @Get(':slug')
  findOne(@Param('slug') slug: string) {
    return this.tagsService.findBySlug(slug);
  }
}
