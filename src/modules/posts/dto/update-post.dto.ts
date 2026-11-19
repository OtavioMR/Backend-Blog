import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreatePostDto } from './create-post.dto.js';

export class UpdatePostDto extends PartialType(OmitType(CreatePostDto, ['seriesId'] as const)) {
  @ApiPropertyOptional({ description: 'Permite comentários no conto' })
  @IsOptional()
  @IsBoolean()
  commentsEnabled?: boolean;
  @ApiPropertyOptional({
    description: 'Status de ativação do conto',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
