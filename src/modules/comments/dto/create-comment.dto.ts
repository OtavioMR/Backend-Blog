import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Matches,
} from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({
    description: 'Texto simples, não vazio, com até 1000 caracteres.',
    example: 'Gostei do post!',
    maxLength: 1000,
  })
  @IsString()
  @MaxLength(1000)
  @Matches(/\S/)
  content: string;

  @ApiPropertyOptional({
    description:
      'Opcional. UUID do comentário ao qual deseja responder. Para um comentário novo, omita este campo; não envie uma string vazia.',
    format: 'uuid',
    example: 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22',
  })
  @IsOptional()
  @IsUUID()
  replyToId?: string;
}
