import { ApiProperty } from '@nestjs/swagger';

export class AuthTokensResponseDto {
  @ApiProperty({
    description: 'Token JWT de acesso (Bearer)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC1...',
  })
  access_token: string;

  @ApiProperty({
    description: 'Tipo do token de autenticação',
    example: 'Bearer',
  })
  token_type: string;

  @ApiProperty({
    description: 'Tempo de expiração do access token em segundos',
    example: 900,
  })
  expires_in: number;
}

export class LogoutResponseDto {
  @ApiProperty({
    description: 'Mensagem de confirmação de encerramento de sessão',
    example: 'Logout realizado com sucesso.',
  })
  message: string;
}
