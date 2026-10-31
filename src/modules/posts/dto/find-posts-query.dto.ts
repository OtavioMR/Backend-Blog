import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, ValidateIf, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';

export class FindPostsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Trecho do título ou conteúdo, sem diferenciar maiúsculas ou acentos', example: 'nestjs' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: 'Trecho do nome do autor, sem diferenciar maiúsculas ou acentos', example: 'maria' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  author?: string;

  @ApiPropertyOptional({ description: 'Trecho do nome da categoria, sem diferenciar maiúsculas ou acentos', example: 'tecnologia' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  categoryName?: string;

  @ApiPropertyOptional({
    description: 'Filtrar artigos pelo ID (UUID) da categoria (opcional)',
    example: 'b1a7d654-2a6c-4876-b9b6-79cf021516e8',
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @ValidateIf((o) => o.categoryId !== undefined && o.categoryId !== '')
  @IsUUID('4')
  categoryId?: string;

  @ApiPropertyOptional({
    description:
      'Filtrar artigos pelo slug da categoria (ex: "noticias") (opcional)',
    example: 'noticias',
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString()
  @MaxLength(100)
  categorySlug?: string;

  @ApiPropertyOptional({
    description: 'Filtrar artigos pelo slug da tag',
    example: 'nestjs',
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString()
  @MaxLength(100)
  tagSlug?: string;
}
