import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';

export class FindTagsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Termo para autocomplete por nome ou slug da tag',
    example: 'noti',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
