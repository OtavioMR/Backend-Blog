import { ApiProperty } from '@nestjs/swagger';

export class AuthResponseDto {
  @ApiProperty({
    description: 'Token JWT de acesso (Bearer)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  access_token: string;

  @ApiProperty({
    description: 'Tipo do token retornado',
    example: 'Bearer',
  })
  token_type: string;

  @ApiProperty({
    description: 'Tempo de expiração do access token em segundos',
    example: 900,
  })
  expires_in: number;
}
