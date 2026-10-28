import { ApiProperty } from '@nestjs/swagger';

export class PostAuthorResponseDto {
  @ApiProperty({
    description: 'Identificador do autor (UUID v4)',
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  })
  id: string;

  @ApiProperty({
    description: 'Nome do autor',
    example: 'Maria Oliveira',
  })
  name: string;
}

export class PostResponseDto {
  @ApiProperty({
    description: 'Identificador único do artigo (UUID v4)',
    example: 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22',
  })
  id: string;

  @ApiProperty({
    description: 'Título do artigo',
    example: 'Introdução ao NestJS com TypeScript',
  })
  title: string;

  @ApiProperty({
    description: 'Conteúdo detalhado do artigo',
    example: 'O NestJS é um framework Node.js progressivo para a construção de aplicativos eficientes e escaláveis...',
  })
  content: string;

  @ApiProperty({
    description: 'Indica se o artigo está publicado',
    example: true,
  })
  published: boolean;

  @ApiProperty({
    description: 'Indica se o artigo está ativo (não desativado)',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Data e hora de publicação ou criação',
    example: '2026-10-28T14:30:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Data e hora da última atualização',
    example: '2026-10-28T14:30:00.000Z',
  })
  updatedAt: Date;

  @ApiProperty({
    description: 'Dados do autor do artigo',
    type: () => PostAuthorResponseDto,
    required: false,
  })
  author?: PostAuthorResponseDto;
}

export class PaginationMetaResponseDto {
  @ApiProperty({
    description: 'Página atual retornada',
    example: 1,
  })
  page: number;

  @ApiProperty({
    description: 'Limite de registros por página',
    example: 10,
  })
  limit: number;

  @ApiProperty({
    description: 'Total de itens encontrados',
    example: 42,
  })
  total: number;

  @ApiProperty({
    description: 'Total de páginas disponíveis',
    example: 5,
  })
  totalPages: number;

  @ApiProperty({
    description: 'Indica se existe uma próxima página',
    example: true,
  })
  hasNextPage: boolean;

  @ApiProperty({
    description: 'Indica se existe uma página anterior',
    example: false,
  })
  hasPreviousPage: boolean;
}

export class PaginatedPostResponseDto {
  @ApiProperty({
    description: 'Lista de artigos da página atual',
    type: [PostResponseDto],
  })
  data: PostResponseDto[];

  @ApiProperty({
    description: 'Metadados de paginação',
    type: PaginationMetaResponseDto,
  })
  meta: PaginationMetaResponseDto;
}
