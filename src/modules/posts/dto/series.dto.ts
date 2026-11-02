import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

export class CreateSeriesDto {
  @ApiProperty({ example: 'Introducao ao NestJS', maxLength: 150 })
  @IsString() @IsNotEmpty() @MaxLength(150) title: string;
  @ApiPropertyOptional({ example: 'Uma serie sobre arquitetura.', maxLength: 1000 })
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}
export class UpdateSeriesDto {
  @ApiPropertyOptional({ example: 'Introducao ao NestJS', maxLength: 150 })
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsString() @IsNotEmpty() @MaxLength(150) title?: string;
  @ApiPropertyOptional({ example: 'Uma serie sobre arquitetura.', maxLength: 1000 })
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsString() @MaxLength(1000) description?: string;
}
export class SeriesItemsDto {
  @ApiProperty({ description: 'Lista completa e ordenada de IDs dos artigos; lista vazia remove todos.', type: [String], maxItems: 100, example: ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'] })
  @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsUUID('4', { each: true }) postIds: string[];
}
