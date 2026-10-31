import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class ConfirmEmailChangeDto {
  @ApiProperty({ description: 'Token recebido no novo endereço de e-mail', minLength: 64, maxLength: 64 })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  token: string;
}
