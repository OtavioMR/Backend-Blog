import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { CategoryResponseDto } from './category-response.dto.js';
import { TagResponseDto } from './tag-response.dto.js';
import { PaginationMetaResponseDto } from './pagination-meta-response.dto.js';

export { PaginationMetaResponseDto };

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

export class SeriesNeighborDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'meu-conto' }) slug: string;
}

export class PostSeriesNavigationDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Histórias da Rua do Farol' }) title: string;
  @ApiProperty({ example: 3 }) totalParts: number;
  @ApiProperty({ type: () => SeriesNeighborDto, nullable: true }) previous: SeriesNeighborDto | null;
  @ApiProperty({ type: () => SeriesNeighborDto, nullable: true }) next: SeriesNeighborDto | null;
}

export class PostResponseDto {
  @ApiPropertyOptional({ type: 'object', nullable: true, description: 'Somente consulta privada do titular e criação de capítulo. Vínculo existente preservado no PATCH.', properties: { id: { type: 'string', format: 'uuid' }, title: { type: 'string' } } })
  seriesContext?: { id: string; title: string } | null;
  @ApiPropertyOptional({ type: 'object', description: 'Somente discovery=true: card da série representada por este conto, com capa própria, autor, contagem pública, classificação máxima e quantidade de capítulos com IA.', properties: { id: { type: 'string', format: 'uuid' }, title: { type: 'string' }, description: { type: 'string' }, coverImage: { type: 'string', nullable: true }, aiCoverDeclaration: { type: 'string' }, publishedCount: { type: 'integer' }, contentRating: { type: 'string' }, aiTextCount: { type: 'integer' }, author: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } } } })
  discoverySeries?: object;
  @ApiProperty({ type: () => PostSeriesNavigationDto, nullable: true, required: false, description: 'Navegação entre contos públicos da série; presente no detalhe de contos publicados.' })
  series?: PostSeriesNavigationDto | null;
  @ApiProperty({
    description: 'Identificador único do conto (UUID v4)',
    example: 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22',
  })
  id: string;

  @ApiProperty({ description: 'Slug estável e único do conto', example: 'a-casa-que-acendia-sozinha' })
  slug: string;

  @ApiProperty({
    description: 'Título do conto',
    example: 'A casa que acendia sozinha',
  })
  title: string;

  @ApiProperty({
    description: 'Conteúdo detalhado do conto',
    example:
      'À meia-noite, a casa do outro lado da rua acendeu a luz pela primeira vez em dez anos.',
  })
  content: string;

  @ApiProperty({ description: 'Tempo estimado de leitura em minutos, calculado a 200 palavras por minuto e arredondado para cima (mínimo de 1 minuto).', example: 3, minimum: 1 })
  readingTimeMinutes: number;

  @ApiProperty({ description: 'Caminho público da imagem de capa, ou null.', type: String, nullable: true, example: '/uploads/post-covers/550e8400-e29b-41d4-a716-446655440000.webp' })
  coverImage: string | null;

  @ApiProperty({ description: 'Descrição de apresentação do conto, editável pelo autor', maxLength: 500 })
  excerpt: string;

  @ApiProperty({ description: 'Data da última publicação; nula para rascunhos.', type: String, format: 'date-time', nullable: true })
  publishedAt: Date | null;

  @ApiProperty({
    description: 'Indica se o conto está publicado',
    example: true,
  })
  published: boolean;

  @ApiProperty({ enum: ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'], example: 'DRAFT' })
  reviewStatus: string;

  @ApiProperty({ description: 'Data da publicação agendada, ou null quando não há agendamento. Pode estar ausente em listagens públicas.', type: String, format: 'date-time', nullable: true, required: false, example: '2099-01-01T12:00:00Z' })
  scheduledAt?: Date | null;

  @ApiProperty({
    description: 'Indica se o conto está ativo (não desativado)',
    example: true,
  })
  isActive: boolean;

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

  @ApiProperty({
    description: 'Dados do autor do conto',
    type: () => PostAuthorResponseDto,
    required: false,
  })
  author?: PostAuthorResponseDto;

  @ApiProperty({
    description: 'Categorias associadas ao conto',
    type: () => [CategoryResponseDto],
    required: false,
  })
  categories?: CategoryResponseDto[];

  @ApiProperty({
    description: 'Tags associadas ao conto',
    type: () => [TagResponseDto],
  })
  tags: TagResponseDto[];
}

export class PostSummaryResponseDto extends OmitType(PostResponseDto, ['content', 'series'] as const) {}

export class PaginatedPostResponseDto {
  @ApiProperty({
    description: 'Lista de contos da página atual',
    type: () => [PostSummaryResponseDto],
  })
  data: PostSummaryResponseDto[];

  @ApiProperty({
    description: 'Metadados de paginação',
    type: () => PaginationMetaResponseDto,
  })
  meta: PaginationMetaResponseDto;
}
