import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsNotEmpty,
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
    example: 'Neste artigo vamos discutir padrões arquiteturais no NestJS e melhores práticas de organização de código.',
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
}