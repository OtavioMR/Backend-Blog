import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class Verify2faDto {
  @ApiProperty({
    description: 'Desafio temporário de pré-autenticação emitido na primeira etapa do login.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @IsNotEmpty()
  preAuthToken: string;

  @ApiProperty({
    description: 'Código de 6 dígitos gerado pelo Google Authenticator ou código de recuperação de uso único.',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  code: string;
}
