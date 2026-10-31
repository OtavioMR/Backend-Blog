import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaResponseDto } from './pagination-meta-response.dto.js';

export class PostInteractionResponseDto {
  @ApiProperty({
    description: 'O usuário autenticado curtiu o post',
    example: true,
  })
  liked: boolean;

  @ApiProperty({
    description: 'O usuário autenticado salvou o post',
    example: false,
  })
  saved: boolean;

  @ApiProperty({ description: 'Total de curtidas do post', example: 3 })
  likes: number;
}

export class SavedPostResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22',
  })
  id: string;

  @ApiProperty({ example: 'Introdução ao NestJS' })
  title: string;

  @ApiProperty({ description: 'Resumo do artigo', maxLength: 200 })
  excerpt: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  publishedAt: Date | null;

  @ApiProperty({ example: true })
  published: boolean;

  @ApiProperty({
    description: 'Indica se os comentários estão habilitados',
    example: true,
  })
  commentsEnabled: boolean;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

export class PaginatedSavedPostsResponseDto {
  @ApiProperty({ type: () => [SavedPostResponseDto] })
  data: SavedPostResponseDto[];

  @ApiProperty({ type: () => PaginationMetaResponseDto })
  meta: PaginationMetaResponseDto;
}
