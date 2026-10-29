import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreatePostDto } from './create-post.dto.js';

export class UpdatePostDto extends PartialType(CreatePostDto) {
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
