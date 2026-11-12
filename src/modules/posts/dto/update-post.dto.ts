import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreatePostDto } from './create-post.dto.js';

export class UpdatePostDto extends PartialType(OmitType(CreatePostDto, ['seriesId'] as const)) {
  @ApiPropertyOptional({ description: 'Permite comentários no post' })
  @IsOptional()
  @IsBoolean()
  commentsEnabled?: boolean;
  @ApiPropertyOptional({
    description: 'Status de ativação do artigo',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
