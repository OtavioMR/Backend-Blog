import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';

export class FindPostsQueryDto extends PaginationQueryDto {
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
    description: 'Filtrar artigos pelo slug da categoria (ex: "noticias") (opcional)',
    example: 'noticias',
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString()
  categorySlug?: string;
}
