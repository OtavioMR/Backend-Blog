import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePostDto {
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

  @ApiPropertyOptional({ description: 'Descrição apresentada abaixo do título e nas listagens; gerada a partir do conteúdo quando omitida na criação.', maxLength: 500, example: 'Uma apresentação do artigo.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
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
}
