import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

export class ResendVerificationDto {
  @ApiProperty({ description: 'E-mail da conta que precisa de confirmação', example: 'joao.silva@example.com', maxLength: 255 })
  @IsEmail()
  @MaxLength(255)
  email: string;
}
