import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class ConfirmEmailChangeDto {
  @ApiProperty({ description: 'Token hexadecimal recebido por e-mail', minLength: 64, maxLength: 64, example: 'a'.repeat(64) })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  token: string;
}
