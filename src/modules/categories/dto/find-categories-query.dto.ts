import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';

export class FindCategoriesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Termo para busca facilitada ou autocomplete por nome ou slug da categoria (ex: "notic")',
    example: 'notic',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
