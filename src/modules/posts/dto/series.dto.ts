import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsISO8601, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';

export class CreateSeriesDto {
  @ApiPropertyOptional({ enum: ['NONE', 'HUMAN_OR_PHOTO', 'AI_GENERATED', 'HYBRID'], description: 'Declaração do autor sobre a capa própria da série; não se aplica às capas dos capítulos.' })
  @IsOptional() @IsIn(['NONE', 'HUMAN_OR_PHOTO', 'AI_GENERATED', 'HYBRID']) aiCoverDeclaration?: string;
  @ApiProperty({ example: 'Introducao ao NestJS', maxLength: 150 })
  @IsString() @IsNotEmpty() @MaxLength(150) title: string;
  @ApiPropertyOptional({ example: 'Uma serie sobre arquitetura.', maxLength: 1000 })
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}
export class UpdateSeriesDto {
  @ApiPropertyOptional({ enum: ['NONE', 'HUMAN_OR_PHOTO', 'AI_GENERATED', 'HYBRID'] })
  @IsOptional() @IsIn(['NONE', 'HUMAN_OR_PHOTO', 'AI_GENERATED', 'HYBRID']) aiCoverDeclaration?: string;
  @ApiPropertyOptional({ description: 'Versão lida pelo cliente; divergência retorna 409.', format: 'date-time' })
  @IsOptional() @IsISO8601() expectedUpdatedAt?: string;
  @ApiPropertyOptional({ example: 'Introducao ao NestJS', maxLength: 150 })
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsString() @IsNotEmpty() @MaxLength(150) title?: string;
  @ApiPropertyOptional({ example: 'Uma serie sobre arquitetura.', maxLength: 1000 })
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsString() @MaxLength(1000) description?: string;
}
export class SeriesItemsDto {
  @ApiPropertyOptional({ description: 'Versão lida pelo cliente; divergência retorna 409 sem alterar vínculos.', format: 'date-time' })
  @IsOptional() @IsISO8601() expectedUpdatedAt?: string;
  @ApiProperty({ description: 'Lista completa e ordenada de IDs dos artigos; lista vazia remove todos.', type: [String], maxItems: 100, example: ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'] })
  @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsUUID('4', { each: true }) postIds: string[];
}

export class FindSeriesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Busca literal por título ou descrição da série.', maxLength: 100 })
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @ApiPropertyOptional({ description: 'Filtrar séries de um autor.', format: 'uuid' })
  @IsOptional() @IsUUID('4') authorId?: string;
}

export class OwnPostsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Busca literal por título.', maxLength: 100 })
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @ApiPropertyOptional({ enum: ['all', 'published', 'draft', 'pending'] })
  @IsOptional() @IsIn(['all', 'published', 'draft', 'pending']) status?: string;
  @ApiPropertyOptional({ enum: ['all', 'standalone', 'chapter'] })
  @IsOptional() @IsIn(['all', 'standalone', 'chapter']) kind?: string;
}
