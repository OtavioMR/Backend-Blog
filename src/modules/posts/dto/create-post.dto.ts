import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePostDto {
  @ApiPropertyOptional({ description: 'Série do próprio autor: cria artigo e vínculo na mesma transação, na última posição (até 100 capítulos). Omitir para texto independente.', format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  seriesId?: string;

  @ApiProperty({
    description: 'Título do artigo',
    example: 'Como estruturar projetos no NestJS',
    minLength: 3,
    maxLength: 150,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(150)
  title: string;

  @ApiProperty({
    description: 'Conteúdo detalhado do artigo',
    example:
      'Neste artigo vamos discutir padrões arquiteturais no NestJS e melhores práticas de organização de código.',
    minLength: 10,
    maxLength: 50000,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(50000)
  content: string;

  @ApiPropertyOptional({ description: 'Descrição apresentada abaixo do título e nas listagens; gerada a partir do conteúdo quando omitida na criação.', maxLength: 200, example: 'Uma apresentação do artigo.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  excerpt?: string;

  @ApiPropertyOptional({
    description: 'Status de publicação do artigo',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  published?: boolean;

  @ApiPropertyOptional({ description: 'Agende um rascunho com data ISO 8601 futura e fuso explícito (Z ou offset, por exemplo -03:00). Não combine com published: true. No PATCH, envie null para cancelar; omita para manter a data.', type: String, format: 'date-time', example: '2099-01-01T12:00:00Z', nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  scheduledAt?: string | null;

  @ApiPropertyOptional({
    description: 'Lista de IDs (UUID) das categorias vinculadas ao artigo',
    example: ['b1a7d654-2a6c-4876-b9b6-79cf021516e8'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  categoryIds?: string[];

  @ApiPropertyOptional({
    description:
      'Nomes das tags. Tags inexistentes são criadas automaticamente.',
    example: ['NestJS', 'PostgreSQL'],
    type: [String],
    maxItems: 10,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(50, { each: true })
  tagNames?: string[];

  @ApiPropertyOptional({
    description: 'Classificação indicativa do artigo (LIVRE, 10+, 12+, 14+, 16+, 18+)',
    example: 'LIVRE',
    enum: ['LIVRE', '10+', '12+', '14+', '16+', '18+'],
    default: 'LIVRE',
  })
  @IsOptional()
  @IsIn(['LIVRE', '10+', '12+', '14+', '16+', '18+'])
  contentRating?: string;

  @ApiPropertyOptional({
    description: 'Declaração de uso de IA no texto (HUMAN_ONLY, HUMAN_WITH_AI, PARTIAL_AI, FULL_AI)',
    example: 'HUMAN_ONLY',
    enum: ['HUMAN_ONLY', 'HUMAN_WITH_AI', 'PARTIAL_AI', 'FULL_AI'],
  })
  @IsOptional()
  @IsIn(['HUMAN_ONLY', 'HUMAN_WITH_AI', 'PARTIAL_AI', 'FULL_AI'])
  aiTextDeclaration?: string;

  @ApiPropertyOptional({
    description: 'Declaração de uso de IA na imagem de capa (HUMAN_OR_PHOTO, AI_GENERATED, HYBRID, NONE)',
    example: 'NONE',
    enum: ['HUMAN_OR_PHOTO', 'AI_GENERATED', 'HYBRID', 'NONE'],
  })
  @IsOptional()
  @IsIn(['HUMAN_OR_PHOTO', 'AI_GENERATED', 'HYBRID', 'NONE'])
  aiCoverDeclaration?: string;

  @ApiPropertyOptional({
    description: 'Declaração de titularidade ou autorização de direitos autorais para texto e capa',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  authorCopyrightConfirmed?: boolean;
}
