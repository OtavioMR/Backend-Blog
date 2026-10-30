import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
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

  @ApiPropertyOptional({
    description: 'Status de publicação do artigo',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  published?: boolean;

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
