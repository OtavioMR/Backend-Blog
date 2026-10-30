import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationMetaResponseDto } from './pagination-meta-response.dto.js';

export class CategoryResponseDto {
  @ApiProperty({
    description: 'Identificador único da categoria (UUID v4)',
    example: 'b1a7d654-2a6c-4876-b9b6-79cf021516e8',
  })
  id: string;

  @ApiProperty({
    description: 'Nome da categoria',
    example: 'Notícias & Tecnologia',
  })
  name: string;

  @ApiProperty({
    description: 'Slug amigável para URLs e buscas',
    example: 'noticias-tecnologia',
  })
  slug: string;

  @ApiPropertyOptional({
    description: 'Descrição da categoria',
    example: 'Artigos sobre as últimas novidades do mundo da tecnologia.',
    nullable: true,
  })
  description: string | null;

  @ApiProperty({
    description: 'Indica se a categoria está ativa',
    example: true,
  })
  isActive: boolean;

  @ApiPropertyOptional({
    description:
      'Identificador do administrador que criou a categoria (UUID v4)',
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    nullable: true,
  })
  creatorId?: string | null;

  @ApiProperty({
    description: 'Data e hora de criação',
    example: '2026-10-28T14:30:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Data e hora da última atualização',
    example: '2026-10-28T14:30:00.000Z',
  })
  updatedAt: Date;
}

export class PaginatedCategoryResponseDto {
  @ApiProperty({
    description: 'Lista de categorias da página atual',
    type: () => [CategoryResponseDto],
  })
  data: CategoryResponseDto[];

  @ApiProperty({
    description: 'Metadados de paginação',
    type: () => PaginationMetaResponseDto,
  })
  meta: PaginationMetaResponseDto;
}
